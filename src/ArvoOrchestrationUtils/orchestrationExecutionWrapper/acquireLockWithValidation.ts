import type { Span } from '@opentelemetry/api';
import { type ArvoEvent, logToSpan } from 'arvo-core';
import type { SyncEventResource } from '../../SyncEventResource';
import type { AcquiredLockStatusType } from '../../SyncEventResource/types';
import { TransactionViolation, TransactionViolationCause } from '../error';

/**
 * Acquires an exclusive lock for event processing with validation.
 *
 * Attempts to obtain a lock on the event's subject to ensure exclusive access during
 * processing. Throws if lock cannot be acquired, preventing concurrent modifications.
 * @throws {TransactionViolation} When lock cannot be acquired
 */
export const acquireLockWithValidation = async (
  syncEventResource: SyncEventResource<Record<string, any>>,
  event: ArvoEvent,
  span: Span,
): Promise<AcquiredLockStatusType> => {
  const acquiredLock = await syncEventResource.acquireLock(event, span);

  if (acquiredLock === 'NOT_ACQUIRED') {
    throw new TransactionViolation({
      cause: TransactionViolationCause.LOCK_UNACQUIRED,
      message: 'Lock acquisition denied - Unable to obtain exclusive access to event processing',
      initiatingEvent: event,
    });
  }

  if (acquiredLock === 'ACQUIRED') {
    logToSpan(
      {
        level: 'INFO',
        message: `This execution acquired lock at resource '${event.subject}'`,
      },
      span,
    );
  }

  return acquiredLock;
};
