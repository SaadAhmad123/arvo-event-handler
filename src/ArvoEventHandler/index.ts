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
import { resolveEventDomain } from '../ArvoDomain';

/**
 * `ArvoEventHandler` is the foundational component for building stateless,
 * contract-bound services in the Arvo system.
 *
 * It enforces strict contract validation, version-aware handler resolution,
 * and safe, observable event emission — all while maintaining type safety,
 * traceability, and support for multi-domain workflows.
 *
 * ## What It Does
 * - Ensures incoming events match the contract's `type` and `dataschema`
 * - Resolves the correct contract version using `dataschema`
 * - Validates input and output data via Zod schemas
 * - Executes the version-specific handler function
 * - Emits one or more response events based on the handler result
 * - Supports multi-domain broadcasting via `domain[]` on the emitted events
 * - Automatically emits system error events (`sys.*.error`) on failure
 * - Integrates deeply with OpenTelemetry for tracing and observability
 *
 * ## Error Boundaries
 * ArvoEventHandler enforces a clear separation between:
 *
 * - **Violations** — structural, schema, or config errors that break the contract.
 *   These are thrown and must be handled explicitly by the caller.
 *
 * - **System Errors** — runtime exceptions during execution that are caught and
 *   emitted as standardized `sys.<contract>.error` events.
 *
 * ## Domain Broadcasting
 * The handler supports multi-domain event distribution. When the handler
 * returns an event with a `domain` array, it is broadcast to one or more
 * routing contexts.
 *
 * ### System Error Domain Control
 * By default, system error events are broadcast into the source event’s domain,
 * the handler’s contract domain, and the `null` domain. This fallback ensures errors
 * are visible across all relevant contexts. Developers can override this behavior
 * using the optional `systemErrorDomain` field to specify an explicit set of
 * domain values, including symbolic constants from {@link ArvoDomain}.
 *
 * ### Supported Domain Values:
 * - A **concrete domain string** like `'audit.orders'` or `'human.review'`
 * - `null` to emit with no domain (standard internal flow)
 * - A **symbolic reference** from {@link ArvoDomain}
 *
 * ### Domain Resolution Rules:
 * - Each item in the `domain` array is resolved via {@link resolveEventDomain}
 * - Duplicate domains are deduplicated before emitting
 * - If `domain` is omitted entirely, Arvo defaults to `[null]`
 *
 * ### Example:
 * ```ts
 * return {
 *   type: 'evt.user.registered',
 *   data: { ... },
 *   domain: ['analytics', ArvoDomain.FROM_TRIGGERING_EVENT, null]
 * };
 * ```
 * This would emit at most 3 copies of the event, domained to:
 * - `'analytics'`
 * - the domain of the incoming event
 * - no domain (default)
 *
 * ### Domain Usage Guidance
 *
 * > **Avoid setting `contract.domain` unless fully intentional.**
 * 99% emitted event should default to `null` (standard processing pipeline).
 *
 * Contract-level domains enforce implicit routing for every emitted event
 * in that handler, making the behavior harder to override and debug.
 *
 * Prefer:
 * - Explicit per-event `domain` values in handler output
 * - Using `null` or symbolic constants to control domain cleanly
 *
 * ## When to Use Domains
 * Use domains when handling for specialized contexts:
 * - `'human.review'` → for human-in-the-loop steps
 * - `'analytics.workflow'` → to pipe events into observability systems
 * - `'external.partner.sync'` → to route to external services
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

  public readonly systemErrorDomain?: (string | null)[] = undefined;

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
    this.systemErrorDomain = param.systemErrorDomain;

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
      `Handler<${this.contract.uri}>`,
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
          } catch {
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
                resolveEventDomain({
                  domainToResolve: item,
                  handlerSelfContract: handlerContract,
                  eventContract: handlerContract,
                  triggeringEvent: event,
                }),
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
          for (const _dom of Array.from(
            new Set(
              this.systemErrorDomain
                ? this.systemErrorDomain.map((item) =>
                    resolveEventDomain({
                      domainToResolve: item,
                      handlerSelfContract: this.contract.version('latest'),
                      eventContract: this.contract.version('latest'),
                      triggeringEvent: event,
                    }),
                  )
                : [event.domain, this.domain, null],
            ),
          )) {
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
