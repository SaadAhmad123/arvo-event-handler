import { type SpanOptions, context } from '@opentelemetry/api';
import type { ArvoEvent } from 'arvo-core';
import type { ArvoEventHandlerOpenTelemetryOptions } from './types';

/**
 * Checks if the item is null or undefined.
 *
 * @param item - The value to check.
 * @returns True if the item is null or undefined, false otherwise.
 */
export function isNullOrUndefined(item: unknown): item is null | undefined {
  return item === null || item === undefined;
}

/**
 * Returns the provided value if it's not null or undefined; otherwise, returns the default value.
 *
 * @template T - The type of the value and default value.
 * @param value - The value to check.
 * @param defaultValue - The default value to return if the provided value is null or undefined.
 * @returns The provided value if it's not null or undefined; otherwise, the default value.
 */
export function getValueOrDefault<T>(value: T | null | undefined, defaultValue: NonNullable<T>): NonNullable<T> {
  return isNullOrUndefined(value) ? defaultValue : (value as NonNullable<T>);
}

/**
 * Returns the first non-null and non-undefined value from the provided arguments.
 * If all arguments are null or undefined, returns undefined.
 *
 * @template T - The type of the values.
 * @param values - The values to coalesce.
 * @returns The first non-null and non-undefined value, or undefined if all are null or undefined.
 */
export function coalesce<T>(...values: (T | null | undefined)[]): T | undefined {
  for (const value of values) {
    if (!isNullOrUndefined(value)) {
      return value;
    }
  }
  return undefined;
}

/**
 * Returns the first non-null and non-undefined value from the provided array of values.
 * If all values in the array are null or undefined, returns the specified default value.
 *
 * @template T - The type of the values and the default value.
 * @param values - An array of values to coalesce.
 * @param _default - The default value to return if all values in the array are null or undefined.
 * @returns The first non-null and non-undefined value from the array, or the default value if all are null or undefined.
 *
 * @example
 * const result = coalesceOrDefault([null, undefined, 'hello', 'world'], 'default');
 * console.log(result); // Output: 'hello'
 *
 * @example
 * const result = coalesceOrDefault([null, undefined], 'default');
 * console.log(result); // Output: 'default'
 */
export function coalesceOrDefault<T>(values: (T | null | undefined)[], _default: NonNullable<T>): NonNullable<T> {
  return getValueOrDefault(coalesce(...values), _default);
}

export const createEventHandlerTelemetryConfig = (
  name: string,
  options: SpanOptions,
  contextConfig: ArvoEventHandlerOpenTelemetryOptions,
  event: ArvoEvent,
) => ({
  name: name,
  disableSpanManagement: true,
  spanOptions: options,
  context:
    contextConfig.inheritFrom === 'EVENT'
      ? {
          inheritFrom: 'TRACE_HEADERS' as const,
          traceHeaders: {
            traceparent: event.traceparent,
            tracestate: event.tracestate,
          },
        }
      : {
          inheritFrom: 'CONTEXT' as const,
          context: context.active(),
        },
});
