import {
  context,
  SpanKind,
  SpanOptions,
  SpanStatusCode,
  trace,
  Tracer,
} from '@opentelemetry/api';
import {
  ArvoEvent,
  ArvoExecutionSpanKind,
  OpenInferenceSpanKind,
  currentOpenTelemetryHeaders,
  createArvoEvent,
  ArvoErrorSchema,
  cleanString,
  OpenInference,
  ArvoExecution,
} from 'arvo-core';
import {
  IMultiArvoEventHandler,
  MultiArvoEventHandlerFunction,
  MultiArvoEventHandlerFunctionOutput,
} from './types';
import { CloudEventContextSchema } from 'arvo-core/dist/ArvoEvent/schema';
import {
  createHandlerErrorOutputEvent,
  eventHandlerOutputEventCreator,
  isLowerAlphanumeric,
} from '../utils';
import { createSpanFromEvent } from '../OpenTelemetry/utils';
import AbstractArvoEventHandler from '../AbstractArvoEventHandler';
import { ArvoEventHandlerTracer } from '../OpenTelemetry';

/**
 * Represents a Multi ArvoEvent handler that can process multiple event types.
 *
 * @remarks
 * Unlike ArvoEventHandler, which is bound to a specific ArvoContract and handles
 * events of a single type, MultiArvoEventHandler can handle multiple event types
 * without being tied to a specific contract. This makes it more flexible for
 * scenarios where you need to process various event types with a single handler.
 */
export default class MultiArvoEventHandler extends AbstractArvoEventHandler {
  /** The default execution cost associated with this handler */
  readonly executionunits: number;

  /**
   * The source identifier for events produced by this handler
   *
   * @remarks
   * The handler listens to the events with field `event.to` equal
   * to the this `source` value. If the event does not confirm to
   * this, a system error event is returned
   *
   * For all the events which are emitted by the handler, this is
   * the source field value of them all.
   */
  readonly source: string;

  readonly openInferenceSpanKind: OpenInferenceSpanKind =
    OpenInferenceSpanKind.CHAIN;
  readonly arvoExecutionSpanKind: ArvoExecutionSpanKind =
    ArvoExecutionSpanKind.EVENT_HANDLER;
  readonly openTelemetrySpanKind: SpanKind = SpanKind.INTERNAL;

  private readonly _handler: MultiArvoEventHandlerFunction;

  /**
   * Creates an instance of MultiArvoEventHandler.
   *
   * @param param - The configuration parameters for the event handler.
   * @throws {Error} Throws an error if the provided source is invalid.
   */
  constructor(param: IMultiArvoEventHandler) {
    super();
    this.executionunits = param.executionunits;
    this._handler = param.handler;

    if (!isLowerAlphanumeric(param.source)) {
      throw new Error(
        `Invalid 'source' = '${param.source}'. The 'source' must only contain alphanumeric characters e.g. test.handler`,
      );
    }

    this.source = param.source;
    this.arvoExecutionSpanKind =
      param.spanKind?.arvoExecution || this.arvoExecutionSpanKind;
    this.openInferenceSpanKind =
      param.spanKind?.openInference || this.openInferenceSpanKind;
    this.openTelemetrySpanKind =
      param.spanKind?.openTelemetry || this.openTelemetrySpanKind;
  }

  /**
   * Executes the event handler for a given event.
   *
   * @param event - The event to handle.
   * @returns A promise that resolves to an array of resulting ArvoEvents.
   *
   * @remarks
   * This method performs the following steps:
   * 1. Creates an OpenTelemetry span for the execution.
   * 2. Validates that the event's 'to' field matches the handler's 'source'.
   * 3. Executes the handler function.
   * 4. Creates and returns the result event(s).
   * 5. Handles any errors and creates an error event if necessary.
   *
   * All telemetry data is properly set and propagated throughout the execution.
   *
   * @example
   * ```typescript
   * const handler = new MultiArvoEventHandler({
   *    source: 'com.multi.handler',
   *    ...
   * });
   * const inputEvent: ArvoEvent = createArvoEvent({ ... });
   * const resultEvents = await handler.execute(inputEvent);
   * ```
   *
   * @throws {Error} Throws an error if the event's 'to' field doesn't match the handler's 'source'.
   * All other errors thrown during the execution are returned as a system error event.
   *
   * **Routing**
   *
   * The routing of the resulting events is determined as follows:
   * - The `to` field of the output event is set in this priority:
   *   1. The `to` field provided by the handler result
   *   2. The `redirectto` field from the input event
   *   3. The `source` field from the input event (as a form of reply)
   * - For system error events, the `to` field is always set to the `source` of the input event.
   *
   * **Telemetry**
   *
   * - Creates a new span for each execution as per the traceparent and tracestate field
   *   of the event. If those are not present, then a brand new span is created and distributed
   *   tracing is disabled
   * - Sets span attributes for input and output events
   * - Propagates trace context to output events
   * - Handles error cases and sets appropriate span status
   *
   * **Event Validation**
   *
   * - Checks if the event's 'to' field matches the handler's 'source'.
   * - If they don't match, an error is thrown with a descriptive message.
   * - This ensures that the handler only processes events intended for it.
   */
  public async execute(
    event: ArvoEvent,
    opentelemetry: { inheritFrom: 'event' | 'execution'; tracer?: Tracer } = {
      inheritFrom: 'event',
      tracer: ArvoEventHandlerTracer,
    },
  ): Promise<ArvoEvent[]> {
    const spanName = `MutliArvoEventHandler.source<${this.source}>.execute<${event.type}>`;
    const spanKinds = {
      kind: this.openTelemetrySpanKind,
      openInference: this.openInferenceSpanKind,
      arvoExecution: this.arvoExecutionSpanKind,
    };
    const spanOptions: SpanOptions = {
      kind: spanKinds.kind,
      attributes: {
        [OpenInference.ATTR_SPAN_KIND]: spanKinds.openInference,
        [ArvoExecution.ATTR_SPAN_KIND]: spanKinds.arvoExecution,
      },
    };
    const span =
      opentelemetry.inheritFrom === 'event'
        ? createSpanFromEvent(spanName, event, spanKinds, opentelemetry.tracer)
        : (opentelemetry.tracer ?? ArvoEventHandlerTracer).startSpan(
            spanName,
            spanOptions,
          );

    return await context.with(
      trace.setSpan(context.active(), span),
      async () => {
        const otelSpanHeaders = currentOpenTelemetryHeaders();
        try {
          span.setStatus({ code: SpanStatusCode.OK });
          Object.entries(event.otelAttributes).forEach(([key, value]) =>
            span.setAttribute(`to_process.0.${key}`, value),
          );

          if (event.to !== this.source) {
            throw new Error(
              cleanString(`
            Invalid event. The 'event.to' is ${event.to} while this handler 
            listens to only 'event.to' equal to ${this.source}. If this is a mistake,
            please update the 'source' field of the handler
          `),
            );
          }

          const _handlerOutput = await this._handler({
            event,
            source: this.source,
          });
          if (!_handlerOutput) return [];
          let outputs: MultiArvoEventHandlerFunctionOutput[] = [];
          if (Array.isArray(_handlerOutput)) {
            outputs = _handlerOutput;
          } else {
            outputs = [_handlerOutput];
          }

          return eventHandlerOutputEventCreator(
            outputs,
            otelSpanHeaders,
            this.source,
            event,
            this.executionunits,
            (...args) => createArvoEvent(...args),
          );
        } catch (error) {
          return createHandlerErrorOutputEvent(
            error as Error,
            otelSpanHeaders,
            `sys.${this.source}.error`,
            this.source,
            event,
            this.executionunits,
            (...args) => createArvoEvent(...args),
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
