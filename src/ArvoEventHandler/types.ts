import {
  ArvoContract,
  ArvoEvent,
  ResolveArvoContractRecord,
  TelemetryContext,
  ArvoContractRecord,
  CreateArvoEvent,
  createContractualArvoEvent,
} from 'arvo-core';
import { ExtractEventType } from 'arvo-core/dist/ArvoContract';
import { z } from 'zod';

/**
 * Represents the input for an ArvoEvent handler function.
 * @template TAccepts - The type of ArvoContractRecord that the handler accepts.
 */
export type ArvoEventHandlerFunctionInput<
  T extends string,
  TAccepts extends ArvoContractRecord,
  TEmits extends ArvoContractRecord,
> = {
  /** The ArvoContract object */
  contract: ArvoContract<T, TAccepts, TEmits>
  /** The ArvoEvent object. */
  event: ArvoEvent<ResolveArvoContractRecord<TAccepts>, Record<string, any>, TAccepts['type']>;
  /** The telemetry context. */
  telemetry: TelemetryContext;
};

export type ArvoEventHandlerFunctionOutput = {
  event: ArvoEvent;
  extensions?: Record<string, any>;
} | null;


/**
 * Interface for an ArvoEvent handler.
 * @template T - The type of the contract (defaults to string).
 * @template TAccepts - The type of ArvoContractRecord that the handler accepts.
 * @template TEmits - The type of ArvoContractRecord that the handler emits.
 */
export interface IArvoEventHandler<
  T extends string = string,
  TAccepts extends ArvoContractRecord = ArvoContractRecord,
  TEmits extends ArvoContractRecord = ArvoContractRecord,
> {
  /**
   * The contract for the handler defining its input and outputs as well as the description.
   */
  contract: ArvoContract<T, TAccepts, TEmits>;

  /**
   * The default execution cost of the function.
   * This can represent a dollar value or some other number with a rate card.
   */
  executionunits: number;

  /**
   * The functional handler of the event which takes the input, performs an action, and returns the result.
   * @param params - The input parameters for the handler function.
   * @returns A promise or object containing the created ArvoEvent and optional extensions.
   */
  handler: (params: ArvoEventHandlerFunctionInput<T, TAccepts, TEmits>) => (Promise<ArvoEventHandlerFunctionOutput> | ArvoEventHandlerFunctionOutput);

  /**
   * Optional flag to disable routing metadata for the ArvoEvent.
   * If set to true, the 'to' and 'redirectto' fields will be forced to null.
   */
  disableRouting?: boolean;
}