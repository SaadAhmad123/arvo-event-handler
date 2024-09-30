import { ArvoContractRecord, ArvoEvent } from "arvo-core";

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
   * @param {ArvoEvent} event - The Arvo event to be processed.
   * @returns {Promise<ArvoEvent[]>} A promise that resolves to an array of resulting Arvo events.
   * 
   * @description
   * This method should contain the core logic for processing an Arvo event.
   * Implementations should handle the event according to their specific requirements
   * and return any resulting events.
   * 
   * @throws {Error} Implementations may throw errors for invalid inputs or processing failures.
   * 
   * @remarks
   * - The method is asynchronous to allow for potentially time-consuming operations.
   * - The returned array may be empty if no new events are generated as a result of processing.
   * - Implementations should ensure proper error handling and event validation.
   */
  public abstract execute(event: ArvoEvent): Promise<ArvoEvent[]>; 

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
  public abstract get systemErrorSchema(): ArvoContractRecord
}