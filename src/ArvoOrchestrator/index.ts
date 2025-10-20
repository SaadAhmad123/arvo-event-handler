import { SpanKind, context } from '@opentelemetry/api';
import {
  type ArvoContractRecord,
  ArvoErrorSchema,
  type ArvoEvent,
  ArvoExecution,
  ArvoExecutionSpanKind,
  ArvoOpenTelemetry,
  ArvoOrchestrationSubject,
  type ArvoOrchestratorContract,
  type ArvoSemanticVersion,
  type CreateArvoEvent,
  OpenInference,
  OpenInferenceSpanKind,
  type VersionedArvoContract,
  currentOpenTelemetryHeaders,
  logToSpan,
} from 'arvo-core';
import type { ActorLogic } from 'xstate';
import { processRawEventsIntoEmittables } from '../ArvoOrchestrationUtils/createEmitableEvent';
import { TransactionViolation, TransactionViolationCause } from '../ArvoOrchestrationUtils/error';
import { handleOrchestrationErrors } from '../ArvoOrchestrationUtils/handlerErrors';
import type IArvoEventHandler from '../IArvoEventHandler';
import type { IMachineExectionEngine } from '../MachineExecutionEngine/interface';
import type { IMachineMemory } from '../MachineMemory/interface';
import type { IMachineRegistry } from '../MachineRegistry/interface';
import { SyncEventResource } from '../SyncEventResource';
import type { AcquiredLockStatusType } from '../SyncEventResource/types';
import { ConfigViolation, ContractViolation } from '../errors';
import type { ArvoEventHandlerOpenTelemetryOptions } from '../types';
import type { ArvoOrchestratorParam, MachineMemoryRecord } from './types';

/**
 * Orchestrates state machine execution and lifecycle management.
 * Handles machine resolution, state management, event processing and error handling.
 */
export class ArvoOrchestrator implements IArvoEventHandler {
  readonly executionunits: number;
  readonly registry: IMachineRegistry;
  readonly executionEngine: IMachineExectionEngine;
  readonly syncEventResource: SyncEventResource<MachineMemoryRecord>;
  readonly systemErrorDomain?: (string | null)[] = [];

  get source() {
    return this.registry.machines[0].source;
  }

  get requiresResourceLocking(): boolean {
    return this.syncEventResource.requiresResourceLocking;
  }

  get memory(): IMachineMemory<MachineMemoryRecord> {
    return this.syncEventResource.memory;
  }

  get domain(): string | null {
    return this.registry.machines[0].contracts.self.domain;
  }

  /**
   * Creates a new orchestrator instance
   * @param params - Configuration parameters
   * @throws Error if machines in registry have different sources
   */
  constructor({
    executionunits,
    memory,
    registry,
    executionEngine,
    requiresResourceLocking,
    systemErrorDomain,
  }: ArvoOrchestratorParam) {
    this.executionunits = executionunits;
    this.registry = registry;
    this.executionEngine = executionEngine;
    this.syncEventResource = new SyncEventResource(memory, requiresResourceLocking);
    this.systemErrorDomain = systemErrorDomain;
  }

  /**
   * Core orchestration method that executes state machines in response to events.
   *
   * @param event - Event triggering the execution
   * @param opentelemetry - OpenTelemetry configuration
   * @returns Object containing domained events
   *
   * @throws {TransactionViolation} Lock/state operations failed
   * @throws {ExecutionViolation} Invalid event structure/flow
   * @throws {ContractViolation} Schema/contract mismatch
   * @throws {ConfigViolation} Missing/invalid machine version
   */
  async execute(
    event: ArvoEvent,
    opentelemetry: ArvoEventHandlerOpenTelemetryOptions = {
      inheritFrom: 'EVENT',
    },
  ): Promise<{
    events: ArvoEvent[];
  }> {
    return await ArvoOpenTelemetry.getInstance().startActiveSpan({
      name: `Orchestrator<${this.registry.machines[0].contracts.self.uri}>@<${event.type}>`,
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
          message: `Orchestrator starting execution for ${event.type} on subject ${event.subject}`,
        });
        const otelHeaders = currentOpenTelemetryHeaders();
        let orchestrationParentSubject: string | null = null;
        let initEventId: string | null = null;
        let acquiredLock: AcquiredLockStatusType | null = null;
        try {
          ///////////////////////////////////////////////////////////////
          // Subject resolution, machine resolution and input validation
          ///////////////////////////////////////////////////////////////
          this.syncEventResource.validateEventSubject(event, span);
          const parsedEventSubject = ArvoOrchestrationSubject.parse(event.subject);
          span.setAttributes({
            'arvo.parsed.subject.orchestrator.name': parsedEventSubject.orchestrator.name,
            'arvo.parsed.subject.orchestrator.version': parsedEventSubject.orchestrator.version,
          });

          // The wrong source is not a big violation. May be some routing went wrong. So just ignore
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
            };
          }

          logToSpan({
            level: 'INFO',
            message: `Resolving machine for event ${event.type}`,
          });

          const machine = this.registry.resolve(event, {
            inheritFrom: 'CONTEXT',
          });

          // Unable to find a machine is a big configuration bug and violation
          if (!machine) {
            const { name, version } = parsedEventSubject.orchestrator;
            throw new ConfigViolation(
              `Machine resolution failed: No machine found matching orchestrator name='${name}' and version='${version}'.`,
            );
          }

          logToSpan({
            level: 'INFO',
            message: `Input validation started for event ${event.type} on machine ${machine.source}`,
          });

          // Validate the event againt the events that can be
          // recieved by the machine. The orchestrator must only
          // allow event which the machine is expecting as input
          // to be futher processed.
          // The machine however should be able to emit any events
          const inputValidation = machine.validateInput(event);

          if (inputValidation.type === 'CONTRACT_UNRESOLVED') {
            // This is a configuration error because the contract was never
            // configured in the machine. That is why it was unresolved. It
            // signifies a problem in configration not the data or event flow
            throw new ConfigViolation(
              'Contract validation failed - Event does not match any registered contract schemas in the machine',
            );
          }

          if (inputValidation.type === 'INVALID_DATA' || inputValidation.type === 'INVALID') {
            // This is a contract error becuase there is a configuration but
            // the event data received was invalid due to conflicting data
            // or event dataschema did not match the contract data schema. This
            // signifies an issue with event flow because unexpected events
            // are being received
            throw new ContractViolation(
              `Input validation failed - Event data does not meet contract requirements: ${inputValidation.error.message}`,
            );
          }

          ///////////////////////////////////////////////////////////////
          // State locking, acquiry machine exection
          ///////////////////////////////////////////////////////////////
          acquiredLock = await this.syncEventResource.acquireLock(event, span);
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

          // Acquiring state  `
          const state = await this.syncEventResource.acquireState(event, span);

          if (state?.executionStatus === 'failure') {
            logToSpan({
              level: 'WARNING',
              message: `The orchestration has failed in a previous event. Ignoreing event id: ${event.id} with subject: ${event.subject}`,
            });
            return { events: [] };
          }

          orchestrationParentSubject = state?.parentSubject ?? null;
          initEventId = state?.initEventId ?? event.id;

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

          // Execute the raw machine and collect the result
          // The result basically contain RAW events from the
          // machine which will then transformed to be real ArvoEvents
          const executionResult = this.executionEngine.execute(
            {
              state: state?.state ?? null,
              event,
              machine,
            },
            { inheritFrom: 'CONTEXT' },
          );

          span.setAttribute('arvo.orchestration.status', executionResult.state.status);

          const rawMachineEmittedEvents = executionResult.events;

          // In case execution of the machine has finished
          // and the final output has been created, then in
          // that case, make the raw event as the final output
          // is not even raw enough to be called an event yet
          if (executionResult.finalOutput) {
            rawMachineEmittedEvents.push({
              id: executionResult.finalOutput.__id as CreateArvoEvent<Record<string, unknown>, string>['id'],
              data: executionResult.finalOutput,
              type: (machine.contracts.self as VersionedArvoContract<ArvoOrchestratorContract, ArvoSemanticVersion>)
                .metadata.completeEventType,
              to: parsedEventSubject.meta?.redirectto ?? parsedEventSubject.execution.initiator,
              domain: orchestrationParentSubject
                ? [ArvoOrchestrationSubject.parse(orchestrationParentSubject).execution.domain]
                : [null],
            });
          }

          ///////////////////////////////////////////////////////////////
          // Event segregation, creation, state persitance and return result
          ///////////////////////////////////////////////////////////////

          // Create the final emittable events after performing
          // validations and subject creations etc.
          const emittables = processRawEventsIntoEmittables(
            {
              rawEvents: rawMachineEmittedEvents,
              otelHeaders,
              orchestrationParentSubject,
              sourceEvent: event,
              selfContract: machine.contracts.self,
              serviceContracts: machine.contracts.services,
              initEventId,
              executionunits: this.executionunits,
              source: this.source,
            },
            span,
          );

          logToSpan({
            level: 'INFO',
            message: `Machine execution completed - Status: ${executionResult.state.status}, Generated events: ${executionResult.events.length}`,
          });

          // Write to the memory
          await this.syncEventResource.persistState(
            event,
            {
              executionStatus: 'normal',
              initEventId,
              subject: event.subject,
              status: executionResult.state.status,
              parentSubject: orchestrationParentSubject,
              value: (executionResult.state as any).value ?? null,
              state: executionResult.state,
              events: {
                consumed: event.toJSON(),
                produced: emittables.map((item) => item.toJSON()),
              },
              machineDefinition: JSON.stringify((machine.logic as ActorLogic<any, any, any, any, any>).config),
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
            message: `Orchestration successfully executed and emitted ${emittables.length} events`,
          });

          return { events: emittables };
        } catch (error: unknown) {
          const { errorToThrow, events: errorEvents } = await handleOrchestrationErrors(
            'ArvoOrchestrator',
            {
              error,
              event,
              otelHeaders,
              orchestrationParentSubject,
              initEventId,
              selfContract: this.registry.machines[0].contracts.self,
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

  /**
   * Gets the error schema for this orchestrator
   */
  get systemErrorSchema(): ArvoContractRecord {
    return {
      type: this.registry.machines[0].contracts.self.systemError.type,
      schema: ArvoErrorSchema,
    };
  }
}
