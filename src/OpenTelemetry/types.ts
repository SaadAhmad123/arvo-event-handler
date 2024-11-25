import { Span, SpanKind, SpanOptions, Tracer } from '@opentelemetry/api';
import {
  ArvoEvent,
  ArvoExecutionSpanKind,
  OpenInferenceSpanKind,
} from 'arvo-core';

export type PackageJson = {
  name: string;
  version: string;
  [key: string]: any;
};

/**
 * Configuration options for OpenTelemetry integration in execution context.
 *
 * This type defines how tracing should be configured and inherited within
 * the execution pipeline.
 */
export type OpenTelemetryConfig = {
  /**
   * Specifies the context from which to inherit OpenTelemetry context.
   * - 'event': Inherits context from the event that triggered the execution
   * - 'execution': Inherits context from the parent execution context
   */
  inheritFrom: 'event' | 'execution';

  /**
   * Optional OpenTelemetry tracer instance to use for creating spans.
   * If not provided, a default tracer may be used depending on the implementation.
   */
  tracer: Tracer | null;
};

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
 * @property {EventHandlerExecutionOtelConfiguration} opentelemetryConfig - Configuration for OpenTelemetry behavior
 */
export interface ICreateOtelSpan {
  spanName: string;
  spanKinds: {
    kind: SpanKind;
    openInference: OpenInferenceSpanKind;
    arvoExecution: ArvoExecutionSpanKind;
  };
  event: ArvoEvent;
  opentelemetryConfig?: OpenTelemetryConfig;
}
