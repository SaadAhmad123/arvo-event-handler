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
import { coalesce, coalesceOrDefault, createEventHandlerTelemetryConfig } from '../utils';
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
 * ## Event Processing Lifecycle
 *
 * 1. **Type Validation**: Ensures the incoming event type matches the handler's contract
 * 2. **Contract Resolution**: Extracts version from dataschema and resolves appropriate contract version
 * 3. **Schema Validation**: Validates event data against the contract's accepts schema
 * 4. **Handler Execution**: Invokes the version-specific handler implementation
 * 5. **Response Processing**: Validates and structures handler output into events
 * 6. **Domain Broadcasting**: Creates multiple events for multi-domain distribution if specified
 * 7. **Routing Configuration**: Applies routing logic based on handler output and event context
 * 8. **Telemetry Integration**: Records processing metrics and tracing information
 *
 * ## Error Handling Strategy
 *
 * The handler divides issues into two distinct categories:
 *
 * - **Violations** are serious contract breaches that indicate fundamental problems with how services
 *   are communicating. These errors bubble up to the calling code, allowing developers to handle
 *   these critical issues explicitly. Violations include contract mismatches, schema validation
 *   failures, and configuration errors.
 *
 * - **System Error Events** cover normal runtime errors that occur during event processing. These are
 *   typically workflow-related issues that need to be reported back to the event's source but don't
 *   indicate a broken contract. System errors are converted to structured error events and returned
 *   in the response. **Multi-domain error broadcasting** ensures error events reach all relevant
 *   processing contexts (source event domain, handler contract domain, and null domain).
 *
 * ## Multi-Domain Event Broadcasting
 *
 * The handler supports sophisticated multi-domain event distribution through array-based domain specification:
 *
 * ### Domain Assignment Rules:
 * 1. **Array Processing**: Each element in the `domain` array creates a separate ArvoEvent
 * 2. **Undefined Resolution**: `undefined` elements resolve to: `event.domain ?? handler.contract.domain ?? null`
 * 3. **Automatic Deduplication**: Duplicate domains are removed to prevent redundant events
 * 4. **Default Behavior**: Omitted/undefined `domain` field defaults to `[null]` (single event, no domain)
 *
 * ### Domain Patterns:
 * - `domain: ['domain1', 'domain2']` → Creates 2 events: one for each domain
 * - `domain: ['analytics', undefined, null]` → Creates up to 3 events:
 *   - Event with `domain: 'analytics'`
 *   - Event with `domain: event.domain ?? handler.contract.domain ?? null`
 *   - Event with `domain: null`
 * - `domain: [null]` → Single event with explicit no-domain routing
 * - `domain: undefined` (or omitted) → Single event with `domain: null`
 *
 * ### Error Broadcasting:
 * System errors are automatically broadcast to all relevant processing contexts:
 * - Source event domain (`event.domain`)
 * - Handler contract domain (`handler.contract.domain`)
 * - No-domain context (`null`)
 *
 * Duplicates are automatically removed, so if `event.domain === handler.contract.domain`,
 * only two error events are created instead of three.
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
   * The contract-defined domain for this handler, used as the default domain for emitted events.
   * Can be overridden by individual handler implementations for cross-domain workflows.
   * Returns null if no domain is specified, indicating standard processing context.
   */
  public get domain(): string | null {
    return this.contract.domain;
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
   * handles the complete lifecycle of event processing including validation, execution, error
   * handling, and multi-domain event broadcasting, while maintaining detailed telemetry through OpenTelemetry.
   *
   * @param event - The incoming event to process
   * @param opentelemetry - Configuration for OpenTelemetry context inheritance, defaults to inheriting from the event
   * @returns Promise resolving to a structured result containing an array of output events
   * @returns Structured response containing:
   *   - `events`: Array of events to be emitted (may contain multiple events per handler output due to domain broadcasting)
   *
   * @throws {ContractViolation} when input or output event data violates the contract schema,
   *                             or when event emission fails due to invalid data
   * @throws {ConfigViolation} when event type doesn't match contract type, when the
   *                           contract version expected by the event does not exist
   *                           in handler configuration, or when contract URI mismatch occurs
   * @throws {ExecutionViolation} for explicitly handled runtime errors that should bubble up
   */
  public async execute(
    event: ArvoEvent,
    opentelemetry: ArvoEventHandlerOpenTelemetryOptions = {
      inheritFrom: 'EVENT',
    },
  ): Promise<{
    events: ArvoEvent[];
  }> {
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
            event: event.toJSON(),
            source: this.source,
            contract: handlerContract,
            domain: {
              self: this.domain,
              event: event.domain,
            },
            span: span,
          });

          if (!_handleOutput)
            return {
              events: [],
            };

          let outputs: ArvoEventHandlerFunctionOutput<
            VersionedArvoContract<TContract, typeof handlerContract.version>
          >[] = [];
          if (Array.isArray(_handleOutput)) {
            outputs = _handleOutput;
          } else {
            outputs = [_handleOutput];
          }

          const result: ArvoEvent[] = [];
          for (const item of outputs) {
            try {
              const { __extensions, ...handlerResult } = item;
              const domains = handlerResult.domain?.map((item) =>
                item === undefined ? (event.domain ?? this.domain ?? null) : item,
              ) ?? [null];
              for (const _dom of Array.from(new Set(domains))) {
                result.push(
                  createArvoEventFactory(handlerContract).emits(
                    {
                      ...handlerResult,
                      traceparent: otelSpanHeaders.traceparent || undefined,
                      tracestate: otelSpanHeaders.tracestate || undefined,
                      source: this.source,
                      subject: event.subject,
                      // 'source'
                      // prioritise returned 'to', 'redirectto' and then
                      to: coalesceOrDefault([handlerResult.to, event.redirectto], event.source),
                      executionunits: coalesce(handlerResult.executionunits, this.executionunits),
                      accesscontrol: handlerResult.accesscontrol ?? event.accesscontrol ?? undefined,
                      parentid: event.id,
                      domain: _dom,
                    },
                    __extensions,
                  ),
                );
                for (const [key, value] of Object.entries(result[result.length - 1].otelAttributes)) {
                  span.setAttribute(`to_emit.${result.length - 1}.${key}`, value);
                }
              }
            } catch (e) {
              throw new ContractViolation((e as Error)?.message ?? 'Invalid data');
            }
          }

          logToSpan({
            level: 'INFO',
            message: `Event processing completed successfully. Generated ${result.length} event(s)`,
          });

          logToSpan({
            level: 'INFO',
            message: 'Event handled successfully',
          });

          return {
            events: result,
          };
        } catch (error) {
          exceptionToSpan(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: `Event processing failed: ${(error as Error).message}`,
          });

          if ((error as ViolationError).name.includes('ViolationError')) {
            throw error;
          }

          const result: ArvoEvent[] = [];
          for (const _dom of Array.from(new Set([event.domain, this.domain, null]))) {
            result.push(
              createArvoEventFactory(this.contract.version('latest')).systemError({
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
                parentid: event.id ?? undefined,
                domain: _dom,
              }),
            );
            for (const [key, value] of Object.entries(result[result.length - 1].otelAttributes)) {
              span.setAttribute(`to_emit.${result.length - 1}.${key}`, value);
            }
          }

          return {
            events: result,
          };
        } finally {
          span.end();
        }
      },
    });
  }

  /**
   * Provides access to the system error event schema configuration.
   *
   * The schema defines the structure of error events emitted during execution failures.
   * These events are automatically generated when runtime errors occur and follow a
   * standardized format for consistent error handling across the system.
   *
   * Error events follow the naming convention: `sys.<contract-type>.error`
   *
   * @example
   * For a contract handling 'com.user.create' events, system error events
   * will have the type 'sys.com.user.create.error'
   *
   * @returns The error event schema containing type and validation rules
   */
  public get systemErrorSchema() {
    return this.contract.systemError;
  }
}
