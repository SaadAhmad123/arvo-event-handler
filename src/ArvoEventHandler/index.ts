import {
  ArvoContract,
  ArvoErrorSchema,
  ArvoEvent,
  ArvoExecution,
  ArvoExecutionSpanKind,
  OpenInference,
  OpenInferenceSpanKind,
  ResolveArvoContractRecord,
  createArvoEventFactory,
  currentOpenTelemetryHeaders,
  exceptionToSpan,
} from 'arvo-core';
import { IArvoEventHandler, ArvoEventHandlerFunction, ArvoEventHandlerFunctionOutput } from './types';
import { CloudEventContextSchema } from 'arvo-core/dist/ArvoEvent/schema';
import { ArvoEventHandlerTracer, extractContext } from '../OpenTelemetry';
import { context, Span, SpanKind, SpanOptions, SpanStatusCode, trace } from '@opentelemetry/api';

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
export default class ArvoEventHandler<TContract extends ArvoContract> {
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

  readonly openInferenceSpanKind: OpenInferenceSpanKind = OpenInferenceSpanKind.CHAIN
  readonly arvoExecutionSpanKind: ArvoExecutionSpanKind = ArvoExecutionSpanKind.EVENT_HANDLER
  readonly openTelemetrySpanKind: SpanKind = SpanKind.INTERNAL

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
    this.source = param.source || this.contract.accepts.type;
    this.arvoExecutionSpanKind = param.spanKind?.arvoExecution || this.arvoExecutionSpanKind
    this.openInferenceSpanKind = param.spanKind?.openInference || this.openInferenceSpanKind
    this.openTelemetrySpanKind = param.spanKind?.openTelemetry || this.openTelemetrySpanKind
  }

  /**
   * Executes the event handler for a given event.
   *
   * @param event - The event to handle.
   * @returns A promise that resolves to the resulting ArvoEvents.
   *
   * @remarks
   * This method performs the following steps:
   * 1. Creates an OpenTelemetry span for the execution.
   * 2. Validates the input event against the contract.
   * 3. Executes the handler function.
   * 4. Creates and returns the result event.
   * 5. Handles any errors and creates an error event if necessary.
   *
   * All telemetry data is properly set and propagated throughout the execution.
   */
  public async execute(
    event: ArvoEvent<
      ResolveArvoContractRecord<TContract['accepts']>,
      Record<string, any>,
      TContract['accepts']['type']
    >,
  ): Promise<ArvoEvent[]> {
    const spanName: string = `ArvoEventHandler<${this.contract.uri}>.execute<${event.type}>`
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
    const eventFactory = createArvoEventFactory(this.contract);
    return await context.with(trace.setSpan(context.active(), span), async () => {
      const otelSpanHeaders = currentOpenTelemetryHeaders()
      try {
        span.setStatus({code: SpanStatusCode.OK })
        Object.entries(event.otelAttributes).forEach(([key, value]) => span.setAttribute(`to_process.0.${key}`, value))
        const inputEventValidation = this.contract.validateAccepts(
          event.type,
          event.data,
        );
        if (inputEventValidation.error) {
          throw new Error(
            `Invalid event payload: ${inputEventValidation.error}`,
          );
        }
        const _handleOutput = await this._handler({event})
        if (!_handleOutput) return []
        let outputs: ArvoEventHandlerFunctionOutput<TContract>[] = []
        if (Array.isArray(_handleOutput)) {
          outputs = _handleOutput
        } else {
          outputs = [_handleOutput]
        }
        
        return outputs.map((output, index) => {
          const { __extensions, ...handlerResult } = output
          const result = eventFactory.emits(
            {
              ...handlerResult,
              traceparent: otelSpanHeaders.traceparent || undefined,
              tracestate: otelSpanHeaders.tracestate || undefined,
              source: this.source,
              subject: event.subject,
              to: handlerResult.to || event.source,
              executionunits:
                handlerResult.executionunits || this.executionunits,
            },
            __extensions,
          );
          Object.entries(result.otelAttributes).forEach(([key, value]) => span.setAttribute(`to_emit.${index}.${key}`, value))
          return result
        })
      } catch (error) {
        exceptionToSpan(error as Error)
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message,
        });
        const result = eventFactory.systemError(
          {
            source: this.source,
            subject: event.subject,
            to: event.source,
            error: error as Error,
            executionunits: this.executionunits,
            traceparent: otelSpanHeaders.traceparent || undefined,
            tracestate: otelSpanHeaders.tracestate || undefined,
          },
          {},
        );
        Object.entries(result.otelAttributes).forEach(([key, value]) => span.setAttribute(`to_emit.0.${key}`, value))
        return [result];
      } finally {
        span.end()
      }
    })
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
    return {
      type: `sys.${this.contract.accepts.type}.error`,
      schema: ArvoErrorSchema
    }
  }
}
