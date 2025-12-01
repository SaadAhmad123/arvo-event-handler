import type { Span } from '@opentelemetry/api';
import type {
  ArvoContract,
  ArvoEvent,
  ArvoOrchestratorContract,
  ArvoSemanticVersion,
  CreateArvoEvent,
  InferArvoEvent,
  InferVersionedArvoContract,
  VersionedArvoContract,
} from 'arvo-core';
import type { EnqueueArvoEventActionParam } from '../ArvoMachine/types';
import type { OrchestrationExecutionMemoryRecord } from '../ArvoOrchestrationUtils/orchestrationExecutionState';
import type { IMachineMemory } from '../MachineMemory/interface';
import type { ArvoEventHandlerOtelSpanOptions, NonEmptyArray } from '../types';

/**
 * Extracts all possible event types (including system errors) from service contracts.
 */
type ExtractServiceEventTypes<TServiceContract extends Record<string, VersionedArvoContract<any, any>>> = {
  [K in keyof TServiceContract]:
    | {
        [L in keyof InferVersionedArvoContract<TServiceContract[K]>['emits']]: {
          type: InferVersionedArvoContract<TServiceContract[K]>['emits'][L]['type'];
          event: InferVersionedArvoContract<TServiceContract[K]>['emits'][L];
        };
      }[keyof InferVersionedArvoContract<TServiceContract[K]>['emits']]
    | {
        type: InferVersionedArvoContract<TServiceContract[K]>['systemError']['type'];
        event: InferVersionedArvoContract<TServiceContract[K]>['systemError'];
      };
}[keyof TServiceContract];

/**
 * Union of all service event type strings.
 */
type AllServiceEventTypes<TServiceContract extends Record<string, VersionedArvoContract<any, any>>> =
  ExtractServiceEventTypes<TServiceContract>['type'];

/**
 * Maps event type strings to their corresponding event schemas.
 */
type ServiceEventTypeMap<TServiceContract extends Record<string, VersionedArvoContract<any, any>>> = {
  [T in ExtractServiceEventTypes<TServiceContract> as T['type']]: T['event'];
};

/**
 * Handler function signature for processing events in ArvoResumable workflows.
 *
 * Handlers are invoked for each incoming event (initialization or service response)
 * and must be deterministic and idempotent to ensure reliable execution across retries.
 */
type Handler<
  TState extends ArvoResumableState<Record<string, any>>,
  TSelfContract extends VersionedArvoContract<any, any>,
  TServiceContract extends Record<string, VersionedArvoContract<any, any>>,
> = (param: {
  /** OpenTelemetry span for distributed tracing and observability */
  span: Span;

  /**
   * Complete workflow metadata including subject, parent info, and event history.
   * Null for new workflow initialization.
   */
  metadata: Omit<TState, 'state$$'> | null;

  /**
   * Map of collected service response events grouped by event type.
   * Enables type-safe access to accumulated responses from external services.
   * Events are collected based on matching parent IDs with emitted service calls.
   */
  collectedEvents: Partial<{
    [K in AllServiceEventTypes<TServiceContract>]: ServiceEventTypeMap<TServiceContract>[K][];
  }>;

  /** Domain information for routing events */
  domain: {
    /** Domain from the triggering event */
    event: string | null;
    /** Domain from the resumable's self contract */
    self: string | null;
  };

  /**
   * Current workflow state persisted from previous execution.
   * Null for new workflows or when no state has been saved yet.
   */
  context: TState['state$$'] | null;

  /**
   * Initialization event data for workflow start.
   * Only present when handler is processing the initialization event that starts the workflow.
   * Null for service response events.
   */
  input: InferVersionedArvoContract<TSelfContract>['accepts'] | null;

  /**
   * Service response event data.
   * Only present when handler is processing a response from an external service.
   * Null for initialization events.
   */
  service:
    | {
        [K in keyof TServiceContract]:
          | {
              [L in keyof InferVersionedArvoContract<TServiceContract[K]>['emits']]: InferVersionedArvoContract<
                TServiceContract[K]
              >['emits'][L];
            }[keyof InferVersionedArvoContract<TServiceContract[K]>['emits']]
          | InferVersionedArvoContract<TServiceContract[K]>['systemError'];
      }[keyof TServiceContract]
    | null;

  /** Contract definitions available to the handler */
  contracts: {
    /** The resumable's self contract for validation */
    self: TSelfContract;
    /** Service contracts for emitting compliant events to external systems */
    services: TServiceContract;
  };
}) => Promise<{
  /** Updated workflow state to persist for next invocation */
  context?: TState['state$$'];

  /**
   * Workflow completion data.
   * Returning this signals workflow completion and emits the final output event.
   * The workflow status becomes 'done' and no further events are processed.
   */
  output?: {
    [L in keyof InferVersionedArvoContract<TSelfContract>['emits']]: EnqueueArvoEventActionParam<
      InferVersionedArvoContract<TSelfContract>['emits'][L]['data'],
      InferVersionedArvoContract<TSelfContract>['emits'][L]['type']
    >['data'];
  }[keyof InferVersionedArvoContract<TSelfContract>['emits']] & {
    __id?: CreateArvoEvent<Record<string, unknown>, string>['id'];
    __executionunits?: CreateArvoEvent<Record<string, unknown>, string>['executionunits'];
    __domain?: NonEmptyArray<string | null>;
  };

  /**
   * Service call events to emit.
   * Each event triggers an external service and awaits its response in future invocations.
   * Responses are collected in `collectedEvents` based on parent ID matching.
   */
  services?: Array<
    {
      [K in keyof TServiceContract]: EnqueueArvoEventActionParam<
        InferVersionedArvoContract<TServiceContract[K]>['accepts']['data'],
        InferVersionedArvoContract<TServiceContract[K]>['accepts']['type']
      >;
    }[keyof TServiceContract]
  >;
  // biome-ignore lint/suspicious/noConfusingVoidType: Make the function more ergonomic in coding
} | void>;

/**
 * Versioned handler map for ArvoResumable workflows.
 *
 * Maps contract versions to their corresponding handler implementations.
 * Each version can have different business logic while maintaining backward compatibility.
 *
 * Handlers are invoked for initialization events and service responses matching the
 * resumable's contract. They must be deterministic and idempotent to ensure reliable
 * workflow execution across retries and failures.
 */
export type ArvoResumableHandler<
  TState extends ArvoResumableState<Record<string, any>>,
  TSelfContract extends ArvoContract,
  TServiceContract extends Record<string, VersionedArvoContract<any, any>>,
> = {
  [V in ArvoSemanticVersion & keyof TSelfContract['versions']]: Handler<
    TState,
    VersionedArvoContract<TSelfContract, V>,
    TServiceContract
  >;
};

/**
 * State structure persisted in memory for ArvoResumable workflows.
 *
 * Extends base orchestration state with resumable-specific fields including
 * event collection, workflow status tracking, and custom state management.
 */
export type ArvoResumableState<T extends Record<string, any>> = OrchestrationExecutionMemoryRecord<{
  /**
   * Current workflow status.
   *
   * Determines whether the workflow can process additional events:
   * - `'active'`: Workflow is running and accepts new events for processing
   * - `'done'`: Workflow has completed (handler returned `output`). No further events are processed.
   */
  status: 'active' | 'done';

  /**
   * Unique identifier for the workflow instance.
   * Serves as the key for state persistence in the memory store.
   */
  subject: string;

  /**
   * Parent orchestration subject for nested workflows.
   *
   * Enables hierarchical orchestration where one workflow spawns sub-workflows.
   * Completion events route back to this parent subject.
   *
   * - Root workflows: `null`
   * - Nested workflows: parent's subject identifier
   * - Source: `parentSubject$$` in initialization events
   */
  parentSubject: string | null;

  /**
   * ID of the event that initiated this workflow.
   *
   * Root identifier for tracing the complete execution chain.
   * Used as `parentid` for completion events to maintain lineage.
   *
   * - New workflows: current event's ID
   * - Resumed workflows: retrieved from stored state
   */
  initEventId: string;

  /**
   * Event history for the current invocation.
   * Transient collection tracking events consumed, produced, and expected.
   */
  events: {
    /** Event consumed in the last handler invocation */
    consumed: InferArvoEvent<ArvoEvent> | null;

    /** Events produced (with domain resolution) in the last invocation */
    produced: InferArvoEvent<ArvoEvent>[];

    /**
     * Service response events awaiting collection.
     *
     * Keyed by the emitted event's ID (parent ID of responses).
     * Responses are collected when their `parentid` matches a produced event's `id`.
     * Collected events are passed to the handler via `collectedEvents` parameter.
     */
    expected: Record<string, InferArvoEvent<ArvoEvent>[]> | null;
  };

  /**
   * Custom workflow state managed by the handler.
   * Accessible via the `context` parameter in handlers and persisted between invocations.
   */
  state$$: T | null;
}>;

/**
 * Configuration parameters for creating an ArvoResumable instance.
 *
 * Defines all required components for a resumable workflow orchestrator including
 * contracts, handlers, memory, and execution settings.
 */
export type ArvoResumableParam<
  TMemory extends Record<string, any>,
  TSelfContract extends ArvoOrchestratorContract,
  TServiceContract extends Record<string, VersionedArvoContract<any, any>>,
> = {
  /**
   * Contract definitions for the resumable's event interface.
   * Defines accepted events, emitted events, and service integrations.
   */
  contracts: {
    /**
     * Self contract defining initialization input and completion output structures.
     */
    self: TSelfContract;

    /**
     * Service contracts defining external service interfaces.
     * Enables type-safe event emission and response handling for external systems.
     */
    services: TServiceContract;
  };

  /** Computational cost metric for workflow operations */
  executionunits: number;

  /** Memory interface for state persistence and retrieval */
  memory: IMachineMemory<ArvoResumableState<TMemory>>;

  /** Whether to enforce resource locking for concurrent execution safety */
  requiresResourceLocking: boolean;

  /**
   * Versioned handler map for processing workflow events.
   * Each contract version maps to its corresponding handler implementation.
   */
  handler: ArvoResumableHandler<ArvoResumableState<TMemory>, TSelfContract, TServiceContract>;

  /**
   * Optional domains for system error event routing
   *
   * @default [ArvoDomain.FROM_PARENT_SUBJECT]
   */
  systemErrorDomain?: NonEmptyArray<string | null>;

  /** OpenTelemetry span configuration for distributed tracing */
  spanOptions?: ArvoEventHandlerOtelSpanOptions;
};

/**
 * Configuration parameters for creating an ArvoResumable instance.
 */
export type CreateArvoResumableParam<
  TMemory extends Record<string, any>,
  TSelfContract extends ArvoOrchestratorContract,
  TServiceContract extends Record<string, VersionedArvoContract<any, any>> = Record<
    string,
    VersionedArvoContract<any, any>
  >,
> = {
  /** Optional type hints for TypeScript inference (not used at runtime) */
  types?: {
    context?: Partial<TMemory>;
  };

  /** Contract definitions for event interface validation */
  contracts: {
    /** Self contract defining initialization and completion events */
    self: TSelfContract;
    /** Service contracts for external system integrations */
    services: TServiceContract;
  };

  /** Memory interface for state persistence */
  memory: IMachineMemory<Record<string, any>>;

  /** Versioned handler map for processing events */
  handler: ArvoResumableHandler<ArvoResumableState<TMemory>, TSelfContract, TServiceContract>;

  /**
   * Computational cost metric for operations.
   */
  executionunits?: number;

  /**
   * Whether to enforce resource locking for concurrent safety.
   * @default true if multiple service contracts, false otherwise
   */
  requiresResourceLocking?: boolean;

  /** Optional domains for system error event routing */
  systemErrorDomain?: NonEmptyArray<string | null>;

  /** OpenTelemetry span configuration for distributed tracing */
  spanOptions?: ArvoEventHandlerOtelSpanOptions;
};
