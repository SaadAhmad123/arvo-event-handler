import {
  ArvoEvent,
  CreateArvoEvent,
  exceptionToSpan,
  OpenTelemetryHeaders,
} from 'arvo-core';
import { ArvoEventHandlerFunctionOutput } from './ArvoEventHandler/types';
import { MultiArvoEventHandlerFunctionOutput } from './MultiArvoEventHandler/types';
import {
  context,
  SpanOptions,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { ArvoEventHandlerOpenTelemetryOptions } from './types';

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
export function getValueOrDefault<T>(
  value: T | null | undefined,
  defaultValue: NonNullable<T>,
): NonNullable<T> {
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
export function coalesce<T>(
  ...values: (T | null | undefined)[]
): T | undefined {
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
export function coalesceOrDefault<T>(
  values: (T | null | undefined)[],
  _default: NonNullable<T>,
): NonNullable<T> {
  return getValueOrDefault(coalesce(...values), _default);
}

/**
 * Creates ArvoEvents from event handler output.
 *
 * @param events - An array of event handler function outputs.
 * @param otelSpanHeaders - OpenTelemetry headers for tracing.
 * @param source - The source of the event.
 * @param defaultAccessControl - The default access control string for the events
 * @param originalEvent - The original ArvoEvent that triggered the handler.
 * @param handlerExectionUnits - The number of execution units for the handler.
 * @param factory - A function to create ArvoEvents.
 * @returns An array of ArvoEvents created from the handler output.
 */
export const eventHandlerOutputEventCreator = (
  events: Array<
    ArvoEventHandlerFunctionOutput<any> | MultiArvoEventHandlerFunctionOutput
  >,
  otelSpanHeaders: OpenTelemetryHeaders,
  source: string,
  originalEvent: ArvoEvent,
  handlerExectionUnits: number,
  factory: (
    param: CreateArvoEvent<any, any> & { to: string },
    extensions?: Record<string, string | number | boolean>,
  ) => ArvoEvent<any, any, any>,
) => {
  return events.map((item, index) => {
    const { __extensions, ...handlerResult } = item;
    const result = factory(
      {
        ...handlerResult,
        traceparent: otelSpanHeaders.traceparent || undefined,
        tracestate: otelSpanHeaders.tracestate || undefined,
        source: source,
        subject: originalEvent.subject,
        // prioritise returned 'to', 'redirectto' and then
        // 'source'
        to: coalesceOrDefault(
          [handlerResult.to, originalEvent.redirectto],
          originalEvent.source,
        ),
        executionunits: coalesce(
          handlerResult.executionunits,
          handlerExectionUnits,
        ),
        accesscontrol:
          handlerResult.accesscontrol ??
          originalEvent.accesscontrol ??
          undefined,
      },
      __extensions,
    );
    Object.entries(result.otelAttributes).forEach(([key, value]) =>
      trace.getActiveSpan()?.setAttribute(`to_emit.${index}.${key}`, value),
    );
    return result;
  });
};

export const createHandlerErrorOutputEvent = (
  error: Error,
  otelSpanHeaders: OpenTelemetryHeaders,
  type: string,
  source: string,
  originalEvent: ArvoEvent,
  handlerExectionUnits: number,
  factory: (
    param: CreateArvoEvent<any, any> & { to: string },
    extensions?: Record<string, string | number | boolean>,
  ) => ArvoEvent<any, any, any>,
) => {
  exceptionToSpan(error);
  trace.getActiveSpan()?.setStatus({
    code: SpanStatusCode.ERROR,
    message: error.message,
  });
  const result = factory({
    type,
    source,
    subject: originalEvent.subject,
    to: originalEvent.source,
    executionunits: handlerExectionUnits,
    traceparent: otelSpanHeaders.traceparent ?? undefined,
    tracestate: otelSpanHeaders.tracestate ?? undefined,
    data: {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack ?? null,
    },
    accesscontrol: originalEvent.accesscontrol ?? undefined,
  });

  Object.entries(result.otelAttributes).forEach(([key, value]) =>
    trace.getActiveSpan()?.setAttribute(`to_emit.0.${key}`, value),
  );
  return [result];
};

/**
 * Validates if a string contains only uppercase or lowercase alphanumeric characters.
 *
 * This function checks if the input string consists solely of:
 * - Lowercase letters (a-z)
 * - Numbers (0-9)
 * - Dot (.)
 *
 * It does not allow any special characters, spaces, or other non-alphanumeric characters.
 *
 * @param input - The string to be validated.
 * @returns True if the string contains only alphanumeric characters, false otherwise.
 */
export function isLowerAlphanumeric(input: string): boolean {
  const alphanumericRegex = /^[a-z0-9.]+$/;
  return alphanumericRegex.test(input);
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
