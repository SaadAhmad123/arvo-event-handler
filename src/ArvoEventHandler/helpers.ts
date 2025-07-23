import type { ArvoContract } from 'arvo-core';
import ArvoEventHandler from '.';
import type { IArvoEventHandler } from './types';

/**
 * Creates an instance of `ArvoEventHandler`
 *
 * ArvoEventHandler is the core component for processing events in the Arvo system. It enforces
 * contracts between services by ensuring that all events follow their specified formats and rules.
 *
 * The handler is built on two fundamental patterns: Meyer's Design by Contract and Fowler's
 * Tolerant Reader. It binds to an ArvoContract that defines what events it can receive and send
 * across all versions. This versioning is strict - the handler must implement every version defined
 * in its contract, or it will fail both at compile time and runtime.
 *
 * Following the Tolerant Reader pattern, the handler accepts any incoming event but only processes
 * those that exactly match one of its contract versions. When an event matches, it's handled by
 * the specific implementation for that version. This approach maintains compatibility while
 * ensuring precise contract adherence.
 *
 * The handler uses Zod for validation, automatically checking both incoming and outgoing events.
 * This means it not only verifies data formats but also applies default values where needed and
 * ensures all conditions are met before and after processing.
 *
 * ## Event Processing Lifecycle
 *
 * 1. **Type Validation**: Ensures the incoming event type matches the handler's contract
 * 2. **Contract Resolution**: Extracts version from dataschema and resolves appropriate contract version
 * 3. **Schema Validation**: Validates event data against the contract's accepts schema
 * 4. **Handler Execution**: Invokes the version-specific handler implementation
 * 5. **Response Processing**: Validates and structures handler output into events
 * 6. **Routing Configuration**: Applies routing logic based on handler output and event context
 * 7. **Telemetry Integration**: Records processing metrics and tracing information
 *
 * ## Error Handling Strategy
 *
 * The handler divides issues into two distinct categories:
 *
 * - **Violations** are serious contract breaches that indicate fundamental problems with how services
 *   are communicating. These errors bubble up to the calling code, allowing developers to handle
 *   these critical issues explicitly. Violations include contract mismatches, schema validation
 *   failures, and configuration errors.
 *
 * - **System Error Events** cover normal runtime errors that occur during event processing. These are
 *   typically workflow-related issues that need to be reported back to the event's source but don't
 *   indicate a broken contract. System errors are converted to structured error events and returned
 *   in the response.
 *
 * ## Domain-Aware Processing
 *
 * The handler supports sophisticated domain-based routing with a flexible inheritance pattern:
 * - Provides both source and target domain context to handler implementations
 * - Supports explicit domain override for cross-domain workflows
 * - **Multi-domain broadcasting**: Handlers can emit events to multiple domains simultaneously
 * - Enables specialized processing pipelines (human.review, priority.high, etc.)
 * - **Domain Priority**: Handler result > Source event domain > Handler contract domain > null
 * - Setting domain to null explicitly disables domain-based routing for specific events
 *
 * @template TContract The ArvoContract type that defines the event schemas and validation rules
 *
 * @example
 * ```typescript
 * const handler = createArvoEventHandler({
 *   contract: userContract,
 *   executionunits: 1,
 *   handler: {
 *     '1.0.0': async ({ event, domain, span }) => {
 *       // Single domain assignment
 *       return {
 *         type: 'evt.user.created',
 *         data: result,
 *         domain: ['analytics.realtime']
 *       };
 *
 *       // Multi-domain broadcasting
 *       return {
 *         type: 'evt.user.created',
 *         data: result,
 *         domain: ['analytics.realtime', 'notifications.email', 'compliance.audit']
 *         // Creates 3 separate events, one for each domain
 *       };
 *
 *       // Context preservation (no domain specified)
 *       return {
 *         type: 'evt.user.created',
 *         data: result
 *         // Inherits domain from source event or contract
 *       };
 *
 *       // Disable domain routing
 *       return {
 *         type: 'evt.user.created',
 *         data: result,
 *         domain: null
 *       };
 *     }
 *   }
 * });
 * ```
 */
export const createArvoEventHandler = <TContract extends ArvoContract>(
  param: IArvoEventHandler<TContract>,
): ArvoEventHandler<TContract> => new ArvoEventHandler<TContract>(param);
