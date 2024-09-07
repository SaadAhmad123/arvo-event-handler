import {
  ArvoContract,
  ArvoEvent,
  ResolveArvoContractRecord,
  TelemetryContext,
  createOtelSpan,
  createArvoEventFactory,
  exceptionToSpan,
} from 'arvo-core';
import { IArvoEventHandler, ArvoEventHandlerFunction } from './types';
import { SpanStatusCode } from '@opentelemetry/api';
import { CloudEventContextSchema } from 'arvo-core/dist/ArvoEvent/schema';

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

  /** The source identifier for events produced by this handler */
  readonly source: string;

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
  }

  /**
   * Executes the event handler for a given event.
   *
   * @param event - The event to handle.
   * @param telemetry - Optional telemetry context for tracing and monitoring.
   * @returns A promise that resolves to the resulting ArvoEvent.
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
    telemetry?: TelemetryContext,
  ): Promise<ArvoEvent> {
    return await createOtelSpan(
      telemetry || 'Execute ArvoEvent Handler',
      `ArvoEventHandler<${this.contract.uri}>.execute<${event.type}>`,
      { attributes: event.otelAttributes },
      async (telemetryContext) => {
        const eventFactory = createArvoEventFactory(this.contract);
        try {
          const inputEventValidation = this.contract.validateInput(
            event.type,
            event.data,
          );
          if (!inputEventValidation.success) {
            throw new Error(
              `Invalid event payload: ${inputEventValidation.error}`,
            );
          }
          const { __extensions, ...handlerResult } = await this._handler({
            event: event,
            telemetry: telemetryContext,
          });
          const result = eventFactory.emits(
            {
              ...handlerResult,
              source: this.source,
              subject: event.subject,
              to: handlerResult.to || event.source,
              executionunits:
                handlerResult.executionunits || this.executionunits,
            },
            __extensions,
            telemetryContext,
          );
          telemetryContext.span.setAttributes(result.otelAttributes);
          telemetryContext.span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (e) {
          const result = eventFactory.systemError(
            {
              source: this.source,
              subject: event.subject,
              to: event.source,
              error: e as Error,
              executionunits: this.executionunits,
            },
            {},
            telemetryContext,
          );
          telemetryContext.span.setStatus({
            code: SpanStatusCode.ERROR,
            message: (e as Error).message,
          });
          exceptionToSpan(telemetryContext.span, 'CRITICAL', e as Error);
          telemetryContext.span.setAttributes(result.otelAttributes);
          return result;
        }
      },
    );
  }
}
