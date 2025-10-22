import { SpanKind } from '@opentelemetry/api';
import {
  type ArvoContractRecord,
  ArvoErrorSchema,
  type ArvoEvent,
  ArvoExecution,
  ArvoExecutionSpanKind,
  ArvoOrchestrationSubject,
  OpenInference,
  OpenInferenceSpanKind,
  logToSpan,
} from 'arvo-core';
import type { ActorLogic } from 'xstate';
import { processRawEventsIntoEmittables } from '../ArvoOrchestrationUtils/createEmitableEvent';
import { executeWithOrchestrationWrapper } from '../ArvoOrchestrationUtils/orchestrationExecutionWrapper';
import type IArvoEventHandler from '../IArvoEventHandler';
import type { IMachineExectionEngine } from '../MachineExecutionEngine/interface';
import type { IMachineMemory } from '../MachineMemory/interface';
import type { IMachineRegistry } from '../MachineRegistry/interface';
import { SyncEventResource } from '../SyncEventResource';
import { ConfigViolation, ContractViolation } from '../errors';
import type { ArvoEventHandlerOpenTelemetryOptions, ArvoEventHandlerOtelSpanOptions } from '../types';
import type { ArvoOrchestratorParam, MachineMemoryRecord } from './types';

/**
 * Orchestrates state machine execution and lifecycle management.
 * 
 * Coordinates machine resolution, state persistence, event processing, and error handling
 * for Arvo's event-driven orchestration workflows. Manages the complete lifecycle from
 * event receipt through machine execution to emitting result events.
 */
export class ArvoOrchestrator implements IArvoEventHandler {
  /** Computational cost metric associated with event handling operations */
  readonly executionunits: number;
  /** Registry containing available state machines */
  readonly registry: IMachineRegistry;
  /** Engine responsible for executing state machine logic */
  readonly executionEngine: IMachineExectionEngine;
  /** Resource manager for state synchronization and memory access */
  readonly syncEventResource: SyncEventResource<MachineMemoryRecord>;
  /** Optional domains for routing system error events */
  readonly systemErrorDomain?: (string | null)[] = undefined;
  /** OpenTelemetry span configuration for observability */
  readonly spanOptions: ArvoEventHandlerOtelSpanOptions;

  /** Source identifier from the first registered machine */
  get source() {
    return this.registry.machines[0].source;
  }

  /** Whether this orchestrator requires resource locking for concurrent safety */
  get requiresResourceLocking(): boolean {
    return this.syncEventResource.requiresResourceLocking;
  }

  /** Memory interface for state persistence and retrieval */
  get memory(): IMachineMemory<MachineMemoryRecord> {
    return this.syncEventResource.memory;
  }

  /** The contract-defined domain for the handler */
  get domain(): string | null {
    return this.registry.machines[0].contracts.self.domain;
  }

  constructor({
    executionunits,
    memory,
    registry,
    executionEngine,
    requiresResourceLocking,
    systemErrorDomain,
    spanOptions,
  }: ArvoOrchestratorParam) {
    this.executionunits = executionunits;
    this.registry = registry;
    this.executionEngine = executionEngine;
    this.syncEventResource = new SyncEventResource(memory, requiresResourceLocking);
    this.systemErrorDomain = systemErrorDomain;

    this.spanOptions = {
      kind: SpanKind.PRODUCER,
      ...spanOptions,
      attributes: {
        [ArvoExecution.ATTR_SPAN_KIND]: ArvoExecutionSpanKind.ORCHESTRATOR,
        [OpenInference.ATTR_SPAN_KIND]: OpenInferenceSpanKind.CHAIN,
        ...(spanOptions?.attributes ?? {}),
        'arvo.handler.source': this.source,
        'arvo.contract.uri': this?.registry?.machines?.[0]?.contracts?.self?.uri ?? 'N/A',
      },
    };
  }

  /**
   * Executes state machine orchestration for an incoming event.
   * 
   * Performs the complete orchestration workflow: resolves the appropriate machine,
   * validates input, executes the machine logic, processes emitted events, and persists
   * the new state. Handles both new orchestrations and continuation of existing ones.
   * 
   * For violation errors (transaction, execution, contract, config), the error is thrown
   * to enable retry mechanisms. For non-violation errors, system error events are emitted
   * to the workflow initiator, and the orchestration enters a terminal failure state.
   *
   * @param event - The incoming event triggering orchestration
   * @param opentelemetry - Optional OpenTelemetry configuration for tracing
   * @returns Object containing emitted events from the orchestration or system errors
   *
   * @throws {TransactionViolation} When lock acquisition or state operations fail (retriable)
   * @throws {ExecutionViolation} When event structure or execution flow is invalid (retriable)
   * @throws {ContractViolation} When event data doesn't match contract schema (retriable)
   * @throws {ConfigViolation} When machine resolution fails or version is missing (retriable)
   */
  async execute(
    event: ArvoEvent,
    opentelemetry?: ArvoEventHandlerOpenTelemetryOptions,
  ): Promise<{
    events: ArvoEvent[];
  }> {
    return await executeWithOrchestrationWrapper<MachineMemoryRecord>(
      {
        _handlerType: 'orchestrator',
        event,
        opentelemetry: opentelemetry ?? { inheritFrom: 'EVENT' },
        spanOptions: {
          spanName: ({ selfContractUri, consumedEvent }) => `Orchestrator<${selfContractUri}>@<${consumedEvent.type}>`,
          ...this.spanOptions,
        },
        source: this.source,
        syncEventResource: this.syncEventResource,
        executionunits: this.executionunits,
        systemErrorDomain: this.systemErrorDomain,
        selfContract: this.registry.machines[0].contracts.self,
        domain: this.domain,
      },
      async ({ span, otelHeaders, orchestrationParentSubject, initEventId, parsedEventSubject, state }) => {
        logToSpan(
          {
            level: 'INFO',
            message: `Resolving machine for event ${event.type}`,
          },
          span,
        );

        const machine = this.registry.resolve(event, { inheritFrom: 'CONTEXT' });

        if (!machine) {
          throw new ConfigViolation(
            `Machine resolution failed: No machine found matching orchestrator name='${parsedEventSubject.orchestrator.name}' and version='${parsedEventSubject.orchestrator.version}'.`,
          );
        }

        logToSpan(
          {
            level: 'INFO',
            message: `Input validation started for event ${event.type} on machine ${machine.source}`,
          },
          span,
        );

        const inputValidation = machine.validateInput(event);

        if (inputValidation.type === 'CONTRACT_UNRESOLVED') {
          throw new ConfigViolation(
            'Contract validation failed - Event does not match any registered contract schemas in the machine',
          );
        }

        if (inputValidation.type === 'INVALID_DATA' || inputValidation.type === 'INVALID') {
          throw new ContractViolation(
            `Input validation failed - Event data does not meet contract requirements: ${inputValidation.error.message}`,
          );
        }

        // Execute machine
        const executionResult = this.executionEngine.execute(
          { state: state?.state ?? null, event, machine },
          { inheritFrom: 'CONTEXT' },
        );

        span.setAttribute('arvo.orchestration.status', executionResult.state.status);

        const rawMachineEmittedEvents = executionResult.events;

        if (executionResult.finalOutput) {
          rawMachineEmittedEvents.push({
            type: machine.contracts.self.metadata.completeEventType,
            id: executionResult.finalOutput.__id,
            data: executionResult.finalOutput,
            to: parsedEventSubject.meta?.redirectto ?? parsedEventSubject.execution.initiator,
            domain: orchestrationParentSubject
              ? [ArvoOrchestrationSubject.parse(orchestrationParentSubject).execution.domain]
              : [null],
          });
        }

        // Process raw events into emittables
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

        logToSpan(
          {
            level: 'INFO',
            message: `Machine execution completed - Status: ${executionResult.state.status}, Generated events: ${emittables.length}`,
          },
          span,
        );

        // Build new state
        const newState: MachineMemoryRecord = {
          executionStatus: 'normal',
          initEventId,
          subject: event.subject,
          parentSubject: orchestrationParentSubject,
          status: executionResult.state.status,
          value: (executionResult.state as any).value ?? null,
          state: executionResult.state,
          events: {
            consumed: event.toJSON(),
            produced: emittables.map((item) => item.toJSON()),
          },
          machineDefinition: JSON.stringify((machine.logic as ActorLogic<any, any, any, any, any>).config),
        };

        return { emittables, newState };
      },
    );
  }

  /**
   * Provides access to the system error event schema configuration.
   */
  get systemErrorSchema() {
    return {
      type: this.registry.machines[0].contracts.self.systemError.type,
      schema: ArvoErrorSchema,
      domain: this.systemErrorDomain
    };
  }
}
