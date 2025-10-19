import type { Span, SpanOptions } from '@opentelemetry/api';
import type {
  ArvoContract,
  ArvoEvent,
  ArvoSemanticVersion,
  CreateArvoEvent,
  InferArvoEvent,
  OpenTelemetryHeaders,
  VersionedArvoContract,
} from 'arvo-core';
import type { z } from 'zod';

/**
 * Represents the input for an ArvoEvent handler function.
 */
export type ArvoEventHandlerFunctionInput<TContract extends VersionedArvoContract<any, any>> = {
  /** The ArvoEvent object. */
  event: InferArvoEvent<
    ArvoEvent<z.infer<TContract['accepts']['schema']>, Record<string, any>, TContract['accepts']['type']>
  >;

  /** The source field data of the handler */
  source: string;

  /** The domain information for handling the event */
  domain: {
    self: string | null;
    event: string | null;
  };

  /** The contract used in the processing */
  contract: TContract;

  /** The OpenTelemetry span */
  span: Span;

  /** The span headers */
  spanHeaders: OpenTelemetryHeaders;
};

/**
 * Represents the output of an ArvoEvent handler function.
 */
export type ArvoEventHandlerFunctionOutput<TContract extends VersionedArvoContract<any, any>> = {
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

    /**
     * The domain configuration for multi-domain event broadcasting.
     *
     * When an event is emitted with a `domain` array, Arvo generates a separate ArvoEvent
     * for each resolved domain value. This enables parallel routing to multiple contexts
     * such as analytics, auditing, human-in-the-loop systems, or external integrations.
     *
     * **Accepted Values:**
     * - A concrete domain string (e.g. `'audit.orders'`)
     * - `null` for standard internal routing (no domain)
     * - A symbolic value from {@link ArvoDomain}.
     *
     * **Broadcasting Rules:**
     * - Each resolved domain in the array creates a separate ArvoEvent instance
     * - Duplicate resolved domains are automatically removed
     * - If the field is omitted, Arvo defaults to `[null]`
     *
     * **Examples:**
     * - `['analytics.orders', 'audit.orders']` → Creates two routed events
     * - `[ArvoDomain.FROM_TRIGGERING_EVENT, 'human.review', null]` → Mirrors source domain, routes to review, and standard consumer
     * - `[null]` → Emits a single event with no domain routing
     * - _Omitted_ → Same as `[null]`
     */
    domain?: (string | null)[];
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
    // biome-ignore lint/suspicious/noConfusingVoidType : Not a copnfusing void. Biome is getting confused
    | void
  >;
};

/**
 * Interface for an ArvoEvent handler.
 */
export type ArvoEventHandlerParam<TContract extends ArvoContract> = {
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

  /**
   * Optional configuration to customize where system error events are emitted.
   *
   * This overrides the default system error domain fallback of:
   * `[event.domain, handler.contract.domain, null]`
   *
   * Use this to precisely control the set of domains that should receive structured
   * `sys.*.error` events when uncaught exceptions occur in the handler.
   *
   * Symbolic constants from {@link ArvoDomain} are supported.
   *
   * @default undefined — uses standard fallback broadcast domains
   */
  systemErrorDomain?: (string | null)[];
};
