import { type Span, SpanKind } from '@opentelemetry/api';
import {
  type ArvoEvent,
  ArvoExecution,
  ArvoExecutionSpanKind,
  ArvoOrchestrationSubject,
  type ArvoOrchestratorContract,
  EventDataschemaUtil,
  type InferArvoEvent,
  OpenInference,
  OpenInferenceSpanKind,
  type VersionedArvoContract,
  isWildCardArvoSematicVersion,
  logToSpan,
} from 'arvo-core';
import type { z } from 'zod';
import { processRawEventsIntoEmittables } from '../ArvoOrchestrationUtils/createEmitableEvent';
import { executeWithOrchestrationWrapper } from '../ArvoOrchestrationUtils/orchestrationExecutionWrapper';
import type IArvoEventHandler from '../IArvoEventHandler';
import type { IMachineMemory } from '../MachineMemory/interface';
import { SyncEventResource } from '../SyncEventResource/index';
import { ConfigViolation, ExecutionViolation } from '../errors';
import type { ArvoEventHandlerOpenTelemetryOptions, ArvoEventHandlerOtelSpanOptions } from '../types';
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
  private readonly spanOptions: ArvoEventHandlerOtelSpanOptions;

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
    spanOptions?: ArvoEventHandlerOtelSpanOptions;
  }) {
    this.executionunits = param.executionunits;
    this.source = param.contracts.self.type;
    this.syncEventResource = new SyncEventResource(param.memory, param.requiresResourceLocking ?? true);
    this.contracts = param.contracts;
    this.handler = param.handler;
    this.systemErrorDomain = param.systemErrorDomain;

    this.spanOptions = {
      kind: SpanKind.PRODUCER,
      ...param.spanOptions,
      attributes: {
        [ArvoExecution.ATTR_SPAN_KIND]: ArvoExecutionSpanKind.RESUMABLE,
        [OpenInference.ATTR_SPAN_KIND]: OpenInferenceSpanKind.CHAIN,
        ...(param.spanOptions?.attributes ?? {}),
        'arvo.handler.source': this.source,
        'arvo.contract.uri': this.contracts.self.uri,
      },
    };
  }

  protected validateInput(
    event: ArvoEvent,
    span: Span,
  ): {
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

    logToSpan(
      {
        level: 'INFO',
        message: `Dataschema resolved: ${event.dataschema} matches contract(uri='${resolvedContract.uri}', version='${resolvedContract.version}')`,
      },
      span,
    );

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
    opentelemetry?: ArvoEventHandlerOpenTelemetryOptions,
  ): Promise<{
    events: ArvoEvent[];
  }> {
    return await executeWithOrchestrationWrapper<ArvoResumableState<TMemory>>(
      {
        _handlerType: 'resumable',
        event,
        opentelemetry: opentelemetry ?? { inheritFrom: 'EVENT' },
        spanOptions: {
          spanName: ({ selfContractUri, consumedEvent }) => `Resumable<${selfContractUri}>@<${consumedEvent.type}>`,
          ...this.spanOptions,
        },
        source: this.source,
        syncEventResource: this.syncEventResource,
        executionunits: this.executionunits,
        systemErrorDomain: this.systemErrorDomain,
        selfContract: this.contracts.self.version('latest'),
        domain: this.domain,
      },
      async ({ span, otelHeaders, orchestrationParentSubject, initEventId, parsedEventSubject, state }) => {
        logToSpan(
          {
            level: 'INFO',
            message: `Resolving handler for event ${event.type}`,
          },
          span,
        );

        if (!this.handler[parsedEventSubject.orchestrator.version]) {
          throw new ConfigViolation(
            `Handler resolution failed: No handler found matching orchestrator name='${parsedEventSubject.orchestrator.name}' and version='${parsedEventSubject.orchestrator.version}'.`,
          );
        }

        logToSpan({
          level: 'INFO',
          message: `Input validation started for event ${event.type}`,
        });

        const { contractType } = this.validateInput(event, span);

        if (state?.status === 'done') {
          logToSpan({
            level: 'INFO',
            message: `The resumable has already reached the terminal state. Ignoring event(id=${event.id})`,
          });

          return {
            emittables: [],
            newState: state,
          };
        }

        // Track expected events
        if (
          event.parentid &&
          state?.events?.expected?.[event.parentid] &&
          Array.isArray(state?.events?.expected?.[event.parentid])
        ) {
          state.events.expected[event.parentid].push(event.toJSON());
        }

        // Build event type to expected event mapping
        const eventTypeToExpectedEvent: Record<string, InferArvoEvent<ArvoEvent>[]> = {};
        for (const [_, eventList] of Object.entries(state?.events?.expected ?? {})) {
          for (const _evt of eventList) {
            if (!eventTypeToExpectedEvent[_evt.type]) {
              eventTypeToExpectedEvent[_evt.type] = [];
            }
            eventTypeToExpectedEvent[_evt.type].push(_evt);
          }
        }

        // Execute handler
        const handler = this.handler[parsedEventSubject.orchestrator.version];
        const versionedSelfContract = this.contracts.self.version(parsedEventSubject.orchestrator.version);

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
            self: versionedSelfContract,
            services: this.contracts.services,
          },
        });

        const rawEvents = executionResult?.services ?? [];
        if (executionResult?.output) {
          rawEvents.push({
            id: executionResult.output.__id,
            data: executionResult.output,
            type: this.contracts.self.metadata.completeEventType,
            to: parsedEventSubject.meta?.redirectto ?? parsedEventSubject.execution.initiator,
            domain: orchestrationParentSubject
              ? [ArvoOrchestrationSubject.parse(orchestrationParentSubject).execution.domain]
              : [null],
          });
        }

        const emittables = processRawEventsIntoEmittables(
          {
            rawEvents,
            otelHeaders,
            orchestrationParentSubject,
            sourceEvent: event,
            selfContract: versionedSelfContract as any,
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

        // Build event tracking state
        const eventTrackingState: ArvoResumableState<any>['events'] = {
          consumed: event.toJSON(),
          expected: emittables.length
            ? Object.fromEntries(emittables.map((item) => [item.id, []]))
            : (state?.events?.expected ?? null),
          produced: emittables.map((item) => item.toJSON()),
        };

        // Build new state
        const newState: ArvoResumableState<TMemory> = {
          executionStatus: 'normal',
          status: executionResult?.output ? 'done' : 'active',
          initEventId,
          parentSubject: orchestrationParentSubject,
          subject: event.subject,
          events: eventTrackingState,
          state$$: executionResult?.context ?? state?.state$$ ?? null,
        };

        return { emittables, newState };
      },
    );
  }

  get systemErrorSchema() {
    return this.contracts.self.systemError;
  }
}
