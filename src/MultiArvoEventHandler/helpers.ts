import MultiArvoEventHandler from '.';
import type { IMultiArvoEventHandler } from './types';

/**
 * Creates a MultiArvoEventHandler instance capable of handling multiple event types across different ArvoContracts.
 *
 * @param param - The configuration parameters for the event handler.
 * @returns A new instance of MultiArvoEventHandler.
 *
 * @remarks
 * This factory function instantiates a MultiArvoEventHandler, which is designed to process
 * multiple event types from various ArvoContracts. Unlike the more specialized ArvoEventHandler,
 * MultiArvoEventHandler offers greater flexibility by not being bound to a specific contract
 * or event type.
 *
 * Key features of MultiArvoEventHandler:
 * - Handles multiple event types
 * - Works across different ArvoContracts
 * - Provides a unified interface for diverse event processing
 *
 * The handler's behavior and resource allocation are determined by the provided configuration
 * parameters, including execution units and the event processing logic.
 *
 * @example
 * ```typescript
 * const multiEventHandler = createMultiArvoEventHandler({
 *   source: 'com.multi.handler',
 *   executionunits: 100,
 *   handler: async ({ event }) => {
 *     switch(event.type) {
 *       case 'com.user.registered':
 *         // Handle user registration event
 *         break;
 *       case 'com.transaction.complete':
 *         // Handle transaction completion event
 *         break;
 *       // ... handle other event types
 *     }
 *   }
 * });
 *
 * // Use the handler
 * await multiEventHandler.handleEvent(someEvent);
 * ```
 *
 * @see {@link IMultiArvoEventHandler} for the full configuration options
 * @see {@link MultiArvoEventHandler} for the handler class implementation
 */
export const createMultiArvoEventHandler = (param: IMultiArvoEventHandler): MultiArvoEventHandler =>
  new MultiArvoEventHandler(param);
