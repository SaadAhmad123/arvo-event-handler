import { Tracer } from '@opentelemetry/api';

/**
 * Configuration options for OpenTelemetry integration in execution context.
 *
 * This type defines how tracing should be configured and inherited within
 * the execution pipeline.
 *
 * @example
 * ```typescript
 * const config: ExecutionOpenTelemetryConfiguration = {
 *   inheritFrom: 'event',
 *   tracer: new OpenTelemetry.Tracer('service-name')
 * };
 * ```
 */
export type ExecutionOpenTelemetryConfiguration = {
  /**
   * Specifies the context from which to inherit OpenTelemetry context.
   *
   * @property {('event' | 'execution')} inheritFrom
   * - 'event': Inherits context from the event that triggered the execution
   * - 'execution': Inherits context from the parent execution context
   */
  inheritFrom: 'event' | 'execution';

  /**
   * Optional OpenTelemetry tracer instance to use for creating spans.
   * If not provided, a default tracer may be used depending on the implementation.
   *
   * @property {Tracer} [tracer]
   * @see {@link https://open-telemetry.github.io/opentelemetry-js/classes/_opentelemetry_api.Tracer.html OpenTelemetry Tracer}
   */
  tracer?: Tracer;
};
