import { type ArvoEvent, ViolationError, isViolationError } from 'arvo-core';

export const TransactionViolationCause = {
  READ_FAILURE: 'READ_MACHINE_MEMORY_FAILURE',
  LOCK_FAILURE: 'LOCK_MACHINE_MEMORY_FAILURE',
  WRITE_FAILURE: 'WRITE_MACHINE_MEMORY_FAILURE',
  LOCK_UNACQUIRED: 'LOCK_UNACQUIRED',
  INVALID_SUBJECT: 'INVALID_SUBJECT',
} as const;

export type TransactionViolationCauseType = (typeof TransactionViolationCause)[keyof typeof TransactionViolationCause];

export class TransactionViolation extends ViolationError<'OrchestratorTransaction'> {
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

export const isTransactionViolationError = (error: unknown, cause?: TransactionViolationCauseType) => {
  return (
    isViolationError(error) &&
    (error as TransactionViolation).type === 'OrchestratorTransaction' &&
    (cause ? (error as TransactionViolation).cause === cause : true)
  );
};
