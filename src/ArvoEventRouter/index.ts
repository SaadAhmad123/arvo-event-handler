import { ArvoContract, ArvoEvent, ArvoExecution, ArvoExecutionSpanKind, cleanString, createArvoEvent, currentOpenTelemetryHeaders, OpenInference, OpenInferenceSpanKind } from "arvo-core";
import ArvoEventHandler from "../ArvoEventHandler";
import { IArvoEventRouter } from "./types";
import { isNullOrUndefined } from "../utils";
import { context, Span, SpanKind, SpanOptions, trace } from "@opentelemetry/api";
import { ArvoEventHandlerTracer, extractContext } from "../OpenTelemetry";
import { deleteOtelHeaders } from "./utils";

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
   * A map of all the available event handlers
   */
  readonly handlersMap: Record<string, ArvoEventHandler<ArvoContract>> = {}

  
  readonly openInferenceSpanKind: OpenInferenceSpanKind = OpenInferenceSpanKind.CHAIN
  readonly arvoExecutionSpanKind: ArvoExecutionSpanKind = ArvoExecutionSpanKind.EVENT_HANDLER
  readonly openTelemetrySpanKind: SpanKind = SpanKind.INTERNAL

  constructor(params: IArvoEventRouter) {
    this.handlers = params.handlers
    this.source = isNullOrUndefined(params.source) ? null : params.source

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

  async execute(event: ArvoEvent) : Promise<ArvoEvent[]> {
    const spanName: string = `ArvoEventRouter.source<${this.source ?? 'null'}>.execute<${event.type}>`
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
        return []
      }
      catch {
        return []
      }
      finally {
        span.end()
      }
    })
    
  }

  

}