import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
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
  createArvoEventFactory,
  currentOpenTelemetryHeaders,
  exceptionToSpan,
  isViolationError,
  logToSpan,
} from 'arvo-core';
import { ArvoDomain, resolveEventDomain } from '../ArvoDomain';
import { createSystemErrorEvents } from '../ArvoOrchestrationUtils/handlerErrors';
import { returnEventsWithLogging } from '../ArvoOrchestrationUtils/orchestrationExecutionWrapper';
import type IArvoEventHandler from '../IArvoEventHandler';
import { ConfigViolation, ContractViolation } from '../errors';
import type { ArvoEventHandlerOpenTelemetryOptions, ArvoEventHandlerOtelSpanOptions } from '../types';
import { coalesce, coalesceOrDefault, createEventHandlerTelemetryConfig } from '../utils';
import type { ArvoEventHandlerFunction, ArvoEventHandlerFunctionOutput, ArvoEventHandlerParam } from './types';

/**
 * The foundational component for building stateless,
 * contract-bound services in the Arvo system.
 */
export default class ArvoEventHandler<TContract extends ArvoContract> implements IArvoEventHandler {
  /** Contract instance that defines the event schema and validation rules */
  readonly contract: TContract;

  /** Computational cost metric associated with event handling operations */
  readonly executionunits: number;

  /** OpenTelemetry configuration for event handling spans */
  readonly spanOptions: ArvoEventHandlerOtelSpanOptions;

  /** Version-specific event handler implementation map */
  readonly handler: ArvoEventHandlerFunction<TContract>;

  /** The source identifier for events produced by this handler */
  get source(): TContract['type'] {
    return this.contract.type;
  }

  /** Domains for routing events */
  readonly defaultEventEmissionDomains: Required<
    NonNullable<ArvoEventHandlerParam<TContract>['defaultEventEmissionDomains']>
  >;

  /** The contract-defined domain for the handler */
  get domain(): string | null {
    return this.contract.domain;
  }

  constructor(param: ArvoEventHandlerParam<TContract>) {
    this.contract = param.contract;
    this.executionunits = param.executionunits;
    this.handler = param.handler;
    this.defaultEventEmissionDomains = {
      systemError: [ArvoDomain.ORCHESTRATION_CONTEXT],
      emits: [ArvoDomain.ORCHESTRATION_CONTEXT],
      ...(param.defaultEventEmissionDomains ?? {}),
    };

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
   * @throws {ContractViolation} when input or output event data violates the contract schema,
   *                             or when event emission fails due to invalid data
   * @throws {ConfigViolation} when event type doesn't match contract type, when the
   *                           contract version expected by the event does not exist
   *                           in handler configuration, or when contract URI mismatch occurs
   * @throws {ExecutionViolation} for explicitly handled runtime errors that should bubble up
   */
  async execute(
    event: ArvoEvent,
    opentelemetry?: ArvoEventHandlerOpenTelemetryOptions,
  ): Promise<{
    events: ArvoEvent[];
  }> {
    const otelConfig = createEventHandlerTelemetryConfig(
      this.spanOptions.spanName?.({ selfContractUri: this.contract.uri, consumedEvent: event }) ||
        `Handler<${this.contract.uri}>`,
      this.spanOptions,
      opentelemetry ?? { inheritFrom: 'EVENT' },
      event,
    );
    return await ArvoOpenTelemetry.getInstance().startActiveSpan({
      ...otelConfig,
      fn: async (span) => {
        const otelSpanHeaders = currentOpenTelemetryHeaders();
        try {
          span.setAttribute('arvo.handler.execution.status', 'normal');
          span.setAttribute('arvo.handler.execution.type', 'handler');
          span.setStatus({ code: SpanStatusCode.OK });
          for (const [key, value] of Object.entries(event.otelAttributes)) {
            span.setAttribute(`consumable.0.${key}`, value);
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
            spanHeaders: otelSpanHeaders,
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
              const domains = (handlerResult.domain ?? this.defaultEventEmissionDomains.emits).map((item) =>
                resolveEventDomain({
                  parentSubject: null,
                  currentSubject: event.subject,
                  domainToResolve: item,
                  handlerSelfContract: handlerContract,
                  eventContract: handlerContract,
                  triggeringEvent: event,
                }),
              );
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
                  span.setAttribute(`emittables.${result.length - 1}.${key}`, value);
                }
              }
            } catch (e) {
              throw new ContractViolation((e as Error)?.message ?? 'Invalid data');
            }
          }
          return returnEventsWithLogging({ events: result }, span);
        } catch (error) {
          span.setAttribute('arvo.handler.execution.status', 'failure');
          exceptionToSpan(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: `Event processing failed: ${(error as Error).message}`,
          });

          if (isViolationError(error)) {
            throw error;
          }

          const errorEvents = createSystemErrorEvents({
            error: error as Error,
            event,
            otelHeaders: otelSpanHeaders,
            orchestrationParentSubject: null,
            initEventId: event.id,
            selfContract: this.contract.version('any'),
            systemErrorDomain: this.defaultEventEmissionDomains.systemError,
            executionunits: this.executionunits,
            source: this.source,
            handlerType: 'handler',
          });

          for (const [errEvtIdx, errEvt] of Object.entries(errorEvents)) {
            for (const [key, value] of Object.entries(errEvt.otelAttributes)) {
              span.setAttribute(`emittables.${errEvtIdx}.${key}`, value);
            }
          }

          return returnEventsWithLogging(
            {
              events: errorEvents,
            },
            span,
          );
        } finally {
          span.end();
        }
      },
    });
  }

  /**
   * Provides access to the system error event schema configuration.
   */
  get systemErrorSchema() {
    return this.contract.systemError;
  }
}
