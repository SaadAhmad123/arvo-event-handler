import { SpanKind, type SpanOptions, SpanStatusCode } from '@opentelemetry/api';
import {
  type ArvoContract,
  type ArvoEvent,
  ArvoExecution,
  ArvoExecutionSpanKind,
  ArvoOpenTelemetry,
  type ArvoSemanticVersion,
  EventDataschemaUtil,
  OpenInference,
  OpenInferenceSpanKind,
  type VersionedArvoContract,
  type ViolationError,
  createArvoEventFactory,
  currentOpenTelemetryHeaders,
  exceptionToSpan,
  logToSpan,
} from 'arvo-core';
import AbstractArvoEventHandler from '../AbstractArvoEventHandler';
import { ConfigViolation, ContractViolation } from '../errors';
import type { ArvoEventHandlerOpenTelemetryOptions } from '../types';
import { createEventHandlerTelemetryConfig, eventHandlerOutputEventCreator } from '../utils';
import type { ArvoEventHandlerFunction, ArvoEventHandlerFunctionOutput, IArvoEventHandler } from './types';

/**
 * ArvoEventHandler is the core component for processing events in the Arvo system. It enforces
 * contracts between services by ensuring that all events follow their specified formats and rules.
 *
 * The handler is built on two fundamental patterns: Meyer's Design by Contract and Fowler's
 * Tolerant Reader. It binds to an ArvoContract that defines what events it can receive and send
 * across all versions. This versioning is strict - the handler must implement every version defined
 * in its contract, or it will fail both at compile time and runtime.
 *
 * Following the Tolerant Reader pattern, the handler accepts any incoming event but only processes
 * those that exactly match one of its contract versions. When an event matches, it's handled by
 * the specific implementation for that version. This approach maintains compatibility while
 * ensuring precise contract adherence.
 *
 * The handler uses Zod for validation, automatically checking both incoming and outgoing events.
 * This means it not only verifies data formats but also applies default values where needed and
 * ensures all conditions are met before and after processing.
 *
 * Error handling in the handler divides issues into two categories:
 *
 * - `Violations` are serious contract breaches that indicate fundamental problems with how services
 * are communicating. These errors bubble up to the calling code, allowing developers to handle
 * these critical issues explicitly.
 *
 * - `System Error Events` cover normal runtime errors that occur during event processing. These are
 * typically workflow-related issues that need to be reported back to the event's source but don't
 * indicate a broken contract.
 *
 * * @example
 * const handler = createArvoEventHandler({
 *   contract: userContract,
 *   executionunits: 1,
 *   handler: {
 *     '1.0.0': async ({ event }) => {
 *       // Process event according to contract v1.0.0
 *     },
 *     '2.0.0': async ({ event }) => {
 *       // Process event according to contract v2.0.0
 *     }
 *   }
 * });
 */
export default class ArvoEventHandler<TContract extends ArvoContract> extends AbstractArvoEventHandler {
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
   * Processes an incoming event according to the handler's contract specifications. This method
   * handles the complete lifecycle of event processing including validation, execution, and error
   * handling, while maintaining detailed telemetry through OpenTelemetry.
   *
   * The execution follows a careful sequence to ensure reliability:
   * First, it validates that the event matches the handler's contract type. Then it extracts
   * and validates the event's schema version, defaulting to the latest version if none is specified.
   * After validation passes, it executes the version-specific handler function and processes its
   * output into new events.
   *
   * The method handles routing through three distinct paths:
   * - For successful execution, events are routed based on handler output or configuration.
   *    - The 'to' field in the handler's result (if specified)
   *    - The 'redirectto' field from the source event (if present)
   *    - Falls back to the source event's 'source' field
   * - For violations (mismatched types, invalid data), errors bubble up to the caller
   * - For runtime errors, system error events are created and sent back to the source
   *
   * Throughout execution, comprehensive telemetry is maintained through OpenTelemetry spans,
   * tracking the complete event journey including validation steps, processing time, and any
   * errors that occur. This enables detailed monitoring and debugging of the event flow.
   *
   * @param event - The incoming event to process
   * @param opentelemetry - Configuration for OpenTelemetry context inheritance
   * @returns Promise resolving to an array of output events or error events
   * @throws `ContractViolation` when input or output event data violates the contract
   * @throws `ConfigViolation` when event type doesn't match contract type or the
   *                           contract version expected by the event does not exist
   *                           in handler configuration
   * @throws `ExecutionViolation` for explicitly handled runtime errors
   */
  public async execute(
    event: ArvoEvent,
    opentelemetry: ArvoEventHandlerOpenTelemetryOptions = {
      inheritFrom: 'EVENT',
    },
  ): Promise<ArvoEvent[]> {
    const otelConfig = createEventHandlerTelemetryConfig(
      `ArvoEventHandler<${this.contract.uri}>`,
      this.spanOptions,
      opentelemetry,
      event,
    );
    return await ArvoOpenTelemetry.getInstance().startActiveSpan({
      ...otelConfig,
      fn: async (span) => {
        const otelSpanHeaders = currentOpenTelemetryHeaders();
        try {
          span.setStatus({ code: SpanStatusCode.OK });
          for (const [key, value] of Object.entries(event.otelAttributes)) {
            span.setAttribute(`to_process.0.${key}`, value);
          }

          if (this.contract.type !== event.type) {
            throw new ConfigViolation(
              `Event type mismatch: Received '${event.type}', expected '${this.contract.type}'`,
            );
          }

          logToSpan({
            level: 'INFO',
            message: `Event type '${event.type}' validated against contract '${this.contract.uri}'`,
          });
          const parsedDataSchema = EventDataschemaUtil.parse(event);
          // If the URI exists but conflicts with the contract's URI
          // Here we are only concerned with the URI bit not the version
          if (parsedDataSchema?.uri && parsedDataSchema?.uri !== this.contract.uri) {
            throw new ContractViolation(
              `Contract URI mismatch: Handler expects '${this.contract.uri}' but event dataschema specifies '${event.dataschema}'. Events must reference the same contract URI as their handler.`,
            );
          }
          // If the version does not exist then just warn. The latest version will be used in this case
          if (!parsedDataSchema?.version) {
            logToSpan({
              level: 'WARNING',
              message: `Version resolution failed for event with dataschema '${event.dataschema}'. Defaulting to latest version (=${this.contract.version('latest').version}) of contract (uri=${this.contract.uri})`,
            });
          }

          let handlerContract: VersionedArvoContract<any, any>;
          try {
            handlerContract = this.contract.version(parsedDataSchema?.version ?? 'latest');
          } catch (error) {
            throw new ConfigViolation(
              `Invalid contract version: ${parsedDataSchema?.version}. Available versions: ${Object.keys(this.contract.versions).join(', ')}`,
            );
          }

          logToSpan({
            level: 'INFO',
            message: `Processing event with contract version ${handlerContract.version}`,
          });

          const inputEventValidation = handlerContract.accepts.schema.safeParse(event.data);
          if (inputEventValidation.error) {
            throw new ContractViolation(`Input event payload validation failed: ${inputEventValidation.error}`);
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
            (param, extensions) => {
              try {
                return eventFactory.emits(param, extensions);
              } catch (e) {
                throw new ContractViolation((e as Error).message);
              }
            },
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
          exceptionToSpan(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: `Event processing failed: ${(error as Error).message}`,
          });

          if ((error as ViolationError).name.includes('ViolationError')) {
            throw error;
          }

          const eventFactory = createArvoEventFactory(this.contract.version('latest'));
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
          for (const [key, value] of Object.entries(result.otelAttributes)) {
            span.setAttribute(`to_emit.0.${key}`, value);
          }
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
