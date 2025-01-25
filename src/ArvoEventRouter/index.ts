import { SpanKind, type SpanOptions, SpanStatusCode, context } from '@opentelemetry/api';
import {
  type ArvoContract,
  ArvoErrorSchema,
  ArvoEvent,
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
import type ArvoEventHandler from '../ArvoEventHandler';
import { ConfigViolation } from '../errors';
import type { ArvoEventHandlerOpenTelemetryOptions } from '../types';
import { handleArvoEventHandlerCommonError, isLowerAlphanumeric } from '../utils';
import type { IArvoEventRouter } from './types';
import { deleteOtelHeaders } from './utils';

/**
 * ArvoEventRouter manages event routing and execution within the Arvo event system. It directs
 * incoming events to appropriate handlers based on event type while maintaining telemetry
 * and error handling.
 *
 * The router enforces contract validation, manages execution costs, and provides comprehensive
 * telemetry via OpenTelemetry integration. It handles event lifecycle management from initial
 * receipt through processing and response generation.
 *
 * @example
 * ```typescript
 * const router = createArvoEventRouter({
 *   source: "payment.service",
 *   executionunits: 1,
 *   handlers: [paymentProcessedHandler, paymentFailedHandler]
 * });
 *
 * // Route an incoming event
 * const results = await router.execute(incomingEvent);
 * ```
 */
export class ArvoEventRouter extends AbstractArvoEventHandler {
  /** Source identifier for the router used in event routing */
  public readonly source: string;

  /** Registry mapping event types to their handlers */
  readonly handlersMap: Record<string, ArvoEventHandler<ArvoContract>> = {};

  /**
   * Computational cost metric for router operations.
   * Used for resource tracking and billing calculations.
   */
  readonly executionunits: number;

  /**
   * The OpenTelemetry span options
   */
  readonly spanOptions: SpanOptions;

  /**
   * Creates an ArvoEventRouter instance with specified configuration.
   *
   * @param param - Router configuration containing source, handlers, and execution parameters
   *
   * @throws {Error} When source contains invalid characters (non-alphanumeric)
   * @throws {Error} When multiple handlers are registered for the same event type
   */
  constructor(param: IArvoEventRouter) {
    super();

    if (param.source && !isLowerAlphanumeric(param.source)) {
      throw new Error(
        `Invalid source identifier '${param.source}': Must contain only alphanumeric characters (example: payment.service)`,
      );
    }

    this.source = param.source;
    this.executionunits = param.executionunits;

    for (const handler of param.handlers) {
      if (this.handlersMap[handler.contract.type]) {
        const existingHandler = this.handlersMap[handler.contract.type];
        throw new Error(
          `Duplicate handler registration detected for event type '${handler.contract.type}'. ` +
            `Conflicts between contracts: ${existingHandler.contract.uri} and ${handler.contract.uri}`,
        );
      }
      this.handlersMap[handler.contract.type] = handler;
    }

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
   * Routes and executes an event through its appropriate handler. Creates a telemetry span,
   * validates the event destination, finds a matching handler, and processes the event.
   * Handles routing errors, missing handlers, and execution failures by returning error
   * events with telemetry context. Tracks performance through execution units and span
   * propagation.
   *
   * @param event The event to be routed and processed
   * @param opentelemetry Configuration for telemetry context inheritance
   * @returns Promise resolving to resulting events or error events
   */
  async execute(
    event: ArvoEvent,
    opentelemetry: ArvoEventHandlerOpenTelemetryOptions = {
      inheritFrom: 'EVENT',
    },
  ): Promise<ArvoEvent[]> {
    return await ArvoOpenTelemetry.getInstance().startActiveSpan({
      name: 'ArvoEventRouter',
      spanOptions: this.spanOptions,
      disableSpanManagement: true,
      context:
        opentelemetry.inheritFrom === 'EVENT'
          ? {
              inheritFrom: 'TRACE_HEADERS',
              traceHeaders: {
                traceparent: event.traceparent,
                tracestate: event.tracestate,
              },
            }
          : {
              inheritFrom: 'CONTEXT',
              context: context.active(),
            },
      fn: async (span) => {
        const otelSpanHeaders = currentOpenTelemetryHeaders();
        const newEvent = deleteOtelHeaders(event);
        try {
          span.setStatus({ code: SpanStatusCode.OK });
          for (const [key, value] of Object.entries(event.otelAttributes)) {
            span.setAttribute(`to_process.0.${key}`, value);
          }

          logToSpan({
            level: 'INFO',
            message: `Initiating event resolution - Type: ${newEvent.type}, Source: ${newEvent.source}, Destination: ${newEvent.to}`,
          });

          if (newEvent.to !== this.source) {
            throw new ConfigViolation(
              `Event destination mismatch: Received destination '${newEvent.to}', ` +
                `but router accepts only '${this.source}'`,
            );
          }

          if (!this.handlersMap[newEvent.type]) {
            throw new ConfigViolation(`No registered handler found for event type '${newEvent.type}'`);
          }

          logToSpan({
            level: 'INFO',
            message: `Handler found for event type '${newEvent.type}' - Beginning event processing`,
          });

          const results = await this.handlersMap[newEvent.type].execute(newEvent, {
            inheritFrom: 'CONTEXT',
          });

          const resultingEvents = results.map(
            (event) =>
              new ArvoEvent(
                {
                  id: event.id,
                  time: event.time,
                  source: this.source,
                  specversion: '1.0',
                  type: event.type,
                  subject: event.subject,
                  datacontenttype: event.datacontenttype,
                  dataschema: event.dataschema,
                  to: event.to,
                  accesscontrol: event.accesscontrol,
                  redirectto: event.redirectto,
                  executionunits: (event.executionunits ?? 0) + this.executionunits,
                  traceparent: otelSpanHeaders.traceparent,
                  tracestate: otelSpanHeaders.tracestate,
                },
                event.data,
                event.cloudevent.extensions,
              ),
          );

          logToSpan({
            level: 'INFO',
            message: `Event processing completed successfully - Generated ${resultingEvents.length} new event(s)`,
          });

          for (let index = 0; index < resultingEvents.length; index++) {
            for (const [key, value] of Object.entries(resultingEvents[index].otelAttributes)) {
              span.setAttribute(`to_emit.${index}.${key}`, value);
            }
          }

          return resultingEvents;
        } catch (error) {
          return handleArvoEventHandlerCommonError(
            error as Error,
            otelSpanHeaders,
            this.systemErrorSchema.type,
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
