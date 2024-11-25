import {
  ArvoContract,
  ArvoErrorSchema,
  ArvoEvent,
  ArvoExecutionSpanKind,
  cleanString,
  createArvoEvent,
  currentOpenTelemetryHeaders,
  OpenInferenceSpanKind,
} from 'arvo-core';
import ArvoEventHandler from '../ArvoEventHandler';
import { IArvoEventRouter } from './types';
import {
  createHandlerErrorOutputEvent,
  isLowerAlphanumeric,
  isNullOrUndefined,
} from '../utils';
import {
  context,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { deleteOtelHeaders } from './utils';
import AbstractArvoEventHandler from '../AbstractArvoEventHandler';
import { fetchOpenTelemetryTracer } from '../OpenTelemetry';
import { OpenTelemetryConfig } from '../OpenTelemetry/types';
import { createOtelSpan } from '../OpenTelemetry/utils';

/**
 * ArvoEventRouter class handles routing of ArvoEvents to appropriate event handlers.
 */
export class ArvoEventRouter extends AbstractArvoEventHandler {
  private readonly _handlerDefaultSource: string = `arvo.event.router`;
  private readonly _source: string | null;

  /**
   * The source name of the router.
   *
   * @remarks
   * The router attempts to match the `event.to` field with this value.
   * If the source is 'arvo.event.router', the `event.to` is not matched and any event is allowed.
   * 'arvo.event.router' is the default source which is set automatically in case a source
   * is not explicitly provided
   */
  public get source() {
    return this._source ?? this._handlerDefaultSource;
  }

  /**
   * A list of all available event handlers to be used by the router.
   */
  readonly handlers: ArvoEventHandler<ArvoContract>[];

  /**
   * The default execution cost of the function.
   * This can represent a dollar value or some other number with a rate card.
   */
  readonly executionunits: number;

  /**
   * A map of all the available event handlers
   */
  readonly handlersMap: Record<string, ArvoEventHandler<ArvoContract>> = {};

  readonly openInferenceSpanKind: OpenInferenceSpanKind =
    OpenInferenceSpanKind.CHAIN;
  readonly arvoExecutionSpanKind: ArvoExecutionSpanKind =
    ArvoExecutionSpanKind.EVENT_HANDLER;
  readonly openTelemetrySpanKind: SpanKind = SpanKind.INTERNAL;

  /**
   * Creates an instance of ArvoEventRouter.
   * @param param - The parameters for initializing the router
   * @throws {Error} If there are duplicate handlers for the same event type or the
   *                 source in an invalid string
   */
  constructor(param: IArvoEventRouter) {
    super();
    this.handlers = param.handlers;

    if (param.source && !isLowerAlphanumeric(param.source)) {
      throw new Error(
        `Invalid 'source' = '${param.source}'. The 'source' must only contain alphanumeric characters e.g. test.router`,
      );
    }

    this._source = isNullOrUndefined(param.source) ? null : param.source;
    this.executionunits = param.executionunits;

    for (const handler of this.handlers) {
      if (this.handlersMap[handler.contract.type]) {
        const existingHandler = this.handlersMap[handler.contract.type];
        throw new Error(
          cleanString(`
          Duplicate handlers for event.type=${handler.contract.type} found. There are same 'contract.accept.types' in 
          contracts 'uri=${existingHandler.contract.uri}' and 'uri=${handler.contract.uri}'. This router does not support handlers
          with the same 'contract.accept.type'.
        `),
        );
      }
      this.handlersMap[handler.contract.type] = handler;
    }

    Object.freeze(this.handlers);
    Object.freeze(this.handlersMap);
  }

  /**
   * Executes the routing process for a given ArvoEvent.
   *
   * @param event - The ArvoEvent to be processed and routed.
   * @param opentelemetry - Configuration for OpenTelemetry integration, including tracing options
   *                        and context inheritance settings. Default is inherit from event and internal tracer
   * @returns A Promise that resolves to an array of ArvoEvents.
   *
   * @remarks
   * This function performs the following steps:
   * 1. Initializes OpenTelemetry span for tracing and monitoring.
   * 2. Validates the event's destination ('to' field) against the router's source.
   * 3. Finds the appropriate handler for the event based on its type.
   * 4. Executes the handler and processes the results.
   * 5. Handles any errors that occur during the process.
   *
   * @throws Error event if the event's 'to' field doesn't match the router's source.
   * @throws Error event if no valid handler is found for the event type.
   *
   * **Telemetry**
   *
   * - Creates an OpenTelemetry span for the entire execution process.
   * - Sets span attributes for OpenInference and ArvoExecution.
   * - Propagates trace context from the input event if available.
   * - Records any errors in the span and sets the span status accordingly.
   * - Adds event attributes to the span for both input and output events.
   *
   * **Routing**
   *
   * The routing process involves:
   * 1. Matching the event's 'to' field with the router's source (if specified).
   * 2. Finding a handler that accepts the event's type.
   * 3. Executing the matched handler with the event.
   * 4. Processing the handler's results and creating new events.
   *
   * **Error Handling**
   *
   * If an error occurs during execution:
   * 1. The error is recorded in the OpenTelemetry span.
   * 2. A new error event is created and returned.
   * 3. The error event is sent back to the original event's source.
   *
   * **Performance**
   *
   * - Execution units are tracked for both successful executions and errors.
   * - The router's default execution units are used for error events.
   */
  async execute(
    event: ArvoEvent,
    opentelemetry?: OpenTelemetryConfig
  ): Promise<ArvoEvent[]> {

    const span = createOtelSpan({
      spanName: `ArvoEventRouter.source<${this._source ?? 'arvo.event.router'}>.execute<${event.type}>`,
      spanKinds: {
        kind: this.openTelemetrySpanKind,
        openInference: this.openInferenceSpanKind,
        arvoExecution: this.arvoExecutionSpanKind,
      },
      event: event,
      opentelemetryConfig: opentelemetry
    })

    return await context.with(
      trace.setSpan(context.active(), span),
      async () => {
        const otelSpanHeaders = currentOpenTelemetryHeaders();
        const newEvent = deleteOtelHeaders(event);
        try {
          span.setStatus({ code: SpanStatusCode.OK });

          if (
            !isNullOrUndefined(this._source) &&
            newEvent.to !== this._source
          ) {
            throw new Error(
              cleanString(`
            Invalid event. The 'event.to' is ${newEvent.to} while this handler 
            listens to only 'event.to' equal to ${this._source}. If this is a mistake,
            please update the 'source' field of the handler
          `),
            );
          }

          if (!this.handlersMap[newEvent.type]) {
            throw new Error(
              cleanString(`
            Invalid event (type=${newEvent.type}). No valid handler 
            <handler[*].contract.type> found in the router.
          `),
            );
          }

          const results = await this.handlersMap[newEvent.type].execute(
            newEvent,
            { inheritFrom: 'execution', tracer: opentelemetry?.tracer ?? fetchOpenTelemetryTracer() },
          );

          return results.map(
            (event) =>
              new ArvoEvent(
                {
                  id: event.id,
                  time: event.time,
                  source: event.source,
                  specversion: '1.0',
                  type: event.type,
                  subject: event.subject,
                  datacontenttype: event.datacontenttype,
                  dataschema: event.dataschema,
                  to: event.to,
                  accesscontrol: event.accesscontrol,
                  redirectto: event.redirectto,
                  executionunits:
                    (event.executionunits ?? 0) + this.executionunits,
                  traceparent: otelSpanHeaders.traceparent,
                  tracestate: otelSpanHeaders.tracestate,
                },
                event.data,
                event.cloudevent.extensions,
              ),
          );
        } catch (error) {
          return createHandlerErrorOutputEvent(
            error as Error,
            otelSpanHeaders,
            `sys.${this.source}.error`,
            this.source,
            event,
            this.executionunits,
            (param, extension) =>
              createArvoEvent(param, extension, {
                tracer: opentelemetry?.tracer ?? fetchOpenTelemetryTracer(),
              }),
          );
        } finally {
          span.end();
        }
      },
    );
  }

  /**
   * Provides the schema for system error events.
   *
   * @returns An object containing the error event type and schema.
   *
   * @remarks
   * This getter defines the structure for system error events that may be emitted
   * when an unexpected error occurs during event handling. The error event type
   * is prefixed with 'sys.' followed by the handler's source and '.error'.
   * The schema used for these error events is the standard ArvoErrorSchema.
   *
   * @example
   * // If the handler's source is 'user.service'
   * // The system error event type would be 'sys.user.service.error'
   */
  public get systemErrorSchema() {
    return {
      type: `sys.${this.source}.error`,
      schema: ArvoErrorSchema,
    };
  }
}
