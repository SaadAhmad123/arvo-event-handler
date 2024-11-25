import {
  ArvoContract,
  ArvoEvent,
  ArvoExecutionSpanKind,
  ArvoSemanticVersion,
  OpenInferenceSpanKind,
  VersionedArvoContract,
  createArvoEventFactory,
  currentOpenTelemetryHeaders,
  exceptionToSpan,
  logToSpan,
  parseEventDataSchema,
} from 'arvo-core';
import {
  IArvoEventHandler,
  ArvoEventHandlerFunction,
  ArvoEventHandlerFunctionOutput,
} from './types';
import { CloudEventContextSchema } from 'arvo-core/dist/ArvoEvent/schema';
import { context, SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { eventHandlerOutputEventCreator } from '../utils';
import AbstractArvoEventHandler from '../AbstractArvoEventHandler';
import { fetchOpenTelemetryTracer } from '../OpenTelemetry';
import { OpenTelemetryConfig } from '../OpenTelemetry/types';
import { createOtelSpan } from '../OpenTelemetry/utils';

/**
 * Represents an event handler for Arvo contracts.
 *
 * @template TContract - The type of ArvoContract this handler is associated with.
 *
 * @remarks
 * This class is the core component for handling Arvo events. It encapsulates the logic
 * for executing event handlers, managing telemetry, and ensuring proper contract validation.
 * It's designed to be flexible and reusable across different Arvo contract implementations.
 */
export default class ArvoEventHandler<
  TContract extends ArvoContract,
> extends AbstractArvoEventHandler {
  /** The contract of the handler to which it is bound */
  readonly contract: TContract;

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

  readonly openInferenceSpanKind: OpenInferenceSpanKind =
    OpenInferenceSpanKind.CHAIN;
  readonly arvoExecutionSpanKind: ArvoExecutionSpanKind =
    ArvoExecutionSpanKind.EVENT_HANDLER;
  readonly openTelemetrySpanKind: SpanKind = SpanKind.INTERNAL;

  private readonly _handler: ArvoEventHandlerFunction<TContract>;

  /**
   * Creates an instance of ArvoEventHandler.
   *
   * @param param - The configuration parameters for the event handler.
   *
   * @throws {Error} Throws an error if the provided source is invalid.
   *
   * @remarks
   * The constructor validates the source parameter against the CloudEventContextSchema.
   * If no source is provided, it defaults to the contract's accepted event type.
   */
  constructor(param: IArvoEventHandler<TContract>) {
    super();
    this.contract = param.contract;
    this.executionunits = param.executionunits;
    this._handler = param.handler;
    if (param.source) {
      const { error } = CloudEventContextSchema.pick({
        source: true,
      }).safeParse({ source: param.source });
      if (error) {
        throw new Error(
          `The provided 'source' is not a valid string. Error: ${error.message}`,
        );
      }
    }
    this.source = param.source ?? this.contract.type;
    this.arvoExecutionSpanKind =
      param.spanKind?.arvoExecution ?? this.arvoExecutionSpanKind;
    this.openInferenceSpanKind =
      param.spanKind?.openInference ?? this.openInferenceSpanKind;
    this.openTelemetrySpanKind =
      param.spanKind?.openTelemetry ?? this.openTelemetrySpanKind;

    for (const contractVersions of Object.keys(this.contract.versions)) {
      if (!this._handler[contractVersions as ArvoSemanticVersion]) {
        throw new Error(
          `The event handler for contract (uri=${this.contract.uri}) must contain a handler for version ${contractVersions}.`,
        );
      }
    }
  }

  /**
   * Executes the event handler for a given event.
   *
   * @param event - The event to handle.
   * @param opentelemetry - Configuration for OpenTelemetry integration, including tracing options
   *                        and context inheritance settings. Default is inherit from event and internal tracer
   * @returns A promise that resolves to an array of resulting ArvoEvents.
   *
   * This method performs the following steps:
   * 1. Creates an OpenTelemetry span for the execution.
   * 2. Validates the input event against the contract.
   * 3. Executes the handler function.
   * 4. Creates and returns the result event(s).
   * 5. Handles any errors and creates an error event if necessary.
   *
   * All telemetry data is properly set and propagated throughout the execution.
   *
   * @example
   * ```typescript
   * const contract = createArvoContract({ ... })
   * const handler = createArvoEventHandler({
   *    contract: contract,
   *    ...
   * });
   * const inputEvent: ArvoEvent<...> = createArvoEvent({ ... });
   * const resultEvents = await handler.execute(inputEvent);
   * ```
   *
   * @throws All error throw during the execution are returned as a system error event
   *
   * **Routing**
   *
   * The routing of the resulting events is determined as follows:
   * - The `to` field of the output event is set in this priority:
   *   1. The `to` field provided by the handler result
   *   2. The `redirectto` field from the input event
   *   3. The `source` field from the input event (as a form of reply)
   * - For system error events, the `to` field is always set to the `source` of the input event.
   *
   * **Telemetry**
   *
   * - Creates a new span for each execution as per the traceparent and tracestate field
   *   of the event. If those are not present, then a brand new span is created and distributed
   *   tracing is disabled
   * - Sets span attributes for input and output events
   * - Propagates trace context to output events
   * - Handles error cases and sets appropriate span status
   */
  public async execute(
    event: ArvoEvent,
    opentelemetry?: OpenTelemetryConfig,
  ): Promise<ArvoEvent[]> {
    const span = createOtelSpan({
      spanName: `ArvoEventHandler<${this.contract.uri}>.execute<${event.type}>`,
      spanKinds: {
        kind: this.openTelemetrySpanKind,
        openInference: this.openInferenceSpanKind,
        arvoExecution: this.arvoExecutionSpanKind,
      },
      event: event,
      opentelemetryConfig: opentelemetry,
    });

    return await context.with(
      trace.setSpan(context.active(), span),
      async () => {
        const otelSpanHeaders = currentOpenTelemetryHeaders();
        try {
          span.setStatus({ code: SpanStatusCode.OK });

          if (this.contract.type !== event.type) {
            throw new Error(
              `Invalid event type='${event.type}' is provide to handler for type='${this.contract.type}'`,
            );
          }

          const parsedDataSchema = parseEventDataSchema(event);
          if (!parsedDataSchema?.version) {
            logToSpan({
              level: 'WARNING',
              message: `Unable to resolve the event version from dataschema "${event.dataschema}". Defaulting to the latest version.`,
            });
          }

          const handlerContract = this.contract.version(
            parsedDataSchema?.version ?? 'latest',
          );

          Object.entries(event.otelAttributes).forEach(([key, value]) =>
            span.setAttribute(`to_process.0.${key}`, value),
          );

          const inputEventValidation = handlerContract.accepts.schema.safeParse(
            event.data,
          );
          if (inputEventValidation.error) {
            throw new Error(
              `Invalid event payload: ${inputEventValidation.error}`,
            );
          }

          const _handleOutput = await this._handler[handlerContract.version]({
            event,
            source: this.source,
          });

          if (!_handleOutput) return [];

          let outputs: ArvoEventHandlerFunctionOutput<
            VersionedArvoContract<TContract, typeof handlerContract.version>
          >[] = [];
          if (Array.isArray(_handleOutput)) {
            outputs = _handleOutput;
          } else {
            outputs = [_handleOutput];
          }

          const eventFactory = createArvoEventFactory(handlerContract);
          return eventHandlerOutputEventCreator(
            outputs,
            otelSpanHeaders,
            this.source,
            event,
            this.executionunits,
            (param, extension) =>
              eventFactory.emits(param, extension, {
                tracer: opentelemetry?.tracer ?? fetchOpenTelemetryTracer(),
              }),
          );
        } catch (error) {
          const eventFactory = createArvoEventFactory(
            this.contract.version('any'),
          );
          exceptionToSpan(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (error as Error).message,
          });
          const result = eventFactory.systemError(
            {
              source: this.source,
              subject: event.subject,
              // The system error must always got back to
              // the source
              to: event.source,
              error: error as Error,
              executionunits: this.executionunits,
              traceparent: otelSpanHeaders.traceparent ?? undefined,
              tracestate: otelSpanHeaders.tracestate ?? undefined,
              accesscontrol: event.accesscontrol ?? undefined,
            },
            {},
            { tracer: opentelemetry?.tracer ?? fetchOpenTelemetryTracer() },
          );
          Object.entries(result.otelAttributes).forEach(([key, value]) =>
            span.setAttribute(`to_emit.0.${key}`, value),
          );
          return [result];
        } finally {
          span.end();
        }
      },
    );
  }

  /**
   * Provides the schema for system error events.
   *
   * @returns An object containing the error event type and schema.
   *
   * @remarks
   * This getter defines the structure for system error events that may be emitted
   * when an unexpected error occurs during event handling. The error event type
   * is prefixed with 'sys.' followed by the contract's accepted event type and '.error'.
   * The schema used for these error events is the standard ArvoErrorSchema.
   *
   * @example
   * // If the contract's accepted event type is 'user.created'
   * // The system error event type would be 'sys.user.created.error'
   */
  public get systemErrorSchema() {
    return this.contract.systemError;
  }
}
