import { SpanKind } from '@opentelemetry/api';
import {
  ArvoContract,
  ArvoEvent,
  ResolveArvoContractRecord,
  CreateArvoEvent,
  OpenInferenceSpanKind,
  ArvoExecutionSpanKind,
} from 'arvo-core';
import { z } from 'zod';

/**
 * Represents the input for an ArvoEvent handler function.
 * @template TAccepts - The type of ArvoContractRecord that the handler accepts.
 */
export type ArvoEventHandlerFunctionInput<TContract extends ArvoContract> = {
  /** The ArvoEvent object. */
  event: ArvoEvent<
    ResolveArvoContractRecord<TContract['accepts']>,
    Record<string, any>,
    TContract['accepts']['type']
  >;
};

/**
 * Represents the output of an ArvoEvent handler function.
 * @template TContract - The type of ArvoContract that the handler is associated with.
 */
export type ArvoEventHandlerFunctionOutput<TContract extends ArvoContract> = {
  [K in keyof TContract['emits']]: Omit<
    CreateArvoEvent<z.infer<TContract['emits'][K]>, K & string>,
    'subject' | 'source' | 'executionunits'
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
 * @template TContract - The type of ArvoContract that the handler is associated with.
 */
export type ArvoEventHandlerFunction<TContract extends ArvoContract> = (
  params: ArvoEventHandlerFunctionInput<TContract>,
) => Promise<ArvoEventHandlerFunctionOutput<TContract>>;

/**
 * Interface for an ArvoEvent handler.
 * @template T - The type of the contract (defaults to string).
 * @template TAccepts - The type of ArvoContractRecord that the handler accepts.
 * @template TEmits - The type of ArvoContractRecord that the handler emits.
 */
export interface IArvoEventHandler<TContract extends ArvoContract> {
  /**
   * An override source for emitted events.
   * @deprecated This field is deprecated and should be used with caution.
   * @remarks
   * When provided, this value will be used as the source for emitted events
   * instead of the `contract.accepts.type`. Use this very carefully as it may
   * reduce system transparency and make event tracking more difficult.
   *
   * It's recommended to rely on the default source (`contract.accepts.type`)
   * whenever possible to maintain consistent and traceable event chains.
   */
  source?: string;

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
   * The OpenTelemetry span kind attributes for the handler
   * executor.
   * @param [openInference] - The OpenInference span kind. Default is "CHAIN"
   * @param [arvoExecution] - The ArvoExecution span kind. Default is "EVENT_HANDLER"
   * @param [openTelemetry] - The OpenTelemetry span kind. Default is "INTERNAL"
   */
  spanKind?: {
    openInference?: OpenInferenceSpanKind,
    arvoExecution?: ArvoExecutionSpanKind,
    openTelemetry?: SpanKind
  }
}
