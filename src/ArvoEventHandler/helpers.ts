import { ArvoContract } from 'arvo-core';
import { IArvoEventHandler } from './types';
import ArvoEventHandler from '.';

/**
 * Creates an ArvoEventHandler instance for a given ArvoContract.
 *
 * @template TContract - The type of ArvoContract this handler is associated with.
 * @param param - The configuration parameters for the event handler.
 * @returns A new instance of ArvoEventHandler<TContract>.
 *
 * @remarks
 * This function is a factory for creating ArvoEventHandler instances.
 * It encapsulates the creation process and provides a convenient way to instantiate
 * handlers for specific Arvo contracts.
 *
 * @example
 * ```typescript
 * const myContract = new ArvoContract(...);
 * const myHandler = createArvoEventHandler({
 *   contract: myContract,
 *   executionunits: 100,
 *   handler: async ({ event }) => {
 *     // Handler implementation
 *   }
 * });
 * ```
 *
 * @see {@link IArvoEventHandler} for the full configuration options
 * @see {@link ArvoEventHandler} for the handler class implementation
 */
export const createArvoEventHandler = <TContract extends ArvoContract>(
  param: IArvoEventHandler<TContract>,
): ArvoEventHandler<TContract> => new ArvoEventHandler<TContract>(param);
