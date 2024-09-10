import { ArvoContract, ArvoEvent, ArvoExecution, ArvoExecutionSpanKind, cleanString, createArvoEvent, currentOpenTelemetryHeaders, exceptionToSpan, OpenInference, OpenInferenceSpanKind } from "arvo-core";
import ArvoEventHandler from "../ArvoEventHandler";
import { IArvoEventRouter } from "./types";
import { getValueOrDefault, isNullOrUndefined } from "../utils";
import { context, Span, SpanKind, SpanOptions, SpanStatusCode, trace } from "@opentelemetry/api";
import { ArvoEventHandlerTracer, extractContext } from "../OpenTelemetry";
import { deleteOtelHeaders } from "./utils";

/**
 * ArvoEventRouter class handles routing of ArvoEvents to appropriate event handlers.
 */
export class ArvoEventRouter {

  /**
   * The source name of the router. The router attempts
   * to match the `event.to` field with this value
   * @property {string} [source]
   */
  readonly source: string | null

  /**
   * A list of all available event handlers to be used by the router.
   * @property {ArvoEventHandler<ArvoContract>[]} handlers
   */
  readonly handlers: ArvoEventHandler<ArvoContract>[]

  /**
   * The default execution cost of the function.
   * This can represent a dollar value or some other number with a rate card.
   */
  readonly executionunits: number;
  
  /**
   * A map of all the available event handlers
   */
  readonly handlersMap: Record<string, ArvoEventHandler<ArvoContract>> = {}

  
  readonly openInferenceSpanKind: OpenInferenceSpanKind = OpenInferenceSpanKind.CHAIN
  readonly arvoExecutionSpanKind: ArvoExecutionSpanKind = ArvoExecutionSpanKind.EVENT_HANDLER
  readonly openTelemetrySpanKind: SpanKind = SpanKind.INTERNAL

  /**
   * Creates an instance of ArvoEventRouter.
   * @param {IArvoEventRouter} params - The parameters for initializing the router
   * @throws {Error} If there are duplicate handlers for the same event type
   */
  constructor(params: IArvoEventRouter) {
    this.handlers = params.handlers
    this.source = isNullOrUndefined(params.source) ? null : params.source
    this.executionunits = params.executionunits

    for (const handler of this.handlers) {
      if (this.handlersMap[handler.contract.accepts.type]) {
        const existingHandler = this.handlersMap[handler.contract.accepts.type]
        throw new Error(cleanString(`
          Duplicate handlers for event.type=${handler.contract.accepts.type} found. There are same 'contract.accept.types' in 
          contracts 'uri=${existingHandler.contract.uri}' and 'uri=${handler.contract.uri}'. This router does not support handlers
          with the same 'contract.accept.type'.
        `))
      }
      this.handlersMap[handler.contract.accepts.type] = handler
    }
  }

  /**
   * Executes the routing process for a given ArvoEvent.
   * 
   * @param event - The ArvoEvent to be processed and routed.
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
  async execute(event: ArvoEvent) : Promise<ArvoEvent[]> {
    const spanName: string = `ArvoEventRouter.source<${this.source ?? 'arvo.event.router'}>.execute<${event.type}>`
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
      const newEvent = deleteOtelHeaders(event)
      try {
        span.setStatus({code: SpanStatusCode.OK })

        if (!isNullOrUndefined(this.source) && newEvent.to !== this.source) {
          throw new Error(cleanString(`
            Invalid event. The 'event.to' is ${newEvent.to} while this handler 
            listens to only 'event.to' equal to ${this.source}. If this is a mistake,
            please update the 'source' field of the handler
          `))
        }

        if (!this.handlersMap[newEvent.type]) {
          throw new Error(cleanString(`
            Invalid event (type=${newEvent.type}). No valid handler 
            <handler[*].contract.accepts.type> found in the router.
          `))
        }

        const results = await this.handlersMap[newEvent.type].execute(newEvent)

        return results.map((event) => createArvoEvent({
          id: event.id,
          time: event.time,
          source: getValueOrDefault(this.source, event.source),
          specversion: '1.0',
          type: event.type,
          subject: event.subject,
          datacontenttype: event.datacontenttype,
          data: event.data,
          dataschema: event.dataschema ?? undefined,
          to: event.to ?? undefined,  
          accesscontrol: event.accesscontrol ?? undefined,
          redirectto: event.redirectto ?? undefined,
          executionunits: (event.executionunits ?? 0) + this.executionunits,
          traceparent: otelSpanHeaders.traceparent ?? undefined,
          tracestate: otelSpanHeaders.tracestate ?? undefined,
        }))
      } catch (error) {
        exceptionToSpan(error as Error)
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        Object.entries(event.otelAttributes).forEach(([key, value]) => span.setAttribute(`to_process.0.${key}`, value))
        const result = createArvoEvent({
          type: `sys.arvo.event.router.error`,
          source: this.source || `arvo.event.router`,
          subject: event.subject,
          // The system error must always got back to 
          // the source
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

  

}