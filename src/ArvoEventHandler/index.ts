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
  EventDataschemaUtil,
  ArvoExecution,
  OpenInference,
  ArvoOpenTelemetry,
} from 'arvo-core';
import {
  IArvoEventHandler,
  ArvoEventHandlerFunction,
  ArvoEventHandlerFunctionOutput,
} from './types';
import {
  SpanStatusCode,
  SpanOptions,
  SpanKind,
} from '@opentelemetry/api';
import { createEventHandlerTelemetryConfig, eventHandlerOutputEventCreator } from '../utils';
import AbstractArvoEventHandler from '../AbstractArvoEventHandler';
import { ArvoEventHandlerOpenTelemetryOptions } from '../types';

/**
 * ArvoEventHandler manages the execution and processing of events in accordance with
 * Arvo contracts. This class serves as the cornerstone for event handling operations,
 * integrating contract validation, telemetry management, and event processing.
 *
 * The handler implements a robust execution flow that ensures proper validation,
 * versioning, and error handling while maintaining detailed telemetry through
 * OpenTelemetry integration. It supports versioned contracts and handles routing
 * of both successful and error events.
 */
export default class ArvoEventHandler<
  TContract extends ArvoContract,
> extends AbstractArvoEventHandler {
  /** Contract instance that defines the event schema and validation rules */
  public readonly contract: TContract;

  /** Computational cost metric associated with event handling operations */
  public readonly executionunits: number;

  /** OpenTelemetry configuration for event handling spans */
  public readonly spanOptions: SpanOptions;

  /** Version-specific event handler implementation map */
  public readonly handler: ArvoEventHandlerFunction<TContract>;

  /** The source identifier for events produced by this handler */
  public get source(): TContract['type'] {
    return this.contract.type;
  }

  /**
   * Initializes a new ArvoEventHandler instance with the specified contract and configuration.
   * Validates handler implementations against contract versions during initialization.
   *
   * The constructor ensures that handler implementations exist for all supported contract
   * versions and configures OpenTelemetry span attributes for monitoring event handling.
   *
   * @param param - Handler configuration including contract, execution units, and handler implementations
   * @throws When handler implementations are missing for any contract version
   */
  constructor(param: IArvoEventHandler<TContract>) {
    super();
    this.contract = param.contract;
    this.executionunits = param.executionunits;
    this.handler = param.handler;

    for (const contractVersions of Object.keys(this.contract.versions)) {
      if (!this.handler[contractVersions as ArvoSemanticVersion]) {
        throw new Error(
          `Contract ${this.contract.uri} requires handler implementation for version ${contractVersions}`,
        );
      }
    }

    this.spanOptions = {
      kind: SpanKind.CONSUMER,
      ...param.spanOptions,
      attributes: {
        [ArvoExecution.ATTR_SPAN_KIND]: ArvoExecutionSpanKind.EVENT_HANDLER,
        [OpenInference.ATTR_SPAN_KIND]: OpenInferenceSpanKind.CHAIN,
        ...(param.spanOptions?.attributes ?? {}),
        'arvo.handler.source': this.source,
        'arvo.contract.uri': this.contract.uri,
      },
    };
  }

  /**
   * Processes an event according to the contract specifications. The execution flow encompasses
   * span management, validation, handler execution, and error processing phases.
   *
   * Event Routing Logic:
   * - Success events: Routes based on priority (handler result -> redirectto -> source)
   * - Error events: Always routes back to the source
   *
   * Telemetry Integration:
   * - Creates and manages OpenTelemetry spans for execution tracking
   * - Propagates trace context through the event chain
   * - Records execution metrics and error details
   *
   * Version Resolution:
   * - Extracts version from event dataschema
   * - Falls back to latest version if unspecified
   * - Validates event data against versioned contract schema
   *
   * Error Handling:
   * - Converts all errors to system error events
   * - Maintains telemetry context for error scenarios
   * - Ensures proper error event routing
   *
   * @param event - The event to process
   * @param opentelemetry - Configuration for OpenTelemetry context inheritance
   * @returns Promise resolving to array of result events or error event
   */
  public async execute(
    event: ArvoEvent,
    opentelemetry: ArvoEventHandlerOpenTelemetryOptions = {
      inheritFrom: 'EVENT',
    },
  ): Promise<ArvoEvent[]> {
    const otelConfig = createEventHandlerTelemetryConfig(
      'ArvoEventHandler',
      this.spanOptions,
      opentelemetry,
      event
    )
    return await ArvoOpenTelemetry.getInstance().startActiveSpan({
      ...otelConfig,
      fn: async (span) => {
        const otelSpanHeaders = currentOpenTelemetryHeaders();
        try {
          span.setStatus({ code: SpanStatusCode.OK });
          Object.entries(event.otelAttributes).forEach(([key, value]) =>
            span.setAttribute(`to_process.0.${key}`, value),
          );

          if (this.contract.type !== event.type) {
            throw new Error(
              `Event type mismatch: Received '${event.type}', expected '${this.contract.type}'`,
            );
          }

          logToSpan({
            level: 'INFO',
            message: `Event type '${event.type}' validated against contract '${this.contract.uri}'`,
          });

          const parsedDataSchema = EventDataschemaUtil.parse(event);
          if (!parsedDataSchema?.version) {
            logToSpan({
              level: 'WARNING',
              message: `Version resolution failed for event with dataschema '${event.dataschema}'. Defaulting to latest version (=${this.contract.version('latest').version}) of contract (uri=${this.contract.uri})`,
            });
          }

          const handlerContract = this.contract.version(
            parsedDataSchema?.version ?? 'latest',
          );

          logToSpan({
            level: 'INFO',
            message: `Processing event with contract version ${handlerContract.version}`,
          });

          const inputEventValidation = handlerContract.accepts.schema.safeParse(
            event.data,
          );
          if (inputEventValidation.error) {
            throw new Error(
              `Event payload validation failed: ${inputEventValidation.error}`,
            );
          }

          logToSpan({
            level: 'INFO',
            message: `Event payload validated successfully against contract ${EventDataschemaUtil.create(handlerContract)}`,
          });

          logToSpan({
            level: 'INFO',
            message: `Executing handler for event type '${event.type}'`,
          });

          const _handleOutput = await this.handler[handlerContract.version]({
            event,
            source: this.source,
            span: span,
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
          const result = eventHandlerOutputEventCreator(
            outputs,
            otelSpanHeaders,
            this.source,
            event,
            this.executionunits,
            (param, extensions) => eventFactory.emits(param, extensions),
          );

          logToSpan({
            level: 'INFO',
            message: `Event processing completed successfully. Generated ${result.length} event(s)`,
          });

          logToSpan({
            level: 'INFO',
            message: 'Event handled successfully',
          });

          return result;
        } catch (error) {
          const eventFactory = createArvoEventFactory(
            this.contract.version('latest'),
          );
          exceptionToSpan(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: `Event processing failed: ${(error as Error).message}`,
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
          );
          Object.entries(result.otelAttributes).forEach(([key, value]) =>
            span.setAttribute(`to_emit.0.${key}`, value),
          );
          return [result];
        } finally {
          span.end();
        }
      },
    });
  }

  /**
   * Provides access to the system error event schema configuration.
   * The schema defines the structure of error events emitted during execution failures.
   *
   * Error events follow the naming convention: sys.<contract-type>.error
   * For example, a contract handling 'user.created' events will emit error events
   * with the type 'sys.user.created.error'.
   */
  public get systemErrorSchema() {
    return this.contract.systemError;
  }
}
