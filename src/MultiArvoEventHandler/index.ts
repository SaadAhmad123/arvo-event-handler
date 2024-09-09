import { context, Span, SpanKind, SpanOptions, SpanStatusCode, trace } from '@opentelemetry/api';
import { ArvoEvent, ArvoExecutionSpanKind, OpenInference, OpenInferenceSpanKind, ArvoExecution, currentOpenTelemetryHeaders, exceptionToSpan, createArvoEvent, ArvoErrorSchema } from "arvo-core";
import { IMultiArvoEventHandler, MultiArvoEventHandlerFunction, MultiArvoEventHandlerFunctionOutput } from "./types";
import { CloudEventContextSchema } from "arvo-core/dist/ArvoEvent/schema";
import { ArvoEventHandlerTracer, extractContext } from '../OpenTelemetry';

/**
 * Represents a Multi ArvoEvent handler that can process multiple event types.
 * 
 * @remarks
 * Unlike ArvoEventHandler, which is bound to a specific ArvoContract and handles
 * events of a single type, MultiArvoEventHandler can handle multiple event types
 * without being tied to a specific contract. This makes it more flexible for
 * scenarios where you need to process various event types with a single handler.
 */
export default class MultiArvoEventHandler {

  /** The default execution cost associated with this handler */
  readonly executionunits: number;
  
  /** 
   * The source identifier for events produced by this handler 
   * 
   * @remarks
   * For all the events which are emitted by the handler, this is
   * the source field value of them all. 
  */
  readonly source: string;

  readonly openInferenceSpanKind: OpenInferenceSpanKind = OpenInferenceSpanKind.CHAIN
  readonly arvoExecutionSpanKind: ArvoExecutionSpanKind = ArvoExecutionSpanKind.EVENT_HANDLER
  readonly openTelemetrySpanKind: SpanKind = SpanKind.INTERNAL


  private readonly _handler: MultiArvoEventHandlerFunction;

  /**
   * Creates an instance of MultiArvoEventHandler.
   * 
   * @param param - The configuration parameters for the event handler.
   * @throws {Error} Throws an error if the provided source is invalid.
   */
  constructor(param: IMultiArvoEventHandler) {
    this.executionunits = param.executionunits
    this._handler = param.handler
    
    const {error} = CloudEventContextSchema.pick({
      source: true
    }).safeParse({ source: param.source })

    if (error) {
      throw new Error(
        `The provided 'source' is not a valid string. Error: ${error.message}`,
      );
    }

    this.source = param.source;
    this.arvoExecutionSpanKind = param.spanKind?.arvoExecution || this.arvoExecutionSpanKind
    this.openInferenceSpanKind = param.spanKind?.openInference || this.openInferenceSpanKind
    this.openTelemetrySpanKind = param.spanKind?.openTelemetry || this.openTelemetrySpanKind
  }

  /**
   * Executes the event handler for a given event.
   * 
   * @param event - The event to handle.
   * @returns A promise that resolves to the resulting ArvoEvents.
   * 
   * @remarks
   * This method performs the following steps:
   * 1. Creates an OpenTelemetry span for the execution.
   * 2. Executes the handler function.
   * 3. Creates and returns the result event.
   * 4. Handles any errors and creates an error event if necessary.
   * 
   * All telemetry data is properly set and propagated throughout the execution.
   * The method ensures that the resulting event has the correct source, subject,
   * and execution units, and includes any necessary tracing information.
   */
  public async execute(
    event: ArvoEvent
  ): Promise<ArvoEvent[]> {
    const spanName: string = `MutliArvoEventHandler.source<${this.source}>.execute<${event.type}>`
    const spanOptions: SpanOptions = {
      kind: this.openTelemetrySpanKind,
      attributes: {
        [OpenInference.ATTR_SPAN_KIND]: this.openInferenceSpanKind,
        [ArvoExecution.ATTR_SPAN_KIND]: this.arvoExecutionSpanKind,
      }
    }

    let span: Span;
    if (event.traceparent) {
      const inheritedContext = extractContext(event.traceparent, event.tracestate)
      span = ArvoEventHandlerTracer.startSpan(spanName, spanOptions, inheritedContext)
    }
    else {
      span = ArvoEventHandlerTracer.startSpan(spanName, spanOptions)
    }

    return await context.with(trace.setSpan(context.active(), span), async () => {
      const otelSpanHeaders = currentOpenTelemetryHeaders()
      try {
        span.setStatus({code: SpanStatusCode.OK })
        Object.entries(event.otelAttributes).forEach(([key, value]) => span.setAttribute(`to_process.0.${key}`, value))

        const _handlerOutput = await this._handler({event})
        if (!_handlerOutput) return []
        let outputs: MultiArvoEventHandlerFunctionOutput[] = []
        if (Array.isArray(_handlerOutput)) {
          outputs = _handlerOutput
        } else {
          outputs = [_handlerOutput]
        }

        return outputs.map((output, index) => {
          const {__extensions, ...handlerResult} = output
          const result = createArvoEvent(
            {
              ...handlerResult,
              traceparent: otelSpanHeaders.traceparent || undefined,
              tracestate: otelSpanHeaders.tracestate || undefined,
              source: this.source,
              subject: event.subject,
              to: handlerResult.to || event.source,
              executionunits:
                  handlerResult.executionunits || this.executionunits,
            },
            __extensions,
          )
          Object.entries(result.otelAttributes).forEach(([key, value]) => span.setAttribute(`to_emit.${index}.${key}`, value))
          return result
        })
      } catch (error) {
        exceptionToSpan(error as Error)
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        const result = createArvoEvent({
          type: `sys.${this.source}.error`,
          source: this.source,
          subject: event.subject,
          to: event.source,
          executionunits: this.executionunits,
          traceparent: otelSpanHeaders.traceparent || undefined,
          tracestate: otelSpanHeaders.tracestate || undefined,
          data: {
            errorName: (error as Error).name,
            errorMessage: (error as Error).message,
            errorStack: (error as Error).stack || null
          }
        })
        Object.entries(result.otelAttributes).forEach(([key, value]) => span.setAttribute(`to_emit.0.${key}`, value))
        return [result];
      }
      finally {
        span.end()
      }
    })

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
      schema: ArvoErrorSchema
    }
  }
}

