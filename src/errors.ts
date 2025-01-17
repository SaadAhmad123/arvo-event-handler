import { ViolationError } from 'arvo-core';

/**
 * Represents violations of service contracts, typically involving invalid inputs,
 * outputs, or state transitions that break expected invariants.
 */
export class ContractViolation extends ViolationError<'Contract'> {
  constructor(message: string, metadata?: Record<string, any>) {
    super({
      type: 'Contract',
      message,
      metadata,
    });
  }
}

/**
 * Represents violations related to system configuration, typically involving
 * missing, invalid, or conflicting configuration requirement by the event
 * being processed.
 */
export class ConfigViolation extends ViolationError<'Config'> {
  constructor(message: string, metadata?: Record<string, any>) {
    super({
      type: 'Config',
      message,
      metadata,
    });
  }
}

/**
 * Represents violations that occur during system execution, typically involving
 * runtime failures that require explicit handling or intervention. This allow
 * the developer to throw an error which must be handled explicity at `.execute`
 * of an Arvo event handler. Otherwise, the the error throw during exection are
 * converted to system error event and require to be handled by the workflow
 * orchestration.
 * 
 * @example
 * ```typescript
 * throw new ExecutionViolation(
 *   'API rate limit exceeded',
 *   { 
 *     rateLimitRemaining: 0,
 *     resetAfterSeconds: 60
 *   }
 * );
 * ```
 */
export class ExecutionViolation extends ViolationError<'Execution'> {
  constructor(message: string, metadata?: Record<string, any>) {
    super({
      type: 'Execution',
      message,
      metadata,
    });
  }
}