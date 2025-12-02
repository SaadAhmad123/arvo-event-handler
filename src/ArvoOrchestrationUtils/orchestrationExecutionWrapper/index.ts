import { type Span, SpanStatusCode } from '@opentelemetry/api';
import {
  type ArvoEvent,
  ArvoOpenTelemetry,
  type ArvoOrchestrationSubjectContent,
  type ArvoOrchestratorContract,
  type ArvoSemanticVersion,
  type OpenTelemetryHeaders,
  type VersionedArvoContract,
  currentOpenTelemetryHeaders,
  logToSpan,
} from 'arvo-core';
import type IArvoEventHandler from '../../IArvoEventHandler';
import type { SyncEventResource } from '../../SyncEventResource';
import type { AcquiredLockStatusType } from '../../SyncEventResource/types';
import type { ArvoEventHandlerOpenTelemetryOptions, ArvoEventHandlerOtelSpanOptions, NonEmptyArray } from '../../types';
import { createEventHandlerTelemetryConfig } from '../../utils';
import { handleOrchestrationErrors } from '../handlerErrors';
import type { OrchestrationExecutionMemoryRecord } from '../orchestrationExecutionState';
import type { ArvoOrchestrationHandlerType } from '../types';
import { acquireLockWithValidation } from './acquireLockWithValidation';
import { validateAndParseSubject } from './validateAndParseSubject';

/**
 * Configuration context for orchestration execution.
 * Contains all resources and settings needed for the execution lifecycle.
 */
export type OrchestrationExecutionContext<TState extends OrchestrationExecutionMemoryRecord<Record<string, any>>> = {
  /** Event triggering the orchestration */
  event: ArvoEvent;
  /** OpenTelemetry configuration for tracing */
  opentelemetry: ArvoEventHandlerOpenTelemetryOptions;
  /** Source identifier for the orchestrator */
  source: string;
  /** Resource manager for state and lock operations */
  syncEventResource: SyncEventResource<TState>;
  /** Maximum execution units per cycle */
  executionunits: number;
  /** Optional domains for system error routing */
  systemErrorDomain: NonEmptyArray<string | null>;
  /** Self contract defining orchestrator interface */
  selfContract: VersionedArvoContract<ArvoOrchestratorContract, ArvoSemanticVersion>;
  /** Type of orchestration handler */
  _handlerType: ArvoOrchestrationHandlerType;
  /** OpenTelemetry span configuration */
  spanOptions: ArvoEventHandlerOtelSpanOptions & {
    spanName: NonNullable<ArvoEventHandlerOtelSpanOptions['spanName']>;
  };
};

/**
 * Core execution function signature for orchestration logic.
 * Receives prepared context and returns emitted events with new state.
 */
export type CoreExecutionFn<TState extends OrchestrationExecutionMemoryRecord<Record<string, any>>> = (params: {
  /** OpenTelemetry span for tracing */
  span: any;
  /** Current OpenTelemetry headers */
  otelHeaders: OpenTelemetryHeaders;
  /** Parent orchestration subject if nested */
  orchestrationParentSubject: string | null;
  /** ID of the initialization event */
  initEventId: string;
  /** Parsed event subject content */
  parsedEventSubject: ArvoOrchestrationSubjectContent;
  /** Current persisted state or null for new orchestrations */
  state: TState | null;
  /** Type of handler executing */
  _handlerType: ArvoOrchestrationHandlerType;
}) => Promise<{
  /** Events to emit from this execution */
  emittables: ArvoEvent[];
  /** New state to persist */
  newState: TState;
}>;

/**
 * Helper to log and return execution results.
 * @returns The same result after logging
 */
export const returnEventsWithLogging = (
  param: Awaited<ReturnType<IArvoEventHandler['execute']>>,
  span: Span,
): Awaited<ReturnType<IArvoEventHandler['execute']>> => {
  logToSpan(
    {
      level: 'INFO',
      message: `Execution completed with issues and emitted ${param.events?.length ?? 0} events`,
    },
    span,
  );
  return param;
};

/**
 * Wraps orchestration execution with infrastructure concerns.
 *
 * Provides a complete execution wrapper that handles:
 * - OpenTelemetry span creation and management
 * - Event subject validation and parsing
 * - Lock acquisition for concurrent safety
 * - State retrieval and persistence
 * - Error handling with system error event generation
 * - Lock release in all scenarios
 *
 * This wrapper ensures consistent behavior across all orchestration handlers
 * while allowing custom core logic via the execution function parameter.
 * @returns Emitted events from successful execution or error handling
 */
export const executeWithOrchestrationWrapper = async <
  TState extends OrchestrationExecutionMemoryRecord<Record<string, any>>,
>(
  {
    event,
    opentelemetry,
    spanOptions,
    source,
    syncEventResource,
    executionunits,
    systemErrorDomain,
    selfContract,
    _handlerType,
  }: OrchestrationExecutionContext<TState>,
  coreExecutionFn: CoreExecutionFn<TState>,
): Promise<Awaited<ReturnType<IArvoEventHandler['execute']>>> => {
  const otelConfig = createEventHandlerTelemetryConfig(
    spanOptions.spanName({ selfContractUri: selfContract.uri, consumedEvent: event }),
    spanOptions,
    opentelemetry,
    event,
  );
  return await ArvoOpenTelemetry.getInstance().startActiveSpan({
    ...otelConfig,
    fn: async (span) => {
      span.setStatus({ code: SpanStatusCode.OK });
      span.setAttribute('arvo.handler.execution.type', _handlerType);
      span.setAttribute('arvo.handler.execution.status', 'normal');
      for (const [key, value] of Object.entries(event.otelAttributes)) {
        span.setAttribute(`consumable.0.${key}`, value);
      }
      logToSpan(
        {
          level: 'INFO',
          message: `Starting execution for ${event.type} on subject ${event.subject}`,
        },
        span,
      );

      const otelHeaders = currentOpenTelemetryHeaders();
      let orchestrationParentSubject: string | null = null;
      let initEventId: string | null = null;
      let acquiredLock: AcquiredLockStatusType | null = null;

      try {
        // Subject validation and parsing
        const parsedEventSubject = validateAndParseSubject(event, source, syncEventResource, span, 'orchestrator');

        if (!parsedEventSubject) {
          return returnEventsWithLogging({ events: [] }, span);
        }

        // Lock acquisition
        acquiredLock = await acquireLockWithValidation(syncEventResource, event, span);

        // State acquisition
        const state = await syncEventResource.acquireState(event, span);

        if (state?.executionStatus === 'failure') {
          span.setAttribute('arvo.handler.execution.status', state.executionStatus);
          logToSpan(
            {
              level: 'WARNING',
              message: `The orchestration has failed in a previous event. Ignoring event id: ${event.id} with event subject: ${event.subject}`,
            },
            span,
          );
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: `The orchestration has failed in a previous event. Ignoring event id: ${event.id} with event subject: ${event.subject}`,
          });
          return returnEventsWithLogging({ events: [] }, span);
        }

        orchestrationParentSubject = state?.parentSubject ?? null;
        initEventId = state?.initEventId ?? null;

        if (!state) {
          logToSpan({
            level: 'INFO',
            message: `Initializing new execution state for subject: ${event.subject}`,
          });

          if (event.type !== source) {
            logToSpan({
              level: 'WARNING',
              message: `Invalid initialization event detected. Expected type '${source}' but received '${event.type}'.`,
            });
            return returnEventsWithLogging({ events: [] }, span);
          }
        } else {
          logToSpan({
            level: 'INFO',
            message: `Resuming execution with existing state for subject: ${event.subject}`,
          });
        }

        // Extract parent subject from init event if applicable
        if (event.type === source) {
          orchestrationParentSubject = event?.data?.parentSubject$$ ?? null;
        }

        // Execute core orchestration logic
        const { emittables, newState } = await coreExecutionFn({
          span,
          otelHeaders,
          orchestrationParentSubject,
          initEventId: initEventId ?? event.id,
          parsedEventSubject,
          state,
          _handlerType,
        });

        // Add OpenTelemetry attributes for emitted events
        for (let i = 0; i < emittables.length; i++) {
          for (const [key, value] of Object.entries(emittables[i].otelAttributes)) {
            span.setAttribute(`emittables.${i}.${key}`, value);
          }
        }

        // Persist state
        await syncEventResource.persistState(event, newState, state, span);

        logToSpan({
          level: 'INFO',
          message: `State update persisted in memory for subject ${event.subject}`,
        });

        logToSpan({
          level: 'INFO',
          message: `Execution successfully completed and emitted ${emittables.length} events`,
        });

        return returnEventsWithLogging({ events: emittables }, span);
      } catch (error: unknown) {
        span.setAttribute('arvo.handler.execution.status', 'failure');
        const { errorToThrow, events: errorEvents } = await handleOrchestrationErrors(
          _handlerType,
          {
            error,
            event,
            otelHeaders,
            orchestrationParentSubject,
            initEventId,
            selfContract: selfContract,
            systemErrorDomain: systemErrorDomain,
            executionunits: executionunits,
            source: source,
            syncEventResource: syncEventResource as any,
            handlerType: _handlerType,
          },
          span,
        );
        if (errorToThrow) throw errorToThrow;
        return {
          events: errorEvents,
        };
      } finally {
        await syncEventResource.releaseLock(event, acquiredLock, span);
        span.end();
      }
    },
  });
};
