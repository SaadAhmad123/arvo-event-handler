import type { SpanOptions } from '@opentelemetry/api';
import type { ArvoEvent } from 'arvo-core';
import type IArvoEventHandler from './IArvoEventHandler';

export type NonEmptyArray<T> = [T, ...T[]];

/**
 * Represents a value that may or may not have been materialized yet.
 *
 * This type models the distinction between a value whose information is still pending
 * and one that has been fully materialized with its concrete value. The materialized
 * value itself can be of any type, including null or undefined.
 *
 * @template T The type of the value once materialized
 *
 * @remarks
 * Use this type when you need to explicitly track whether information has been
 * acquired or computed, distinguishing between "we haven't obtained this yet"
 * and "we have obtained this, and here is the value".
 *
 * The 'pending' state indicates materialization has not yet occurred.
 * The 'materialized' state indicates the value has been obtained and is available.
 *
 * This is distinct from optional or nullable types, which represent whether a value
 * exists, rather than whether the information about that value has been determined.
 */
export type Materializable<T> =
  | {
      state: 'pending';
    }
  | {
      state: 'resolved';
      value: T;
    };

export const Materialized = {
  pending: <T>(): Extract<Materializable<T>, { state: 'pending' }> => ({ state: 'pending' }),
  resolved: <T>(value: T): Extract<Materializable<T>, { state: 'resolved' }> => ({ state: 'resolved', value }),
  isPending: <T extends Materializable<any>>(value: T): value is Extract<T, { state: 'pending' }> =>
    value.state === 'pending',
  isResolved: <T extends Materializable<any>>(value: T): value is Extract<T, { state: 'resolved' }> =>
    value.state === 'resolved',
};

/**
 * Makes properties optional except specified keys
 *
 * @template T - Original type
 * @template K - Keys to keep required
 *
 * @example
 * ```typescript
 * interface User {
 *   id: number;
 *   name: string;
 * }
 *
 * type PartialUser = PartialExcept<User, 'id'>;
 * // Results in: { id: number; name?: string; }
 * ```
 */
export type PartialExcept<T, K extends keyof T> = Partial<Omit<T, K>> & Pick<T, K>;

/**
 * OpenTelemetry configuration for event handlers
 */
export type ArvoEventHandlerOpenTelemetryOptions = {
  inheritFrom: 'EVENT' | 'CONTEXT';
};

/**
 * Type definition for event handler factory functions.
 * Creates configured event handlers from given parameters.
 *
 * @template T - Configuration object type
 */
export type EventHandlerFactory<T = void> = T extends void ? () => IArvoEventHandler : (config: T) => IArvoEventHandler;

export type ArvoEventHandlerOtelSpanOptions = SpanOptions & {
  spanName?: (param: {
    selfContractUri: string;
    consumedEvent: ArvoEvent;
  }) => string;
};
