import type { ArvoContractRecord, ArvoEvent } from 'arvo-core';
import type { ArvoEventHandlerOpenTelemetryOptions } from '../types';

/**
 * The interface for Arvo event handlers.
 *
 * This class defines the basic structure for all Arvo event handlers.
 * It provides an abstract method for executing events, which must be
 * implemented by any concrete subclass.
 */
export default interface IArvoEventHandler {
  /**
   * Unique identifier for the event handler source system
   */
  source: string;

  /**
   * Executes the event handling logic for a given Arvo event.
   *
   * @param event - The Arvo event to be processed.
   * @param opentelemetry - Configuration for OpenTelemetry integration
   *
   * @returns A promise that resolves to an array of resulting Arvo events.
   * These events represent the outcome of processing the input event.
   */
  execute(
    event: ArvoEvent,
    opentelemetry?: ArvoEventHandlerOpenTelemetryOptions,
  ): Promise<{
    events: ArvoEvent[];
  }>;

  /**
   * Provides the schema for system error events.
   *
   * @returns An object containing the error event type and schema.
   *
   * This defines the structure for system error events that may be emitted
   * when an unexpected error occurs during event handling.
   */
  systemErrorSchema: ArvoContractRecord;
}
