import {
  type ArvoContractRecord,
  ArvoErrorSchema,
  type ArvoEvent,
  ArvoOrchestrationSubject,
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
    return await executeWithOrchestrationWrapper<MachineMemoryRecord>(
      {
        _handlerType: 'orchestrator',
        event,
        opentelemetry,
        spanName: `Orchestrator<${this.registry.machines[0].contracts.self.uri}>@<${event.type}>`,
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
   * Gets the error schema for this orchestrator
   */
  get systemErrorSchema(): ArvoContractRecord {
    return {
      type: this.registry.machines[0].contracts.self.systemError.type,
      schema: ArvoErrorSchema,
    };
  }
}
