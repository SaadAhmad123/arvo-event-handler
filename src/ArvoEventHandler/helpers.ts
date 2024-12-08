import { ArvoContract } from 'arvo-core';
import { IArvoEventHandler } from './types';
import ArvoEventHandler from '.';

/**
 * Creates an ArvoEventHandler for processing events defined by a specific contract.
 * Each handler manages event validation, processing, and telemetry for its contract.
 *
 * @param param Configuration including contract, execution metrics and version handlers
 * @returns Configured ArvoEventHandler instance for the specified contract
 *
 * @example
 * const handler = createArvoEventHandler({
 *   contract: userContract,
 *   executionunits: 10,
 *   handler: {
 *     '1.0.0': async ({ event }) => {
 *       // Process event according to contract v1.0.0
 *     }
 *   }
 * });
 */
export const createArvoEventHandler = <TContract extends ArvoContract>(
  param: IArvoEventHandler<TContract>,
): ArvoEventHandler<TContract> => new ArvoEventHandler<TContract>(param);
