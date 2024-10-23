import { SpanKind, SpanOptions, Tracer } from "@opentelemetry/api";
import { createSpanFromEvent } from "../OpenTelemetry/utils";
import { ArvoEvent, ArvoExecution, ArvoExecutionSpanKind, OpenInference, OpenInferenceSpanKind } from "arvo-core";
import { ExecutionOpenTelemetryConfiguration } from "./types";
import { fetchOpenTelemetryTracer } from "../OpenTelemetry";

/**
 * Interface defining the required parameters for creating a handler execution span.
 * 
 * @interface ICreateHandlerExecutionSpan
 * @property {string} spanName - The name to be assigned to the created span
 * @property {Object} spanKinds - Object containing different span kind classifications
 * @property {SpanKind} spanKinds.kind - OpenTelemetry span kind
 * @property {OpenInferenceSpanKind} spanKinds.openInference - OpenInference-specific span classification
 * @property {ArvoExecutionSpanKind} spanKinds.arvoExecution - Arvo execution-specific span classification
 * @property {ArvoEvent} event - The Arvo event associated with this span
 * @property {ExecutionOpenTelemetryConfiguration} opentelemetryConfig - Configuration for OpenTelemetry behavior
 */
interface ICreateHandlerExecutionSpan {
    spanName: string,
    spanKinds: {
        kind: SpanKind;
        openInference: OpenInferenceSpanKind;
        arvoExecution: ArvoExecutionSpanKind;
    },
    event: ArvoEvent,
    opentelemetryConfig?: ExecutionOpenTelemetryConfiguration
}

/**
 * Creates an OpenTelemetry span for tracking handler execution.
 * 
 * This function creates a span either from an existing event or as a new span,
 * depending on the configuration. It includes attributes for both OpenInference
 * and Arvo execution span kinds.
 * 
 * @param params - Parameters for creating the handler execution span
 * @param params.spanName - Name of the span to be created
 * @param params.spanKinds - Object containing different span kind classifications
 * @param params.event - The Arvo event associated with this span
 * @param params.opentelemetryConfig - OpenTelemetry configuration
 * 
 * @returns A new OpenTelemetry span configured according to the parameters
 */
export const createHandlerExecutionSpan = ({
    spanName,
    spanKinds,
    event,
    opentelemetryConfig = {
        inheritFrom: 'event',
        tracer: null
    },
}: ICreateHandlerExecutionSpan) => {
    const spanOptions: SpanOptions = {
      kind: spanKinds.kind,
      attributes: {
        [OpenInference.ATTR_SPAN_KIND]: spanKinds.openInference,
        [ArvoExecution.ATTR_SPAN_KIND]: spanKinds.arvoExecution,
      },
    };

    let tracer: Tracer = opentelemetryConfig.tracer ?? fetchOpenTelemetryTracer()
    return opentelemetryConfig.inheritFrom === "event" ? 
        createSpanFromEvent(spanName, event, spanKinds, tracer) : 
        tracer.startSpan(spanName, spanOptions)
}