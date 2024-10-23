import { trace, propagation, Context, context } from '@opentelemetry/api';
import { getPackageInfo } from './utils';

/**
 * Returns a tracer instance for the ArvoEventHandler package.
 */
export const fetchOpenTelemetryTracer = () => {
  const pkg = getPackageInfo("arvo-event-handler");
  return trace.getTracer(pkg.name, pkg.version);
}

// Helper function to extract context from traceparent and tracestate
export const extractContext = (
  traceparent: string,
  tracestate: string | null,
): Context => {
  const extractedContext = propagation.extract(context.active(), {
    traceparent,
    tracestate: tracestate ?? undefined,
  });
  return extractedContext;
};
