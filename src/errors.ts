import { ViolationError } from 'arvo-core';

/**
 * ContractViolation indicates a critical mismatch between services where event data
 * violates the receiving handler's contract. This represents a serious system issue
 * where services are out of sync with their contracts. Common causes include:
 * - Upstream services sending malformed data
 * - Breaking changes in contracts without proper version management
 * - Implicit assumptions in handlers not covered by contracts
 *
 * Requires explicit handling as it signals potential system-wide contract violations.
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
 * ConfigViolation indicates system configuration or routing issues where events
 * are mismatched with their handlers. This occurs separately from contract
 * violations and represents problems with the system topology itself, such as:
 * - Events sent to handlers not configured to process them
 * - Mismatched event types not covered by handler contracts
 * - Configuration conflicts between services
 *
 * Requires explicit resolution as it indicates fundamental routing or setup issues.
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
 * ExecutionViolation represents runtime failures requiring explicit intervention
 * outside normal error flow. Unlike regular errors that convert to system error
 * events, these violations demand special handling at the handler's .execute level.
 *
 * Use sparingly - most runtime errors should flow through standard system error
 * events. Reserve ExecutionViolation for cases requiring custom error handling
 * logic that can't be managed through normal event patterns.
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
