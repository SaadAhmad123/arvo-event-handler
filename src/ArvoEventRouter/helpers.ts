import { ArvoEventRouter } from '.';
import { IArvoEventRouter } from './types';

/**
 * Creates a new ArvoEventRouter instance with the provided configuration.
 * Validates source format and ensures unique handlers per event type.
 *
 * @param param Configuration for router initialization including source,
 * handlers, and execution metrics
 * @returns Configured ArvoEventRouter instance
 * @throws When handlers have duplicate event types or source format is invalid
 *
 * @example
 * const router = createArvoEventRouter({
 *   source: 'payment.service',
 *   handlers: [paymentHandler, notificationHandler],
 *   executionunits: 10
 * });
 */
export const createArvoEventRouter = (param: IArvoEventRouter) =>
  new ArvoEventRouter(param);
