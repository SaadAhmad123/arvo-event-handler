import type { ArvoContract } from 'arvo-core';
import ArvoEventHandler from '.';
import type { IArvoEventHandler } from './types';

/**
 * Creates an instance of `ArvoEventHandler` for the specified versioned contract and handlers.
 *
 * This function is the recommended entry point for defining stateless, contract-driven services in Arvo.
 * It binds a contract to its versioned handler implementations, enforces type-safe validation using Zod,
 * and supports multi-domain event broadcasting and OpenTelemetry observability out of the box.
 *
 * See {@link ArvoEventHandler} for implementation details.
 *
 * @example
 * ```ts
 * const handler = createArvoEventHandler({
 *   contract: userContract,
 *   executionunits: 1,
 *   handler: {
 *     '1.0.0': async ({ event, domain, span }) => {
 *       if (domain.event !== domain.self) {
 *         logToSpan({
 *           level: 'WARN',
 *           message: 'Domain mismatch detected'
 *         }, span);
 *       }
 *
 *       const result = await processUser(event.data);
 *
 *       return {
 *         type: 'evt.user.created',
 *         data: result,
 *         to: 'com.notification.service',
 *       };
 *     },
 *     '2.0.0': async ({ event, contract }) => {
 *       // Handler logic for v2.0.0
 *     }
 *   }
 * });
 * ```
 *
 * @param param - Configuration object containing contract, versioned handlers, execution units, and span settings
 * @returns A fully configured `ArvoEventHandler` instance for the given contract
 */
export const createArvoEventHandler = <TContract extends ArvoContract>(
  param: IArvoEventHandler<TContract>,
): ArvoEventHandler<TContract> => new ArvoEventHandler<TContract>(param);
