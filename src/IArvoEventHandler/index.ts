import type { ArvoContractRecord, ArvoEvent } from 'arvo-core';
import type { ArvoEventHandlerOpenTelemetryOptions } from '../types';

/**
 * Interface for Arvo event handlers.
 *
 * Defines the contract for all event handlers in the Arvo system, including
 * orchestrators, resumable handlers, and custom handlers. Each handler must
 * implement event execution logic and provide system error schema configuration.
 */
export default interface IArvoEventHandler {
  /**
   * Unique identifier for the event handler's source system.
   * Used for event routing and tracing throughout the system.
   */
  source: string;

  /**
   * Executes the event handling logic for an incoming Arvo event.
   *
   * Processes the event according to the handler's business logic and returns
   * resulting events to be emitted. The handler may emit multiple events as
   * outcomes of processing a single input event.
   *
   * For violation errors (transaction, execution, contract, config), implementations
   * typically throw the error to enable retry mechanisms. For non-violation errors,
   * implementations typically emit system error events to the workflow initiator.
   *
   * @param event - The Arvo event to be processed
   * @param opentelemetry - Optional configuration for distributed tracing integration
   * @returns Promise resolving to an object containing emitted events
   *
   * @throws {ViolationError} When retriable errors occur (lock failures, validation errors, etc.)
   */
  execute(
    event: ArvoEvent,
    opentelemetry?: ArvoEventHandlerOpenTelemetryOptions,
  ): Promise<{
    events: ArvoEvent[];
  }>;

  /**
   * Schema configuration for system error events.
   *
   * Defines the structure and routing for error events emitted when unexpected
   * errors occur during event handling. System errors are sent to the workflow
   * initiator to signal terminal failures that cannot be automatically recovered.
   *
   * @property type - The error event type identifier
   * @property schema - Zod schema defining the error event data structure
   */
  systemErrorSchema: ArvoContractRecord;
}
