import { ArvoEventRouter } from '.';
import { IArvoEventRouter } from './types';

/**
 * Creates and returns a new instance of ArvoEventRouter.
 *
 * @param {IArvoEventRouter} param - Configuration object for the ArvoEventRouter.
 * @returns {ArvoEventRouter} A new instance of ArvoEventRouter.
 *
 * @throws {Error} If there are duplicate handlers for the same event type.
 * @throws {Error} If the provided source is an invalid string.
 *
 * @example
 * const router = createArvoEventRouter({
 *   source: 'my-router',
 *   handlers: [handler1, handler2],
 *   executionunits: 10
 * });
 *
 * @remarks
 * This function is a factory method that simplifies the creation of an ArvoEventRouter instance.
 * It encapsulates the instantiation process, allowing for a more concise and readable way to create routers.
 *
 * The `IArvoEventRouter` parameter should include:
 * - `source`: (optional) A string identifying the source of the router. Used to match the `event.to` field.
 * - `handlers`: An array of ArvoEventHandler instances that the router will use to process events.
 * - `executionunits`: A number representing the default execution cost of the function.
 *
 * The created ArvoEventRouter will:
 * - Validate the source string if provided.
 * - Check for and prevent duplicate handlers for the same event type.
 * - Set up internal data structures for efficient event routing.
 *
 * @see {@link ArvoEventRouter} for more details on the router's functionality.
 * @see {@link IArvoEventRouter} for the structure of the configuration object.
 */
export const createArvoEventRouter = (param: IArvoEventRouter) =>
  new ArvoEventRouter(param);
