import { Span, SpanOptions } from '@opentelemetry/api';
import {
  ArvoContract,
  ArvoEvent,
  CreateArvoEvent,
  VersionedArvoContract,
  ArvoSemanticVersion,
} from 'arvo-core';
import { z } from 'zod';

/**
 * Represents the input for an ArvoEvent handler function.
 */
export type ArvoEventHandlerFunctionInput<
  TContract extends VersionedArvoContract<any, any>,
> = {
  /** The ArvoEvent object. */
  event: ArvoEvent<
    z.infer<TContract['accepts']['schema']>,
    Record<string, any>,
    TContract['accepts']['type']
  >;

  /** The source field data of the handler */
  source: string;

  /** The OpenTelemetry span */
  span: Span;
};

/**
 * Represents the output of an ArvoEvent handler function.
 */
export type ArvoEventHandlerFunctionOutput<
  TContract extends VersionedArvoContract<any, any>,
> = {
  [K in keyof TContract['emits']]: Pick<
    CreateArvoEvent<z.infer<TContract['emits'][K]>, K & string>,
    'id' | 'time' | 'type' | 'data' | 'to' | 'accesscontrol' | 'redirectto'
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
}[keyof TContract['emits']];

/**
 * Defines the structure of an ArvoEvent handler function.
 */
export type ArvoEventHandlerFunction<TContract extends ArvoContract> = {
  [V in ArvoSemanticVersion & keyof TContract['versions']]: (
    params: ArvoEventHandlerFunctionInput<VersionedArvoContract<TContract, V>>,
  ) => Promise<
    | Array<ArvoEventHandlerFunctionOutput<VersionedArvoContract<TContract, V>>>
    | ArvoEventHandlerFunctionOutput<VersionedArvoContract<TContract, V>>
    | void
  >;
};

/**
 * Interface for an ArvoEvent handler.
 */
export interface IArvoEventHandler<TContract extends ArvoContract> {
  /**
   * The contract for the handler defining its input and outputs as well as the description.
   */
  contract: TContract;

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
  handler: ArvoEventHandlerFunction<TContract>;

  /**
   * The OpenTelemetry span options
   */
  spanOptions?: SpanOptions;
}
