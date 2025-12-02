import { type Span, SpanKind } from '@opentelemetry/api';
import {
  type ArvoEvent,
  ArvoExecution,
  ArvoExecutionSpanKind,
  ArvoOrchestrationSubject,
  type ArvoOrchestratorContract,
  type InferArvoEvent,
  OpenInference,
  OpenInferenceSpanKind,
  type VersionedArvoContract,
  logToSpan,
} from 'arvo-core';
import { processRawEventsIntoEmittables } from '../ArvoOrchestrationUtils/createEmitableEvent';
import { type EventValidationResult, validateInputEvent } from '../ArvoOrchestrationUtils/inputValidation';
import { executeWithOrchestrationWrapper } from '../ArvoOrchestrationUtils/orchestrationExecutionWrapper';
import type IArvoEventHandler from '../IArvoEventHandler';
import type { IMachineMemory } from '../MachineMemory/interface';
import { SyncEventResource } from '../SyncEventResource/index';
import { ConfigViolation, ContractViolation } from '../errors';
import type { ArvoEventHandlerOpenTelemetryOptions, ArvoEventHandlerOtelSpanOptions, NonEmptyArray } from '../types';
import type { ArvoResumableHandler, ArvoResumableParam, ArvoResumableState } from './types';
import { ArvoDomain } from '../ArvoDomain';

/**
 * ArvoResumable complements {@link ArvoOrchestrator} by providing imperative
 * handler functions for orchestration logic instead of declarative state machines.
 * While ArvoOrchestrator excels at complex static workflows with deterministic
 * branching, ArvoResumable handles dynamic orchestrations where branching logic
 * depends on runtime context and event data.
 *
 * Use this for dynamic orchestrations with context-dependent branching
 * or when preferring imperative programming patterns over state machines.
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
  /** Computational cost metric for workflow operations */
  readonly executionunits: number;
  /** Resource manager for state synchronization and memory access */
  readonly syncEventResource: SyncEventResource<ArvoResumableState<TMemory>>;
  /** Versioned handler map for processing workflow events. */
  readonly handler: ArvoResumableHandler<ArvoResumableState<TMemory>, TSelfContract, TServiceContract>;
  /** Optional domains for routing system error events */
  readonly systemErrorDomain: NonEmptyArray<string | null>;
  /** OpenTelemetry span configuration for observability */
  readonly spanOptions: ArvoEventHandlerOtelSpanOptions;
  /** Source identifier from the first registered machine */
  readonly source: string;

  /**
   * Contract definitions for the resumable's event interface.
   * Defines accepted events, emitted events, and service integrations.
   */
  readonly contracts: {
    /**
     * Self contract defining initialization input and completion output structures.
     */
    self: TSelfContract;
    /**
     * Service contracts defining external service interfaces.
     */
    services: TServiceContract;
  };

  /** Whether this resumable requires resource locking for concurrent safety */
  get requiresResourceLocking(): boolean {
    return this.syncEventResource.requiresResourceLocking;
  }

  /** Memory interface for state persistence and retrieval */
  get memory(): IMachineMemory<ArvoResumableState<TMemory>> {
    return this.syncEventResource.memory;
  }

  /** The contract-defined domain for the handler */
  get domain(): string | null {
    return this.contracts.self.domain;
  }

  constructor(param: ArvoResumableParam<TMemory, TSelfContract, TServiceContract>) {
    this.executionunits = param.executionunits;
    this.source = param.contracts.self.type;
    this.syncEventResource = new SyncEventResource(param.memory, param.requiresResourceLocking ?? true);
    this.contracts = param.contracts;
    this.handler = param.handler;
    this.systemErrorDomain = param.systemErrorDomain ?? [ArvoDomain.LOCAL];

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

  /**
   * Validates incoming event against self or service contracts.
   *
   * Resolves the appropriate contract (self for initialization, service for responses),
   * validates schema compatibility, and ensures event data matches contract requirements.
   *
   * See {@link validateInputEvent} for more infromation
   */
  protected validateInput(event: ArvoEvent, span?: Span): EventValidationResult {
    return validateInputEvent({
      event,
      selfContract: this.contracts.self,
      serviceContracts: this.contracts.services,
      span,
    });
  }

  /**
   * Executes the workflow handler for an incoming event.
   *
   * Processes initialization events or service responses through the versioned handler,
   * manages state persistence, tracks expected events, and generates output events.
   * Workflows in 'done' status ignore subsequent events without processing.
   *
   * For violation errors (transaction, config, contract), the error is thrown to enable
   * retry mechanisms. For non-violation errors, system error events are emitted to the
   * workflow initiator, and the workflow enters a terminal failure state.
   *
   * @param event - The incoming event triggering handler execution
   * @param opentelemetry - Optional OpenTelemetry configuration for tracing
   * @returns Object containing emitted events from the handler or system errors
   *
   * @throws {TransactionViolation} When distributed lock acquisition fails
   * @throws {ConfigViolation} When handler resolution or contract validation fails
   * @throws {ContractViolation} When event schema validation fails
   * @throws {ExecutionViolation} When workflow execution encounters critical errors defined by the handler developer
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

        const inputValidation = this.validateInput(event, span);

        if (inputValidation.type === 'CONTRACT_UNRESOLVED') {
          throw new ConfigViolation(
            'Contract validation failed - Event does not match any registered contract schemas in the resumable',
          );
        }

        if (inputValidation.type === 'INVALID_DATA' || inputValidation.type === 'INVALID') {
          throw new ContractViolation(
            `Input validation failed - Event data does not meet contract requirements: ${inputValidation.error.message}`,
          );
        }

        const { contractType } = inputValidation;

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

        for (let i = 0; i < rawEvents.length; i++) {
          rawEvents[i].domain = rawEvents[i].domain ?? [ArvoDomain.LOCAL];
        }

        if (executionResult?.output) {
          rawEvents.push({
            id: executionResult.output.__id,
            data: executionResult.output,
            type: this.contracts.self.metadata.completeEventType,
            to: parsedEventSubject.meta?.redirectto ?? parsedEventSubject.execution.initiator,
            domain: executionResult.output?.__domain ?? [ArvoDomain.LOCAL],
            executionunits: executionResult.output.__executionunits,
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
    return {
      ...this.contracts.self.systemError,
      domain: this.systemErrorDomain,
    };
  }
}
