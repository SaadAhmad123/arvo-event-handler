import { SpanKind, type SpanOptions, SpanStatusCode } from '@opentelemetry/api';
import {
  ArvoErrorSchema,
  type ArvoEvent,
  ArvoExecution,
  ArvoExecutionSpanKind,
  ArvoOpenTelemetry,
  OpenInference,
  OpenInferenceSpanKind,
  createArvoEvent,
  currentOpenTelemetryHeaders,
  logToSpan,
} from 'arvo-core';
import AbstractArvoEventHandler from '../AbstractArvoEventHandler';
import { ConfigViolation } from '../errors';
import type { ArvoEventHandlerOpenTelemetryOptions } from '../types';
import {
  createEventHandlerTelemetryConfig,
  eventHandlerOutputEventCreator,
  handleArvoEventHandlerCommonError,
  isLowerAlphanumeric,
} from '../utils';
import type {
  IMultiArvoEventHandler,
  MultiArvoEventHandlerFunction,
  MultiArvoEventHandlerFunctionOutput,
} from './types';

/**
 * MultiArvoEventHandler processes multiple event types without being bound to specific contracts.
 * Manages event execution, telemetry tracking, and error handling for diverse event streams.
 *
 * @example
 * const handler = createMultiArvoEventHandler({
 *   source: "order.handler",
 *   executionunits: 1,
 *   handler: async ({ event }) => {
 *     // Handle multiple event types
 *   }
 * });
 */
export default class MultiArvoEventHandler extends AbstractArvoEventHandler {
  /** Computational cost metric for handler operations */
  readonly executionunits: number;

  /** Source identifier for event routing */
  readonly source: string;

  /** OpenTelemetry configuration */
  readonly spanOptions: SpanOptions;

  /** Event processing function */
  readonly handler: MultiArvoEventHandlerFunction;

  /**
   * Creates handler instance with specified configuration.
   * @param param Handler configuration including source and execution parameters
   * @throws When source contains invalid characters
   */
  constructor(param: IMultiArvoEventHandler) {
    super();
    this.executionunits = param.executionunits;
    this.handler = param.handler;
    if (!isLowerAlphanumeric(param.source)) {
      throw new Error(
        `Invalid source identifier '${param.source}': Must contain only alphanumeric characters (example: order.handler)`,
      );
    }
    this.source = param.source;
    this.spanOptions = {
      kind: SpanKind.CONSUMER,
      ...param.spanOptions,
      attributes: {
        [ArvoExecution.ATTR_SPAN_KIND]: ArvoExecutionSpanKind.EVENT_HANDLER,
        [OpenInference.ATTR_SPAN_KIND]: OpenInferenceSpanKind.CHAIN,
        ...(param.spanOptions?.attributes ?? {}),
        'arvo.handler.source': this.source,
      },
    };
  }

  /**
   * Processes an event through configured handler function. Creates telemetry span,
   * validates event destination, executes handler, and manages errors.
   *
   * @param event Event to process
   * @param opentelemetry Telemetry context configuration
   * @returns Resulting events or error events
   *
   * @throws {ConfigViolation} When event destination does not match handler source
   * @throws Other Violation error which are thrown by the event handler function
   */
  public async execute(
    event: ArvoEvent,
    opentelemetry: ArvoEventHandlerOpenTelemetryOptions = {
      inheritFrom: 'EVENT',
    },
  ): Promise<ArvoEvent[]> {
    const otelConfig = createEventHandlerTelemetryConfig(
      'MutliArvoEventHandler',
      this.spanOptions,
      opentelemetry,
      event,
    );
    return await ArvoOpenTelemetry.getInstance().startActiveSpan({
      ...otelConfig,
      fn: async (span) => {
        const otelSpanHeaders = currentOpenTelemetryHeaders();
        try {
          span.setStatus({ code: SpanStatusCode.OK });
          for (const [key, value] of Object.entries(event.otelAttributes)) {
            span.setAttribute(`to_process.0.${key}`, value);
          }

          logToSpan({
            level: 'INFO',
            message: `Initiating event resolution - Type: ${event.type}, Source: ${event.source}, Destination: ${event.to}`,
          });

          if (event.to !== this.source) {
            throw new ConfigViolation(`Event destination mismatch: Expected '${this.source}', received '${event.to}'`);
          }

          const _handlerOutput = await this.handler({
            event,
            source: this.source,
            span,
          });

          if (!_handlerOutput) return [];
          let outputs: MultiArvoEventHandlerFunctionOutput[] = [];
          if (Array.isArray(_handlerOutput)) {
            outputs = _handlerOutput;
          } else {
            outputs = [_handlerOutput];
          }

          const resultingEvents = eventHandlerOutputEventCreator(
            outputs,
            otelSpanHeaders,
            this.source,
            event,
            this.executionunits,
            (param, extensions) => createArvoEvent(param, extensions),
          );
          logToSpan({
            level: 'INFO',
            message: `Event processing completed successfully - Generated ${resultingEvents.length} new event(s)`,
          });
          return resultingEvents;
        } catch (error) {
          return handleArvoEventHandlerCommonError(
            error as Error,
            otelSpanHeaders,
            `sys.${this.source}.error`,
            this.source,
            event,
            this.executionunits,
            (param, extensions) => createArvoEvent(param, extensions),
          );
        } finally {
          span.end();
        }
      },
    });
  }

  /**
   * System error schema configuration.
   * Error events follow format: sys.<handler-source>.error
   */
  public get systemErrorSchema() {
    return {
      type: `sys.${this.source}.error`,
      schema: ArvoErrorSchema,
    };
  }
}
