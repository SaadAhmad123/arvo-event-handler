import { Materializable } from '../types';

export type MachineMemoryMetadata = {
  /**
   * Workflow instance identifier (same as event.subject).
   * This unique identifier remains constant throughout the workflow's entire lifecycle.
   */
  subject: string;

  /**
   * Parent workflow's subject for tracking orchestration hierarchies.
   *
   * When materialized, a null value indicates this is a root workflow with no parent.
   * A string value indicates this is a child workflow with the specified parent subject.
   * A pending state means the parent context has not yet been determined.
   *
   * This enables hierarchical workflow tracking and cleanup strategies that differentiate
   * between root workflows, child workflows, and workflows with pending parent determination.
   */
  parentSubject: Materializable<string | null>;

  /**
   * Identifier of the entity or process that initiated this workflow.
   *
   * When materialized, contains the initiator's identifier.
   * A pending state means the initiator has not yet been determined.
   */
  initiator: Materializable<string>;

  /**
   * Orchestrator's source identifier (handler.source).
   * Identifies which orchestrator type is managing this workflow instance.
   */
  source: string;
};

/**
 * Manages workflow instance state with optimistic locking for orchestration handlers.
 *
 * Each workflow execution has a unique identifier (event.subject) that remains constant
 * throughout its entire lifecycle. This interface uses that subject as the key for all
 * state operations, enabling multiple concurrent executions of the same orchestrator
 * to maintain isolated state.
 *
 * Implements "fail fast on acquire, be tolerant on release" locking philosophy:
 * - Lock acquisition fails quickly after reasonable retries to prevent duplicate execution
 * - Lock release tolerates failures since TTL-based expiry provides automatic recovery
 *
 * @template T - Structure of the workflow state data stored per instance
 */
export interface IMachineMemory<T extends Record<string, any> = Record<string, any>> {
  /**
   * Retrieves persisted state for a specific workflow instance.
   *
   * The orchestrator calls this when resuming a workflow to load the context
   * needed to continue from where it previously stopped. Returns null for
   * new workflow instances that have no persisted state yet.
   *
   * Should implement minimal retries (2-3 attempts) with short backoff for
   * transient failures to avoid blocking event processing. Total operation
   * time should stay under 1 second.
   *
   * @param id - Workflow instance identifier (event.subject)
   * @param metadata - Workflow context (subject, parent subject, source)
   * @returns null if no state exists for this workflow instance, T if state found
   * @throws Error if read operation fails after retries (connection error, permission denied, etc.)
   */
  read(id: string, metadata: MachineMemoryMetadata | null): Promise<T | null>;

  /**
   * Persists updated state for a specific workflow instance.
   *
   * Called after the orchestrator processes an event and needs to save
   * the workflow's current context before terminating. The next event
   * for this workflow will load this saved state to resume execution.
   *
   * Should fail fast without retries - if persistence fails, the orchestrator
   * must know immediately to avoid state inconsistency. The caller handles
   * failures through retry mechanisms or dead letter queues.
   *
   * @param id - Workflow instance identifier (event.subject)
   * @param data - Current workflow state to persist
   * @param prevData - Previous state snapshot (can be used for compare-and-swap or audit trails)
   * @param metadata - Workflow context (subject, parent subject, source)
   * @throws Error if write operation fails
   */
  write(id: string, data: T, prevData: T | null, metadata: MachineMemoryMetadata | null): Promise<void>;

  /**
   * Acquires exclusive execution lock for a workflow instance.
   *
   * Prevents concurrent processing of the same workflow instance across
   * distributed orchestrator instances. The orchestrator acquires this lock
   * before reading/modifying state to ensure only one instance processes
   * events for this workflow at any given time.
   *
   * Should implement reasonable retries (2-3 attempts) with backoff for
   * transient lock conflicts, then fail fast. Returns false if another
   * instance holds the lock after retries exhausted.
   *
   * CRITICAL: Should set TTL when acquiring lock (typically 30s-5m based on
   * expected execution duration) to prevent permanent deadlocks if unlock fails.
   *
   * @param id - Workflow instance identifier (event.subject)
   * @param metadata - Workflow context (subject, parent subject, source)
   * @returns true if lock acquired successfully, false if lock held by another instance
   * @throws Error if lock operation itself fails (not same as lock being unavailable)
   */
  lock(id: string, metadata: MachineMemoryMetadata | null): Promise<boolean>;

  /**
   * Releases execution lock for a workflow instance.
   *
   * Called after the orchestrator finishes processing an event and persisting
   * state. Can retry a few times on transient failures but should not block
   * execution - the TTL-based expiry ensures eventual recovery even if unlock fails.
   *
   * The "be tolerant on release" philosophy means unlock failures don't cascade
   * into workflow failures. The lock will auto-expire via TTL, allowing the
   * workflow to resume after the timeout period.
   *
   * @param id - Workflow instance identifier (event.subject)
   * @param metadata - Workflow context (subject, parent subject, source)
   * @returns true if unlocked successfully, false if unlock failed (non-critical)
   */
  unlock(id: string, metadata: MachineMemoryMetadata | null): Promise<boolean>;

  /**
   * Optional cleanup hook invoked during successful workflow completion.
   *
   * The orchestrator calls this automatically when a workflow instance:
   * 1. Reaches a final completion state (terminal state or returns output)
   * 2. Successfully persists the final workflow state to storage
   *
   * This executes AFTER final state persistence but BEFORE the completion
   * event is emitted back to the initiator. This ordering ensures the final
   * state is durably saved before cleanup runs, while allowing cleanup logic
   * to complete before the workflow signals completion to external systems.
   *
   * IMPORTANT: This hook is NOT called when orchestration execution fails
   * (e.g., lock acquisition failure, state persistence failure, handler errors).
   * It only executes for workflows that successfully reach their final state.
   *
   * Receives the same state transition data as write() to enable intelligent
   * cleanup decisions based on how the workflow completed and what changed
   * in the final step.
   *
   * This hook enables custom memory management strategies:
   * - Mark state as eligible for garbage collection based on final state values
   * - Archive completed workflows to cold storage with state-dependent retention
   * - Implement conditional retention policies (e.g., keep failures longer than successes)
   * - Extract specific data from final state for long-term analytics storage
   * - Compare final vs previous state to determine appropriate storage tier
   * - Trigger external cleanup processes with workflow completion context
   *
   * Implementations are not required to delete state immediately - they can
   * implement whatever retention/archival strategy suits their operational needs.
   *
   * @param id - Workflow instance identifier (event.subject)
   * @param data - Final workflow state that was just persisted
   * @param prevData - Previous state before final persistence (null if this was first/only state)
   * @param metadata - Workflow context (subject, parent subject, source)
   */
  cleanup?(id: string, data: T, prevData: T | null, metadata: MachineMemoryMetadata | null): Promise<void>;
}
