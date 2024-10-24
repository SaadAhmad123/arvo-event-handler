import { Span, SpanKind, SpanOptions, Tracer } from '@opentelemetry/api';
import {
  ArvoEvent,
  ArvoExecution,
  ArvoExecutionSpanKind,
  OpenInference,
  OpenInferenceSpanKind,
} from 'arvo-core';
import * as fs from 'fs';
import * as path from 'path';
import { fetchOpenTelemetryTracer, extractContext } from '.';

interface PackageJson {
  name: string;
  version: string;
  [key: string]: any;
}

export function getPackageInfo(defaultName: string): { name: string; version: string } {
  try {
    // Read the package.json file
    const packageJsonPath = path.resolve(__dirname, '../../package.json');
    const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');

    // Parse the JSON content
    const packageJson: PackageJson = JSON.parse(packageJsonContent);

    // Extract name and version
    const { name, version } = packageJson;

    return { name, version };
  } catch (error) {
    console.error('Error reading package.json:', error);
    return { name: defaultName, version: 'Unknown' };
  }
}

/**
 * Creates an OpenTelemetry span from an ArvoEvent, facilitating distributed tracing in the Arvo system.
 *
 * This function is a cornerstone of Arvo's observability infrastructure, creating spans that represent
 * discrete units of work or operations within the system. It supports both creating new root spans
 * and continuing existing traces, enabling comprehensive end-to-end tracing across distributed components.
 *
 * @param spanName - A descriptive name for the span, indicating the operation being traced.
 *                   Choose a name that clearly identifies the work being performed.
 *
 * @param event - The ArvoEvent that triggers the span creation. This event may contain
 *                tracing context (traceparent and tracestate) to link this span to an existing trace.
 *
 * @param spanKinds - An object specifying the span's categorization across different tracing contexts:
 * @param spanKinds.kind - OpenTelemetry SpanKind, indicating the span's role in the trace hierarchy
 *                         (e.g., SERVER, CLIENT, INTERNAL).
 * @param spanKinds.openInference - OpenInference span kind, used for AI/ML operation categorization.
 * @param spanKinds.arvoExecution - ArvoExecution span kind, for Arvo-specific execution context labeling.
 *
 * @param tracer - The OpenTelemetry Tracer instance to use for creating the span.
 *                 Defaults to ArvoXStateTracer if not provided.
 *
 * @returns A new OpenTelemetry Span object that can be used to record operation details,
 *          set attributes, and create child spans.
 *
 * @remarks
 * - If the input event contains a 'traceparent', the function will continue the existing trace,
 *   maintaining the distributed tracing context across system boundaries.
 * - Without a 'traceparent', a new root span is created, potentially starting a new trace.
 * - The function automatically sets OpenInference and ArvoExecution-specific attributes,
 *   enhancing the span's context for specialized analysis.
 *
 * @example
 * ```typescript
 * const event: ArvoEvent = createArvoEvent({
 *   type: 'orderProcess',
 *   data: { orderId: '12345' },
 *   traceparent: "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01",
 *   tracestate: "rojo=00f067aa0ba902b7",
 *   ...
 * });
 *
 * const span = createSpanFromEvent("processOrder", event, {
 *   kind: SpanKind.INTERNAL,
 *   openInference: OpenInferenceSpanKind.LLM,
 *   arvoExecution: ArvoExecutionSpanKind.EVENT_HANDLER
 * });
 *
 * context.with(trace.setSpan(context.active(), span), () => {
 *  try {
 *    // Perform order processing logic
 *    span.setAttributes({ orderId: '12345', status: 'processing' });
 *    // ... more processing ...
 *    span.setStatus({ code: SpanStatusCode.OK });
 *  } catch (error) {
 *    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
 *  } finally {
 *    span.end(); // Always remember to end the span
 *  }
 * })
 * ```
 */
export const createSpanFromEvent = (
  spanName: string,
  event: ArvoEvent,
  spanKinds: {
    kind: SpanKind;
    openInference: OpenInferenceSpanKind;
    arvoExecution: ArvoExecutionSpanKind;
  },
  tracer: Tracer = fetchOpenTelemetryTracer(),
): Span => {
  const spanOptions: SpanOptions = {
    kind: spanKinds.kind,
    attributes: {
      [OpenInference.ATTR_SPAN_KIND]: spanKinds.openInference,
      [ArvoExecution.ATTR_SPAN_KIND]: spanKinds.arvoExecution,
    },
  };

  let span: Span;
  if (event.traceparent) {
    const inheritedContext = extractContext(
      event.traceparent,
      event.tracestate,
    );
    span = tracer.startSpan(spanName, spanOptions, inheritedContext);
  } else {
    span = tracer.startSpan(spanName, spanOptions);
  }

  return span;
};
