import type { ArvoContract } from 'arvo-core';
import ArvoEventHandler from '.';
import type { IArvoEventHandler } from './types';

/**
 * Create the instance of `ArvoEventHandler`
 *
 * > **Caution:** Don't use domained contracts unless it is fully intentional. Using domained
 * contracts causes implicit domain assignment which can be hard to track and confusing. For 99%
 * of the cases you dont need domained contracts
 *
 * ArvoEventHandler is the core component for processing events in the Arvo system. It enforces
 * contracts between services by ensuring that all events follow their specified formats and rules.
 *
 * ## Event Processing Lifecycle
 *
 * 1. **Type Validation**: Ensures the incoming event type matches the handler's contract
 * 2. **Contract Resolution**: Extracts version from dataschema and resolves appropriate contract version
 * 3. **Schema Validation**: Validates event data against the contract's accepts schema
 * 4. **Handler Execution**: Invokes the version-specific handler implementation
 * 5. **Response Processing**: Validates and structures handler output into events
 * 6. **Domain Broadcasting**: Creates multiple events for multi-domain distribution if specified
 * 7. **Routing Configuration**: Applies routing logic based on handler output and event context
 * 8. **Telemetry Integration**: Records processing metrics and tracing information
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
 *   in the response. **Multi-domain error broadcasting** ensures error events reach all relevant
 *   processing contexts (source event domain, handler contract domain, and null domain).
 *
 * ## Multi-Domain Event Broadcasting
 *
 * The handler supports sophisticated multi-domain event distribution patterns:
 * - **Single domain**: `domain: ['analytics.realtime']` creates one event
 * - **Multi-domain broadcast**: `domain: ['analytics', 'notifications', 'audit']` creates separate events for each domain
 * - **Mixed broadcasting**: `domain: ['analytics', undefined, null]` creates events for analytics, contract domain (if exists), and no domain
 * - **Domain inheritance**: `domain: undefined` (or omitted) uses event domain → contract domain → null priority
 * - **Domain disabling**: `domain: [null]` creates single event with no domain routing
 * - **Automatic deduplication**: Duplicate domains in arrays are automatically removed
 *
 * This enables powerful patterns like simultaneous real-time processing, audit trails, and notification delivery
 * from a single handler execution.
 *
 * @example
 * ```typescript
 * const handler = createArvoEventHandler({
 *   contract: userContract,
 *   executionunits: 1,
 *   handler: {
 *     '1.0.0': async ({ event, domain, span }) => {
 *       const userData = await processUser(event.data);
 *
 *       // Multi-domain broadcasting - creates 3 separate events
 *       return {
 *         type: 'evt.user.created',
 *         data: userData,
 *         domain: ['analytics.realtime', 'notifications.email', 'compliance.audit']
 *       };
 *
 *       // Mixed domain patterns
 *       return {
 *         type: 'evt.user.created',
 *         data: userData,
 *         // De-duplication is handled by the handler internally
 *         domain: ['analytics', undefined, null, domain.event] // analytics + contract domain + no-domain + event's own domain
 *         // alternatively, this make the whole thing more intentional
 *         domain: ['analytics', domain.self, null, domain.event] // analytics + contract domain + no-domain + event's own domain
 *       };
 *
 *       // Single domain (traditional)
 *       return {
 *         type: 'evt.user.created',
 *         data: userData,
 *         domain: ['priority.high'] // Single event to high-priority domain
 *       };
 *
 *       // Disable all domain routing
 *       return {
 *         type: 'evt.user.created',
 *         data: userData,
 *         domain: null // Single event, no domain processing
 *       };
 *     }
 *   }
 * });
 * ```
 */
export const createArvoEventHandler = <TContract extends ArvoContract>(
  param: IArvoEventHandler<TContract>,
): ArvoEventHandler<TContract> => new ArvoEventHandler<TContract>(param);
