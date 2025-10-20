import { SpanKind, context } from '@opentelemetry/api';
import {
  type ArvoEvent,
  ArvoExecution,
  ArvoExecutionSpanKind,
  ArvoOpenTelemetry,
  ArvoOrchestrationSubject,
  type ArvoOrchestratorContract,
  EventDataschemaUtil,
  type InferArvoEvent,
  OpenInference,
  OpenInferenceSpanKind,
  type VersionedArvoContract,
  currentOpenTelemetryHeaders,
  isWildCardArvoSematicVersion,
  logToSpan,
} from 'arvo-core';
import type { z } from 'zod';
import { processRawEventsIntoEmittables } from '../ArvoOrchestrationUtils/createEmitableEvent';
import { TransactionViolation, TransactionViolationCause } from '../ArvoOrchestrationUtils/error';
import { handleOrchestrationErrors } from '../ArvoOrchestrationUtils/handlerErrors';
import type IArvoEventHandler from '../IArvoEventHandler';
import type { IMachineMemory } from '../MachineMemory/interface';
import { SyncEventResource } from '../SyncEventResource/index';
import type { AcquiredLockStatusType } from '../SyncEventResource/types';
import { ConfigViolation, ExecutionViolation } from '../errors';
import type { ArvoEventHandlerOpenTelemetryOptions } from '../types';
import type { ArvoResumableHandler, ArvoResumableState } from './types';

/**
 * ArvoResumable - A stateful orchestration handler for managing distributed workflows
 *
 * ArvoResumable provides a handler-based approach to workflow orchestration that prioritizes
 * explicit control and simplicity over declarative abstractions. It excels at straightforward
 * request-response patterns and linear workflows while maintaining full type safety and
 * contract validation throughout the execution lifecycle.
 *
 * This class addresses fundamental issues in event-driven architecture including:
 * - Contract management with runtime validation and type safety
 * - Graduated complexity allowing simple workflows to remain simple
 * - Unified event handling across initialization and service responses
 * - Explicit state management without hidden abstractions
 *
 * Key capabilities:
 * - Handler-based workflow orchestration with explicit state control
 * - Contract-driven event validation with runtime schema enforcement
 * - Distributed resource locking for transaction safety
 * - Comprehensive OpenTelemetry integration for observability
 * - Automatic error handling with system error event generation
 * - Support for orchestrator chaining and nested workflow patterns
 * - Domain-based event routing and organization
 *
 * Unlike state machine approaches, ArvoResumable uses imperative handler functions
 * that provide direct control over workflow logic. This makes debugging easier and
 * reduces the learning curve for teams familiar with traditional programming patterns.
 *
 * @see {@link createArvoResumable} Factory function for creating instances
 * @see {@link ArvoResumableHandler} Handler interface documentation
 * @see {@link ArvoResumableState} State structure documentation
 */
export class ArvoResumable<
  TMemory extends Record<string, any> = Record<string, any>,
  TSelfContract extends ArvoOrchestratorContract = ArvoOrchestratorContract,
  TServiceContract extends Record<string, VersionedArvoContract<any, any>> = Record<
    string,
    VersionedArvoContract<any, any>
  >,
> implements IArvoEventHandler
{
  readonly executionunits: number;
  readonly syncEventResource: SyncEventResource<ArvoResumableState<TMemory>>;
  readonly source: string;
  readonly handler: ArvoResumableHandler<ArvoResumableState<TMemory>, TSelfContract, TServiceContract>;
  readonly systemErrorDomain?: (string | null)[] = [];

  readonly contracts: {
    self: TSelfContract;
    services: TServiceContract;
  };

  get requiresResourceLocking(): boolean {
    return this.syncEventResource.requiresResourceLocking;
  }

  get memory(): IMachineMemory<ArvoResumableState<TMemory>> {
    return this.syncEventResource.memory;
  }

  get domain(): string | null {
    return this.contracts.self.domain;
  }

  constructor(param: {
    contracts: {
      self: TSelfContract;
      services: TServiceContract;
    };
    executionunits: number;
    memory: IMachineMemory<ArvoResumableState<TMemory>>;
    requiresResourceLocking?: boolean;
    handler: ArvoResumableHandler<ArvoResumableState<TMemory>, TSelfContract, TServiceContract>;
    systemErrorDomain?: (string | null)[];
  }) {
    this.executionunits = param.executionunits;
    this.source = param.contracts.self.type;
    this.syncEventResource = new SyncEventResource(param.memory, param.requiresResourceLocking ?? true);
    this.contracts = param.contracts;
    this.handler = param.handler;
    this.systemErrorDomain = param.systemErrorDomain;
  }

  protected validateInput(event: ArvoEvent): {
    contractType: 'self' | 'service';
  } {
    let resolvedContract: VersionedArvoContract<any, any> | null = null;
    let contractType: 'self' | 'service';

    const parsedEventDataSchema = EventDataschemaUtil.parse(event);
    if (!parsedEventDataSchema) {
      throw new ExecutionViolation(
        `Event dataschema resolution failed: Unable to parse dataschema='${event.dataschema}' for event(id='${event.id}', type='${event.type}'). This makes the event opaque and does not allow contract resolution`,
      );
    }

    if (event.type === this.contracts.self.type) {
      contractType = 'self';
      resolvedContract = this.contracts.self.version(parsedEventDataSchema.version);
    } else {
      contractType = 'service';
      for (const contract of Object.values(this.contracts.services)) {
        if (resolvedContract) break;
        for (const emitType of [...contract.emitList, contract.systemError]) {
          if (resolvedContract) break;
          if (event.type === emitType.type) {
            resolvedContract = contract;
          }
        }
      }
    }

    if (!resolvedContract) {
      throw new ConfigViolation(
        `Contract resolution failed: No matching contract found for event (id='${event.id}', type='${event.type}')`,
      );
    }

    logToSpan({
      level: 'INFO',
      message: `Dataschema resolved: ${event.dataschema} matches contract(uri='${resolvedContract.uri}', version='${resolvedContract.version}')`,
    });
    if (parsedEventDataSchema.uri !== resolvedContract.uri) {
      throw new Error(
        `Contract URI mismatch: ${contractType} Contract(uri='${resolvedContract.uri}', type='${resolvedContract.accepts.type}') does not match Event(dataschema='${event.dataschema}', type='${event.type}')`,
      );
    }
    if (
      !isWildCardArvoSematicVersion(parsedEventDataSchema.version) &&
      parsedEventDataSchema.version !== resolvedContract.version
    ) {
      throw new Error(
        `Contract version mismatch: ${contractType} Contract(version='${resolvedContract.version}', type='${resolvedContract.accepts.type}', uri=${resolvedContract.uri}) does not match Event(dataschema='${event.dataschema}', type='${event.type}')`,
      );
    }

    const validationSchema: z.AnyZodObject =
      contractType === 'self'
        ? resolvedContract.accepts.schema
        : (resolvedContract.emits[event.type] ?? resolvedContract.systemError.schema);

    validationSchema.parse(event.data);
    return { contractType };
  }

  /**
   * Executes the orchestration workflow for an incoming event
   *
   * @param event - The triggering event to process
   * @param opentelemetry - OpenTelemetry configuration for trace inheritance
   *
   * @returns Object containing domained events
   *
   * @throws {TransactionViolation} When distributed lock acquisition fails
   * @throws {ConfigViolation} When handler resolution or contract validation fails
   * @throws {ContractViolation} When event schema validation fails
   * @throws {ExecutionViolation} When workflow execution encounters critical errors
   */
  async execute(
    event: ArvoEvent,
    opentelemetry: ArvoEventHandlerOpenTelemetryOptions,
  ): Promise<{
    events: ArvoEvent[];
  }> {
    return ArvoOpenTelemetry.getInstance().startActiveSpan({
      name: `Resumable<${this.contracts.self.uri}>@<${event.type}>`,
      spanOptions: {
        kind: SpanKind.PRODUCER,
        attributes: {
          [ArvoExecution.ATTR_SPAN_KIND]: ArvoExecutionSpanKind.ORCHESTRATOR,
          [OpenInference.ATTR_SPAN_KIND]: OpenInferenceSpanKind.CHAIN,
          ...Object.fromEntries(
            Object.entries(event.otelAttributes).map(([key, value]) => [`to_process.0.${key}`, value]),
          ),
        },
      },
      context:
        opentelemetry.inheritFrom === 'EVENT'
          ? {
              inheritFrom: 'TRACE_HEADERS',
              traceHeaders: {
                traceparent: event.traceparent,
                tracestate: event.tracestate,
              },
            }
          : {
              inheritFrom: 'CONTEXT',
              context: context.active(),
            },
      disableSpanManagement: true,
      fn: async (span) => {
        logToSpan({
          level: 'INFO',
          message: `Resumable function starting execution for ${event.type} on subject ${event.subject}`,
        });
        const otelHeaders = currentOpenTelemetryHeaders();
        let orchestrationParentSubject: string | null = null;
        let acquiredLock: AcquiredLockStatusType | null = null;
        let initEventId: string | null = null;
        try {
          ///////////////////////////////////////////////////////////////
          // Subject resolution, handler resolution and input validation
          ///////////////
          // ////////////////////////////////////////////////
          this.syncEventResource.validateEventSubject(event);
          const parsedEventSubject = ArvoOrchestrationSubject.parse(event.subject);
          span.setAttributes({
            'arvo.parsed.subject.orchestrator.name': parsedEventSubject.orchestrator.name,
            'arvo.parsed.subject.orchestrator.version': parsedEventSubject.orchestrator.version,
          });

          // The wrong source is not a big violation. May be some routing went wrong. So just ignore the event
          if (parsedEventSubject.orchestrator.name !== this.source) {
            logToSpan({
              level: 'WARNING',
              message: `Event subject mismatch detected. Expected orchestrator '${this.source}' but subject indicates '${parsedEventSubject.orchestrator.name}'. This indicates either a routing error or a non-applicable event that can be safely ignored.`,
            });

            logToSpan({
              level: 'INFO',
              message: 'Orchestration executed with issues and emitted 0 events',
            });
            return {
              events: [],
              allEventDomains: [],
              domainedEvents: {
                all: [],
              },
            };
          }

          logToSpan({
            level: 'INFO',
            message: `Resolving machine for event ${event.type}`,
          });

          // Handler not found means that the handler is not defined which is not allowed and a critical bug
          if (!this.handler[parsedEventSubject.orchestrator.version]) {
            throw new ConfigViolation(
              `Handler resolution failed: No handler found matching orchestrator name='${parsedEventSubject.orchestrator.name}' and version='${parsedEventSubject.orchestrator.version}'.`,
            );
          }

          logToSpan({
            level: 'INFO',
            message: `Input validation started for event ${event.type}`,
          });

          const { contractType } = this.validateInput(event);

          ///////////////////////////////////////////////////////////////
          // State locking, acquiry and handler exection
          ///////////////////////////////////////////////////////////////
          acquiredLock = await this.syncEventResource.acquireLock(event);

          if (acquiredLock === 'NOT_ACQUIRED') {
            throw new TransactionViolation({
              cause: TransactionViolationCause.LOCK_UNACQUIRED,
              message: 'Lock acquisition denied - Unable to obtain exclusive access to event processing',
              initiatingEvent: event,
            });
          }

          if (acquiredLock === 'ACQUIRED') {
            logToSpan({
              level: 'INFO',
              message: `This execution acquired lock at resource '${event.subject}'`,
            });
          }

          // Acquiring state
          const state = await this.syncEventResource.acquireState(event);

          if (state?.executionStatus === 'failure') {
            logToSpan({
              level: 'WARNING',
              message: `The orchestration has failed in a previous event. Ignoreing event id: ${event.id} with subject: ${event.subject}`,
            });
            return { events: [] };
          }

          orchestrationParentSubject = state?.parentSubject ?? null;
          initEventId = state?.initEventId ?? event.id;

          if (state?.status === 'done') {
            logToSpan({
              level: 'INFO',
              message: `The resumable has already reached the terminal state. Ignoring event(id=${event.id})`,
            });

            return {
              events: [],
            };
          }

          if (!state) {
            logToSpan({
              level: 'INFO',
              message: `Initializing new execution state for subject: ${event.subject}`,
            });

            if (event.type !== this.source) {
              logToSpan({
                level: 'WARNING',
                message: `Invalid initialization event detected. Expected type '${this.source}' but received '${event.type}'. This may indicate an incorrectly routed event or a non-initialization event that can be safely ignored.`,
              });

              return {
                events: [],
              };
            }
          } else {
            logToSpan({
              level: 'INFO',
              message: `Resuming execution with existing state for subject: ${event.subject}`,
            });
          }

          // In case the event is the init event then
          // extract the parent subject from it and assume
          // it to be the orchestration parent subject
          if (event.type === this.source) {
            orchestrationParentSubject = event?.data?.parentSubject$$ ?? null;
          }

          // This is not persisted until handling. The reason is that if the event
          // is causing a fault then what is the point of persisting it
          if (
            event.parentid &&
            state?.events?.expected?.[event.parentid] &&
            Array.isArray(state?.events?.expected?.[event.parentid])
          ) {
            state.events.expected[event.parentid].push(event.toJSON());
          }

          const eventTypeToExpectedEvent: Record<string, InferArvoEvent<ArvoEvent>[]> = {};
          for (const [_, eventList] of Object.entries(state?.events?.expected ?? {})) {
            for (const _evt of eventList) {
              if (!eventTypeToExpectedEvent[_evt.type]) {
                eventTypeToExpectedEvent[_evt.type] = [];
              }
              eventTypeToExpectedEvent[_evt.type].push(_evt);
            }
          }

          const handler = this.handler[parsedEventSubject.orchestrator.version];
          const executionResult = await handler({
            span: span,
            context: state?.state$$ ?? null,
            metadata: state ?? null,
            collectedEvents: eventTypeToExpectedEvent,
            domain: {
              event: event.domain,
              self: this.contracts.self.domain,
            },
            input: contractType === 'self' ? (event.toJSON() as any) : null,
            service: contractType === 'service' ? event.toJSON() : null,
            contracts: {
              self: this.contracts.self.version(parsedEventSubject.orchestrator.version),
              services: this.contracts.services,
            },
          });

          ///////////////////////////////////////////////////////////////
          // Event segregation, creation, state persitance and return result
          ///////////////////////////////////////////////////////////////

          // In case execution of the resumable has finished
          // and the final output has been created, then in
          // that case, make the raw event as the final output
          // is not even raw enough to be called an event yet
          const rawMachineEmittedEvents = executionResult?.services ?? [];
          if (executionResult?.output) {
            rawMachineEmittedEvents.push({
              id: executionResult.output.__id,
              data: executionResult.output,
              type: this.contracts.self.metadata.completeEventType,
              to: parsedEventSubject.meta?.redirectto ?? parsedEventSubject.execution.initiator,
              domain: orchestrationParentSubject
                ? [ArvoOrchestrationSubject.parse(orchestrationParentSubject).execution.domain]
                : [null],
            });
          }

          // Create the final emittable events after performing
          // validations and subject creations etc.
          const emittables = processRawEventsIntoEmittables(
            {
              rawEvents: rawMachineEmittedEvents,
              otelHeaders,
              orchestrationParentSubject,
              sourceEvent: event,
              selfContract: this.contracts.self.version(parsedEventSubject.orchestrator.version) as any,
              serviceContracts: this.contracts.services,
              initEventId,
              executionunits: this.executionunits,
              source: this.source,
            },
            span,
          );

          logToSpan({
            level: 'INFO',
            message: `Resumable execution completed. Generated events: ${emittables.length}`,
          });

          // If the handler emits new events, then forget about
          // the old events and recreate expected event map.
          const eventTrackingState: ArvoResumableState<any>['events'] = {
            consumed: event.toJSON(),
            expected: emittables.length
              ? Object.fromEntries(emittables.map((item) => [item.id, []]))
              : (state?.events.expected ?? null),
            produced: emittables.map((item) => item.toJSON()),
          };

          // Write to the memory
          await this.syncEventResource.persistState(
            event,
            {
              executionStatus: 'normal',
              status: executionResult?.output ? 'done' : 'active',
              initEventId,
              parentSubject: orchestrationParentSubject,
              subject: event.subject,
              events: eventTrackingState,
              state$$: executionResult?.context ?? state?.state$$ ?? null,
            },
            state,
            span,
          );

          logToSpan({
            level: 'INFO',
            message: `State update persisted in memory for subject ${event.subject}`,
          });

          logToSpan({
            level: 'INFO',
            message: `Resumable successfully executed and emitted ${emittables.length} events`,
          });

          return { events: emittables };
        } catch (error: unknown) {
          const { errorToThrow, events: errorEvents } = await handleOrchestrationErrors(
            'ArvoResumable',
            {
              error,
              event,
              otelHeaders,
              orchestrationParentSubject,
              initEventId,
              selfContract: this.contracts.self.version('any'),
              systemErrorDomain: this.systemErrorDomain,
              executionunits: this.executionunits,
              source: this.source,
              domain: this.domain,
              syncEventResource: this.syncEventResource,
            },
            span,
          );
          if (errorToThrow) throw errorToThrow;
          return {
            events: errorEvents,
          };
        } finally {
          await this.syncEventResource.releaseLock(event, acquiredLock, span);
          span.end();
        }
      },
    });
  }

  get systemErrorSchema() {
    return this.contracts.self.systemError;
  }
}
