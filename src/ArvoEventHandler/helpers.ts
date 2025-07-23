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
 * See {@link ArvoEventHandler}
 *
 * @example
 * ```typescript
 * const handler = createArvoEventHandler({
 *   contract: userContract,
 *   executionunits: 1,
 *   handler: {
 *     '1.0.0': async ({ event, domain, span }) => {
 *       // Access domain context
 *       if (event.domain === 'priority.high') {
 *         // Handle high-priority processing
 *       }
 *
 *       if (domain.event !== domain.self) {
 *          logToSpan({
 *            level: 'WARN',
 *            message: 'Domain mismatch detected'
 *          }, span)
 *       }
 *
 *
 *       // Process event according to contract v1.0.0
 *       const result = await processUser(event.data);
 *
 *       // Return structured response
 *       return {
 *         type: 'evt.user.created',
 *         data: result,
 *         // Optional: override default routing
 *         to: 'com.notification.service',
 *         // Creates 2 events one for 'analytics.realtime' domain and one for 'null' domain which
 *         // is the default domain in Arvo system
 *         domain: ['analytics.realtime', null]
 *       };
 *     },
 *     '2.0.0': async ({ event, contract, span }) => {
 *       // Process event according to contract v2.0.0
 *       // Handler must be implemented for all contract versions
 *     }
 *   }
 * });
 * ```
 */
export const createArvoEventHandler = <TContract extends ArvoContract>(
  param: IArvoEventHandler<TContract>,
): ArvoEventHandler<TContract> => new ArvoEventHandler<TContract>(param);
