import type {
  ArvoContract,
  ArvoEventData,
  ArvoOrchestratorEventTypeGen,
  ArvoSemanticVersion,
  CloudEventExtension,
  CreateArvoEvent,
  InferVersionedArvoContract,
  VersionedArvoContract,
} from 'arvo-core';
import type { Invert, IsNever, ParameterizedObject, UnknownActorLogic, Values } from 'xstate';
import type { z } from 'zod';

/**
 * Represents an extended context for Arvo XState machines, including additional properties
 * for volatile and internal data.
 *
 * This type extends the base XState MachineContext with additional properties
 * to provide more flexibility and organization in storing machine-related data.
 *
 * The `$$` suffix in property names is used to indicate special storage objects within the context.
 * 
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
 */
export type EnqueueArvoEventActionParam<
  TData extends ArvoEventData = ArvoEventData,
  TType extends string = string,
  TExtension extends CloudEventExtension = CloudEventExtension,
> = {
  /**
   * The event id
   */
  id?: CreateArvoEvent<TData, TType>['id'];

  /**
   * The domain configuration for multi-domain event broadcasting.
   */
  domain?: (string | null)[];

  /**
   * Custom extensions for the CloudEvent.
   * Allows for additional metadata to be attached to the event.
   */
  __extensions?: TExtension;

  /**
   * Defines access controls for the event.
   * Can be a UserID, encrypted string, or key-value pairs.
   */
  accesscontrol?: string;

  /**
   * The event payload. This payload must be JSON serializable.
   */
  data: TData;

  /**
   * Identifies the schema that the `data` adheres to.
   */
  dataschema?: string;

  /**
   * Indicates alternative recipients or destinations for events.
   */
  redirectto?: string;

  /**
   * Defines the consumer machine of the event. Used for event routing.
   * Must be a valid URI if present. If not available, the `type` field
   * is used as a default.
   */
  to?: string;

  /**
   * Describes the type of event.
   */
  type: TType;

  /**
   * Represents the cost associated with generating the cloudevent.
   */
  executionunits?: number;
};

/**
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
 * Parses the specific orchestrator type from a fully qualified event type string.
 */
export type ExtractOrchestratorType<T extends string> =
  T extends `${typeof ArvoOrchestratorEventTypeGen.prefix}.${infer Type}` ? Type : never;

/**
 * Infers the complete service contract from a record of versioned Arvo contracts.
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
