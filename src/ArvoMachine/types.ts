import type {
  ArvoContract,
  ArvoEventData,
  ArvoOrchestratorEventTypeGen,
  ArvoSemanticVersion,
  CloudEventExtension,
  InferVersionedArvoContract,
  VersionedArvoContract,
} from 'arvo-core';
import type { Invert, IsNever, ParameterizedObject, UnknownActorLogic, Values } from 'xstate';
import type { z } from 'zod';

/**
 * Represents an extended context for Arvo XState machines, including additional properties
 * for volatile and internal data.
 *
 * @remarks
 * This type extends the base XState MachineContext with additional properties
 * to provide more flexibility and organization in storing machine-related data.
 *
 * The `$$` suffix in property names is used to indicate special storage objects within the context.
 *
 * @note
 * To avoid runtime errors, it is recommended not to use `arvo$$` object at all in the
 * machine context
 */
export type ArvoMachineContext = {
  arvo$$?: {
    volatile$$?: {
      [key: string]: any;
      eventQueue$$?: EnqueueArvoEventActionParam[];
    };
  };
};

/**
 * Represents the parameters for the emitArvoEvent action in ArvoXState.
 * This type defines a subset of properties from the CreateArvoEvent type,
 * specifically tailored for emitting an ArvoEvent within the state machine context.
 *
 * @remarks
 * The EmitArvoEventActionParam type is crucial for maintaining consistency and
 * type safety when emitting events in an ArvoXState machine. It ensures that
 * only relevant properties are included and properly typed.
 * ```
 */
export type EnqueueArvoEventActionParam<
  TData extends ArvoEventData = ArvoEventData,
  TType extends string = string,
  TExtension extends CloudEventExtension = CloudEventExtension,
> = {
  /**
   * The event domain configuration for multi-domain broadcasting.
   *
   * **Domain Broadcasting Rules:**
   * - Each element in the array creates a separate ArvoEvent instance
   * - `undefined` elements resolve using inheritance: `event.domain ?? contract.domain ?? null`
   * - Duplicate domains are automatically removed to prevent redundant events
   * - Omitting this field (or setting to `undefined`) defaults to `[null]`
   *
   * **Domain Broadcasting Patterns:**
   * - `['domain1', 'domain2']` → Creates 2 events for different processing contexts
   * - `['analytics', undefined, 'audit']` → Creates events for analytics, inherited context, and audit
   * - `[null]` → Creates single event with no domain routing (standard processing)
   * - `undefined` (or omitted) → Creates single event with `domain: null`
   */
  domain?: (string | null | undefined)[];
  /**
   * Custom extensions for the CloudEvent.
   * Allows for additional metadata to be attached to the event.
   *
   * @remarks
   * Use this field to include any non-standard attributes that are not
   * covered by the core CloudEvent specification or Arvo extensions.
   */
  __extensions?: TExtension;

  /**
   * Defines access controls for the event.
   * Can be a UserID, encrypted string, or key-value pairs.
   *
   * @remarks
   * This field is used to implement fine-grained access control on event
   * consumption. The exact format and interpretation may depend on your
   * system's access control mechanisms.
   */
  accesscontrol?: string;

  /**
   * The event payload. This payload must be JSON serializable.
   *
   * @remarks
   * The data field contains the event-specific information. Ensure that
   * the structure of this data conforms to the schema specified in the
   * `dataschema` field, if provided.
   */
  data: TData;

  /**
   * Identifies the schema that the `data` adheres to.
   * Must be a valid URI if present.
   *
   * @remarks
   * Use this field to provide a link to the schema definition for the
   * event data. This helps consumers understand and validate the event structure.
   */
  dataschema?: string;

  /**
   * Indicates alternative recipients or destinations for events.
   * Must be a valid URI if present.
   *
   * @remarks
   * Use this field to implement event forwarding or to specify secondary
   * event consumers in addition to the primary one specified in the `to` field.
   */
  redirectto?: string;

  /**
   * Defines the consumer machine of the event. Used for event routing.
   * Must be a valid URI if present. If not available, the `type` field
   * is used as a default.
   *
   * @remarks
   * This field is crucial for directing events to specific services or
   * components in your system. Ensure the URI is correctly formatted and
   * recognized by your event routing infrastructure.
   */
  to?: string;

  /**
   * Describes the type of event.
   * Should be prefixed with a reverse-DNS name.
   *
   * @remarks
   * The event type is a key field for consumers to understand the nature
   * of the event without inspecting its data. Use a consistent naming convention
   * to enhance system-wide event comprehension.
   */
  type: TType;

  /**
   * Represents the cost associated with generating the cloudevent.
   *
   * @remarks
   * By default, it uses the actor's executionunits. This field can be used for
   * resource accounting or billing purposes. Only override this if you have a specific
   * reason to assign a different cost to this particular event emission.
   */
  executionunits?: number;
};

/**
 * @remarks
 * This is an internal type. Copied as it is from the
 * xstate core [here](https://github.com/statelyai/xstate/blob/main/packages/core/src/setup.ts#L26)
 */
export type ToParameterizedObject<TParameterizedMap extends Record<string, ParameterizedObject['params'] | undefined>> = // `silentNeverType` to `never` conversion (explained in `ToProvidedActor`)
  IsNever<TParameterizedMap> extends true
    ? never
    : Values<{
        [K in keyof TParameterizedMap & string]: {
          type: K;
          params: TParameterizedMap[K];
        };
      }>;

/**
 * @remarks
 * This is an internal type. Copied as it is from the
 * xstate core [here](https://github.com/statelyai/xstate/blob/main/packages/core/src/setup.ts#L43)
 */
export type ToProvidedActor<
  TChildrenMap extends Record<string, string>,
  TActors extends Record<string, UnknownActorLogic>,
> = IsNever<TActors> extends true
  ? never
  : Values<{
      [K in keyof TActors & string]: {
        src: K;
        logic: TActors[K];
        id: IsNever<TChildrenMap> extends true
          ? string | undefined
          : K extends keyof Invert<TChildrenMap>
            ? Invert<TChildrenMap>[K] & string
            : string | undefined;
      };
    }>;

/**
 * Infers emittable events from a versioned Arvo contract.
 *
 * @template T - Versioned Arvo contract type
 *
 * @remarks
 * Extracts all possible events that can be emitted by a contract,
 * including system error events.
 */
export type InferEmittableEventsFromVersionedArvoContract<
  T extends VersionedArvoContract<ArvoContract, ArvoSemanticVersion>,
> =
  | {
      [K in keyof InferVersionedArvoContract<T>['emits']]: InferVersionedArvoContract<T>['emits'][K];
    }[keyof InferVersionedArvoContract<T>['emits']]
  | InferVersionedArvoContract<T>['systemError'];

/**
 * Extracts the orchestrator type from an event type string.
 *
 * @template T - Event type string
 *
 * @remarks
 * Parses the specific orchestrator type from a fully qualified event type string.
 */
export type ExtractOrchestratorType<T extends string> =
  T extends `${typeof ArvoOrchestratorEventTypeGen.prefix}.${infer Type}` ? Type : never;

/**
 * Infers the complete service contract from a record of versioned Arvo contracts.
 *
 * @template T - Record of versioned Arvo contracts
 *
 * @remarks
 * Generates a comprehensive type definition including both emitted and received events
 * for all services in the contract.
 *
 * @property emitted - Events that can be emitted by the orchestrator
 * @property events - Events that can be received by the orchestrator
 */
export type InferServiceContract<T extends Record<string, VersionedArvoContract<ArvoContract, ArvoSemanticVersion>>> = {
  emitted: {
    [K in keyof T]: EnqueueArvoEventActionParam<z.input<T[K]['accepts']['schema']>, T[K]['accepts']['type']>;
  }[keyof T];

  events: {
    [K in keyof T]: InferEmittableEventsFromVersionedArvoContract<T[K]>;
  }[keyof T];
};
