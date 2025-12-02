import type { ArvoEvent, InferArvoEvent } from 'arvo-core';
import type { Snapshot } from 'xstate';
import type ArvoMachine from '../ArvoMachine';
import type { OrchestrationExecutionMemoryRecord } from '../ArvoOrchestrationUtils/orchestrationExecutionState';
import type { IMachineExectionEngine } from '../MachineExecutionEngine/interface';
import type { IMachineMemory } from '../MachineMemory/interface';
import type { IMachineRegistry } from '../MachineRegistry/interface';
import type { ArvoEventHandlerOtelSpanOptions, NonEmptyArray } from '../types';

/**
 * Discriminated union representing the result of a try operation.
 */
export type TryFunctionOutput<TData, TError extends Error> =
  | {
      type: 'success';
      data: TData;
    }
  | {
      type: 'error';
      error: TError;
    };

/**
 * State record persisted in machine memory for orchestration execution.
 *
 * Extends the base orchestration execution record with machine-specific state
 * including XState snapshots, event history, and hierarchical orchestration context.
 */
export type MachineMemoryRecord = OrchestrationExecutionMemoryRecord<{
  /** Unique identifier for this orchestration instance */
  subject: string;

  /**
   * Parent orchestration subject for nested workflows.
   *
   * Enables hierarchical orchestration patterns where one orchestration spawns
   * sub-orchestrations. When the current orchestration completes, its completion
   * event routes back to this parent subject.
   *
   * - Root orchestrations: `null`
   * - Nested orchestrations: parent's subject identifier
   * - Source: `parentSubject$$` field in initialization events
   */
  parentSubject: string | null;

  /**
   * ID of the event that initiated this orchestration workflow.
   *
   * Serves as the root identifier for tracing the complete execution chain.
   * Used as `parentid` for completion events to maintain lineage back to
   * the workflow's origin.
   *
   * - New orchestrations: set to current event's ID
   * - Resumed orchestrations: retrieved from stored state
   */
  initEventId: string;

  /**
   * Current machine execution status.
   *
   * Common values include:
   * - `'active'`: Machine is executing
   * - `'done'`: Machine completed successfully
   * - `'error'`: Machine encountered an error
   * - `'stopped'`: Machine was explicitly stopped
   *
   * Custom values can be defined in the state machine configuration.
   */
  status: string;

  /** Current state value (string for simple states, object for compound states) */
  value: string | Record<string, any> | null;

  /** XState snapshot representing the complete machine state */
  state: Snapshot<any>;

  /**
   * Event history from the last execution session.
   */
  events: {
    /** Event consumed by the machine in the last session */
    consumed: InferArvoEvent<ArvoEvent> | null;
    /** Events produced by the machine in the last session */
    produced: InferArvoEvent<ArvoEvent>[];
  };

  /** Serialized machine definition for debugging and inspection */
  machineDefinition: string | null;
}>;

/**
 * Configuration parameters for ArvoOrchestrator constructor.
 *
 * Defines all required components and settings for orchestrator initialization.
 * For simplified creation with default components, use {@link createArvoOrchestrator}.
 */
export type ArvoOrchestratorParam = {
  /** Computational cost metric assigned to orchestrator operations */
  executionunits: number;

  /** Memory interface for state persistence and retrieval */
  memory: IMachineMemory<MachineMemoryRecord>;

  /** Registry for managing and resolving machine instances */
  registry: IMachineRegistry;

  /** Engine responsible for executing state machine logic */
  executionEngine: IMachineExectionEngine;

  /** Whether to enforce resource locking for concurrent safety */
  requiresResourceLocking: boolean;

  /** OpenTelemetry span configuration for distributed tracing */
  spanOptions?: ArvoEventHandlerOtelSpanOptions;

  /**
   * Optional default domains for the events emitted
   * by the orchestrator.
   */
  defaultEventEmissionDomains?: {
    /**
     * Default domains for system error events emitted by this orchestrator.
     *
     * System errors are routed through these domains when the handler encounters
     * unhandled exceptions or critical failures.
     *
     * @default [ArvoDomain.ORCHESTRATION_CONTEXT]
     */
    systemError?: NonEmptyArray<string | null>;

    /**
     * Default domains for service events emitted by this orchestrator.
     *
     * The service xstate.emit function can over-ride this default.
     *
     * @default [ArvoDomain.LOCAL]
     */
    services?: NonEmptyArray<string | null>;

    /**
     * Defauld domain for the final completion event emitted by this orchestrator
     *
     * Completion event is routed through these domains when the orchestrator successfully
     * processes an init event. The machine 'output' transform function implementations can override
     * this default.
     *
     * @default [ArvoDomain.ORCHESTRATION_CONTEXT]
     */
    complete?: NonEmptyArray<string | null>;
  };
};

/**
 * Configuration parameters for creating an orchestrator via factory function.
 *
 * Simplified interface for {@link createArvoOrchestrator} that automatically
 * constructs default registry and execution engine components.
 */
export type CreateArvoOrchestratorParam = Pick<
  ArvoOrchestratorParam,
  'memory' | 'executionunits' | 'spanOptions' | 'defaultEventEmissionDomains'
> & {
  /**
   * Optional override for resource locking requirement.
   *
   * When undefined, locking is automatically enabled if any machine requires it.
   * Explicitly set to control locking behavior regardless of machine requirements.
   *
   * Resource locking is needed when:
   * - Machines contain parallel states with simultaneous active states
   * - Preventing race conditions in concurrent event processing
   * - Maintaining state consistency across distributed executions
   *
   * @default undefined - auto-determined from machines
   */
  requiresResourceLocking?: ArvoOrchestratorParam['requiresResourceLocking'];

  /**
   * State machines to register with the orchestrator.
   *
   * All machines must share the same source identifier and have unique versions.
   * At least one machine is required.
   */
  machines: ArvoMachine<any, any, any, any, any>[];
};
