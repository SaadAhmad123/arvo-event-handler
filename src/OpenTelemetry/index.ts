import { trace } from '@opentelemetry/api';

/**
 * Returns a tracer instance for the ArvoEventHandler package.
 */
export const fetchOpenTelemetryTracer = () => {
  return trace.getTracer('arvo-instrumentation');
};
