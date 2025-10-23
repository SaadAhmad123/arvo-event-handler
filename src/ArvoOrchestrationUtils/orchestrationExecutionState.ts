/**
 * Enumeration of possible orchestration execution statuses.
 *
 * Determines whether an orchestration is executing normally or has encountered
 * a terminal failure requiring error event emission.
 */
export const OrchestrationExecutionStatus = {
  /** Orchestration is executing normally */
  NORMAL: 'normal',
  /** Orchestration has failed and entered terminal error state */
  FAILURE: 'failure',
} as const;

/**
 * Discriminated union representing persisted orchestration state.
 *
 * The execution status discriminates between normal execution state (containing
 * full orchestration data) and failure state (containing minimal error context).
 *
 * **Normal state**: Contains complete orchestration data including machine state,
 * event history, and all custom fields from type parameter T.
 *
 * **Failure state**: Contains only essential error information (error object, subject)
 * with partial custom fields. Once in failure state, the orchestration ignores
 * subsequent events and does not execute further.
 *
 * @template T - Custom state fields specific to the orchestration type
 */
export type OrchestrationExecutionMemoryRecord<T extends Record<string, unknown>> =
  | (T & {
      executionStatus: typeof OrchestrationExecutionStatus.NORMAL;
    })
  | (Partial<T> & {
      executionStatus: typeof OrchestrationExecutionStatus.FAILURE;
      error: Error;
      subject: string;
    });
