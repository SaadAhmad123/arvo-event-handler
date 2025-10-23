import { type ArvoEvent, ViolationError, isViolationError } from 'arvo-core';

/**
 * Enumeration of transaction violation causes for state management operations.
 */
export const TransactionViolationCause = {
  /** Failed to read from machine memory */
  READ_FAILURE: 'READ_MACHINE_MEMORY_FAILURE',
  /** Failed to acquire lock on machine memory */
  LOCK_FAILURE: 'LOCK_MACHINE_MEMORY_FAILURE',
  /** Failed to write to machine memory */
  WRITE_FAILURE: 'WRITE_MACHINE_MEMORY_FAILURE',
  /** Lock acquisition was denied */
  LOCK_UNACQUIRED: 'LOCK_UNACQUIRED',
  /** Event subject format is invalid */
  INVALID_SUBJECT: 'INVALID_SUBJECT',
} as const;

export type TransactionViolationCauseType = (typeof TransactionViolationCause)[keyof typeof TransactionViolationCause];

/**
 * Error representing failures in orchestrator state transaction operations.
 *
 * Indicates issues with lock acquisition, state persistence, or memory access
 * during orchestration execution. These errors typically trigger retries.
 */
export class TransactionViolation extends ViolationError<'OrchestratorTransaction'> {
  /** Specific cause of the transaction failure */
  readonly cause: TransactionViolationCauseType;

  constructor(param: {
    cause: TransactionViolationCauseType;
    message: string;
    initiatingEvent: ArvoEvent;
  }) {
    super({
      type: 'OrchestratorTransaction',
      message: `[${param.cause}] ${param.message}`,
      metadata: {
        initiatingEvent: param.initiatingEvent,
      },
    });
    this.cause = param.cause;
  }
}

/**
 * Type guard checking if an error is a TransactionViolation.
 *
 * @param error - Error to check
 * @param cause - Optional specific cause to match
 * @returns True if error is TransactionViolation with optional matching cause
 */
export const isTransactionViolationError = (error: unknown, cause?: TransactionViolationCauseType) => {
  return (
    isViolationError(error) &&
    (error as TransactionViolation).type === 'OrchestratorTransaction' &&
    (cause ? (error as TransactionViolation).cause === cause : true)
  );
};
