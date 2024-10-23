import { Tracer } from '@opentelemetry/api';
import { ArvoContractRecord, ArvoEvent } from 'arvo-core';
import { ExecutionOpenTelemetryConfiguration } from './types';

/**
 * Abstract base class for Arvo event handlers.
 *
 * @abstract
 * @description
 * This class defines the basic structure for all Arvo event handlers.
 * It provides an abstract method for executing events, which must be
 * implemented by any concrete subclass.
 * ```
 */
export default abstract class AbstractArvoEventHandler {
  /**
   * Executes the event handling logic for a given Arvo event.
   *
   * @abstract
   * @param {ArvoEvent} event - The Arvo event to be processed. This event should conform
   *                           to the expected schema for the specific handler implementation.
   * @param {ExecutionOpenTelemetryConfiguration} opentelemetry - Configuration for OpenTelemetry
   *                                                             integration, including tracing options
   *                                                             and context inheritance settings.
   * @returns {Promise<ArvoEvent[]>} A promise that resolves to an array of resulting Arvo events.
   *                                 These events represent the outcome of processing the input event.
   *
   * @description
   * This method defines the core event processing logic that each concrete handler must implement.
   * It should handle the complete lifecycle of an event, including:
   * - Validation of the input event
   * - Processing of the event according to business rules
   * - Generation of any resulting events
   * - Error handling and reporting
   * - OpenTelemetry integration for observability
   *
   * @throws {Error}
   * - When the input event fails validation
   * - When processing encounters an unrecoverable error
   * - When the handler is unable to properly execute the event
   *
   * @remarks
   * Implementation considerations:
   * - Ensure proper error handling and event validation
   * - Implement appropriate retry logic for transient failures
   * - Use the provided OpenTelemetry configuration for tracing
   * - Consider performance implications for long-running operations
   * - Maintain idempotency where appropriate
   * - Document any specific requirements for event schemas
   *
   * The method should handle observability concerns by:
   * - Creating appropriate spans for tracing
   * - Recording relevant attributes and events
   * - Properly handling span lifecycle (creation and completion)
   * - Propagating context appropriately
   */
  public abstract execute(
    event: ArvoEvent,
    opentelemetry: ExecutionOpenTelemetryConfiguration,
  ): Promise<ArvoEvent[]>;

  /**
   * Provides the schema for system error events.
   *
   * @abstract
   * @returns {ArvoContractRecord} An object containing the error event type and schema.
   *
   * @description
   * This getter should define the structure for system error events that may be emitted
   * when an unexpected error occurs during event handling.
   *
   * @remarks
   * - The returned ArvoContractRecord typically includes:
   *   - `type`: A string representing the error event type.
   *   - `schema`: The schema definition for the error event.
   * - Implementations should ensure that the error schema is consistent with the
   *   overall system's error handling strategy.
   * - The error event type often follows a pattern like 'sys.[eventType].error'.
   *
   * @example
   * ```typescript
   * public get systemErrorSchema(): ArvoContractRecord {
   *   return {
   *     type: 'sys.myEvent.error',
   *     schema: MyCustomErrorSchema
   *   };
   * }
   * ```
   */
  public abstract get systemErrorSchema(): ArvoContractRecord;
}
