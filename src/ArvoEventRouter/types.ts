import { ArvoContract } from 'arvo-core';
import ArvoEventHandler from '../ArvoEventHandler';
import { SpanOptions } from '@opentelemetry/api';

/**
 * Interface for defining an Arvo Event Router.
 */
export interface IArvoEventRouter {
  /**
   * Defines the source name of the router.
   *
   * @remarks
   * If this field is defined:
   * - The router will only listen to events with a `to` field matching this `source`.
   * - If an event's `to` field doesn't match, a system error event will be emitted.
   * - For all emitted events, the `source` field will be overridden by this value.
   */
  source: string;

  /**
   * The default execution cost of the function.
   * This can represent a dollar value or some other number with a rate card.
   */
  executionunits: number;

  /**
   * A list of all available event handlers to be used by the router.
   *
   * @remarks
   * This array contains instances of `ArvoEventHandler<ArvoContract>` which define
   * how different types of events should be processed. The router will use these
   * handlers to manage incoming events and generate appropriate responses or actions.
   */
  handlers: ArvoEventHandler<ArvoContract<any, any, any>>[];

  /**
   * The OpenTelemetry span options
   */
  spanOptions?: SpanOptions;
}
