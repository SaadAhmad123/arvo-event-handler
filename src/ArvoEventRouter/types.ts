import {
  ArvoContract,
  ArvoExecutionSpanKind,
  OpenInferenceSpanKind,
} from 'arvo-core';
import ArvoEventHandler from '../ArvoEventHandler';
import { SpanKind } from '@opentelemetry/api';

/**
 * Interface for defining an Arvo Event Router.
 *
 * @interface IArvoEventRouter
 */
export interface IArvoEventRouter {
  /**
   * Defines the source name of the router.
   *
   * @property {string} [source]
   *
   * @remarks
   * If this field is defined:
   * - The router will only listen to events with a `to` field matching this `source`.
   * - If an event's `to` field doesn't match, a system error event will be emitted.
   * - For all emitted events, the `source` field will be overridden by this value.
   *
   * If this field is not defined:
   * - The router will listen to all events.
   * - If no appropriate handler is found for an event, a system error event will be emitted.
   * - The `source` field of emitted events will be set according to the configuration
   *   in the relevant `ArvoEventHandler`.
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
   * @property {ArvoEventHandler<ArvoContract>[]} handlers
   *
   * @remarks
   * This array contains instances of `ArvoEventHandler<ArvoContract>` which define
   * how different types of events should be processed. The router will use these
   * handlers to manage incoming events and generate appropriate responses or actions.
   */
  handlers: ArvoEventHandler<ArvoContract<any, any, any, any>>[];

  /**
   * The OpenTelemetry span kind attributes for the handler
   * executor.
   * @param [openInference] - The OpenInference span kind. Default is "CHAIN"
   * @param [arvoExecution] - The ArvoExecution span kind. Default is "EVENT_HANDLER"
   * @param [openTelemetry] - The OpenTelemetry span kind. Default is "INTERNAL"
   */
  spanKind?: {
    openInference?: OpenInferenceSpanKind;
    arvoExecution?: ArvoExecutionSpanKind;
    openTelemetry?: SpanKind;
  };
}
