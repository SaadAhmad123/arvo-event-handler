import { Span, SpanOptions } from '@opentelemetry/api';
import { ArvoEvent, CreateArvoEvent } from 'arvo-core';

/**
 * Represents the input for a Multi ArvoEvent handler function.
 */
export type MultiArvoEventHandlerFunctionInput = {
  /** The ArvoEvent object. */
  event: ArvoEvent;

  /** The source field data of the handler */
  source: string;

  /** The OpenTelemetry span */
  span: Span
};

/**
 * Represents the output of a Multi ArvoEvent handler function.
 * @template TContract - The type of ArvoContract that the handler is associated with.
 */
export type MultiArvoEventHandlerFunctionOutput = Omit<
  CreateArvoEvent<Record<string, any>, string>,
  'subject' | 'source' | 'executionunits' | 'traceparent' | 'tracestate'
> & {
  /**
   * An optional override for the execution units of this specific event.
   *
   * @remarks
   * Execution units represent the computational cost or resources required to process this event.
   * If not provided, the default value defined in the handler's constructor will be used.
   */
  executionunits?: number;
  /** Optional extensions for the event. */
  __extensions?: Record<string, string | number | boolean>;
};

/**
 * Defines the structure of a Multi ArvoEvent handler function.
 * @template TContract - The type of ArvoContract that the handler is associated with.
 */
export type MultiArvoEventHandlerFunction = (
  param: MultiArvoEventHandlerFunctionInput,
) => Promise<
  | Array<MultiArvoEventHandlerFunctionOutput>
  | MultiArvoEventHandlerFunctionOutput
  | void
>;

/**
 * Interface for an Multi ArvoEvent handler.
 */
export interface IMultiArvoEventHandler {
  /**
   * The source identifier for events produced by this handler
   *
   * @remarks
   * The handler listens to the events with field `event.to` equal
   * to the this `source` value. If the event does not confirm to
   * this, a system error event is returned
   *
   * For all the events which are emitted by the handler, this is
   * the source field value of them all.
   */
  source: string;

  /**
   * The default execution cost of the function.
   * This can represent a dollar value or some other number with a rate card.
   */
  executionunits: number;

  /**
   * The functional handler of the event which takes the input, performs an action, and returns the result.
   * @param params - The input parameters for the handler function.
   * @returns A promise of object containing the created ArvoEvent and optional extensions.
   */
  handler: MultiArvoEventHandlerFunction;

  /** The OpenTelemetry span options */
  spanOptions?: SpanOptions;
}
