import type { Span } from '@opentelemetry/api';
import {
  type ArvoContract,
  type ArvoEvent,
  EventDataschemaUtil,
  VersionedArvoContract,
  isWildCardArvoSematicVersion,
  logToSpan,
} from 'arvo-core';
import type { z } from 'zod';

/**
 * Result type for event validation operations.
 *
 * Discriminated union representing all possible validation outcomes:
 * - VALID: Event passed all validation checks
 * - CONTRACT_UNRESOLVED: No matching contract found for the event
 * - INVALID: Event dataschema conflicts with contract (URI or version mismatch)
 * - INVALID_DATA: Event data doesn't match contract schema (Zod validation failure)
 */
export type EventValidationResult =
  | {
      type: 'VALID';
      contractType: 'self' | 'service';
    }
  | {
      type: 'CONTRACT_UNRESOLVED';
    }
  | {
      type: 'INVALID';
      error: Error;
    }
  | {
      type: 'INVALID_DATA';
      error: z.ZodError;
    };

/**
 * Configuration for event validation.
 */
export type EventValidationConfig = {
  /** The event to validate */
  event: ArvoEvent;
  /** Self contract for initialization event validation */
  selfContract: VersionedArvoContract<any, any> | ArvoContract;
  /** Service contracts for response event validation */
  serviceContracts: Record<string, VersionedArvoContract<any, any>>;
  /** Optional OpenTelemetry span for logging */
  span?: Span;
};

/**
 * Validates an event against provided contracts.
 *
 * Performs comprehensive validation including:
 * - Dataschema parsing and resolution
 * - Contract resolution (self vs service)
 * - URI and version compatibility checks
 * - Schema-based data validation
 */
export function validateInputEvent({
  event,
  selfContract,
  serviceContracts,
  span,
}: EventValidationConfig): EventValidationResult {
  let resolvedContract: VersionedArvoContract<any, any> | null = null;
  let contractType: 'self' | 'service';

  const parsedEventDataSchema = EventDataschemaUtil.parse(event);
  if (!parsedEventDataSchema) {
    const errorMessage = `Event dataschema resolution failed: Unable to parse dataschema='${event.dataschema}' for event(id='${event.id}', type='${event.type}'). This makes the event opaque and does not allow contract resolution`;
    logToSpan(
      {
        level: 'WARNING',
        message: errorMessage,
      },
      span,
    );
    return {
      type: 'INVALID',
      error: new Error(errorMessage),
    };
  }

  const selfType = selfContract instanceof VersionedArvoContract ? selfContract.accepts.type : selfContract.type;
  if (event.type === selfType) {
    contractType = 'self';
    resolvedContract =
      selfContract instanceof VersionedArvoContract
        ? selfContract
        : selfContract.version(parsedEventDataSchema.version);
  } else {
    contractType = 'service';
    // Search through service contracts for matching event type
    for (const contract of Object.values(serviceContracts)) {
      if (resolvedContract) break;
      // Check both emitted events and system error
      for (const emitType of [...contract.emitList, contract.systemError]) {
        if (resolvedContract) break;
        if (event.type === emitType.type) {
          resolvedContract = contract;
        }
      }
    }
  }

  if (!resolvedContract) {
    const errorMessage = `Contract resolution failed: No matching contract found for event (id='${event.id}', type='${event.type}')`;
    logToSpan(
      {
        level: 'WARNING',
        message: errorMessage,
      },
      span,
    );
    return {
      type: 'CONTRACT_UNRESOLVED',
    };
  }

  logToSpan(
    {
      level: 'INFO',
      message: `Dataschema resolved: ${event.dataschema} matches contract(uri='${resolvedContract.uri}', version='${resolvedContract.version}')`,
    },
    span,
  );

  if (parsedEventDataSchema.uri !== resolvedContract.uri) {
    return {
      type: 'INVALID',
      error: new Error(
        `Contract URI mismatch: ${contractType} Contract(uri='${resolvedContract.uri}', type='${resolvedContract.accepts.type}') does not match Event(dataschema='${event.dataschema}', type='${event.type}')`,
      ),
    };
  }

  if (
    !isWildCardArvoSematicVersion(parsedEventDataSchema.version) &&
    parsedEventDataSchema.version !== resolvedContract.version
  ) {
    return {
      type: 'INVALID',
      error: new Error(
        `Contract version mismatch: ${contractType} Contract(version='${resolvedContract.version}', type='${resolvedContract.accepts.type}', uri=${resolvedContract.uri}) does not match Event(dataschema='${event.dataschema}', type='${event.type}')`,
      ),
    };
  }

  const validationSchema: z.AnyZodObject =
    contractType === 'self'
      ? resolvedContract.accepts.schema
      : (resolvedContract.emits[event.type] ?? resolvedContract.systemError.schema);

  const validationResult = validationSchema.safeParse(event.data);
  if (!validationResult.success) {
    return {
      type: 'INVALID_DATA',
      error: validationResult.error,
    };
  }

  return {
    type: 'VALID',
    contractType,
  };
}
