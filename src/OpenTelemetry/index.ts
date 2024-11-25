import { trace, propagation, Context, context } from '@opentelemetry/api';
import { getPackageInfo } from './utils';

/**
 * Returns a tracer instance for the ArvoEventHandler package.
 */
export const fetchOpenTelemetryTracer = () => {
  const pkg = getPackageInfo('arvo-event-handler');
  return trace.getTracer(pkg.name, pkg.version);
};
