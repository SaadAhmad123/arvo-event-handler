import type { SpanOptions } from '@opentelemetry/api';
import type { ArvoEvent } from 'arvo-core';
import type IArvoEventHandler from './IArvoEventHandler';

export type NonEmptyArray<T> = [T, ...T[]];

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
