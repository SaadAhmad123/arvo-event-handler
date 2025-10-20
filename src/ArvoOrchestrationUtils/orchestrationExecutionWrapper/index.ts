import { type Span, SpanKind, context } from '@opentelemetry/api';
import {
  type ArvoEvent,
  ArvoExecution,
  ArvoExecutionSpanKind,
  ArvoOpenTelemetry,
  type ArvoOrchestrationSubjectContent,
  type ArvoOrchestratorContract,
  type ArvoSemanticVersion,
  OpenInference,
  OpenInferenceSpanKind,
  type OpenTelemetryHeaders,
  type VersionedArvoContract,
  currentOpenTelemetryHeaders,
  logToSpan,
} from 'arvo-core';
import type IArvoEventHandler from '../../IArvoEventHandler';
import type { SyncEventResource } from '../../SyncEventResource';
import type { AcquiredLockStatusType } from '../../SyncEventResource/types';
import type { ArvoEventHandlerOpenTelemetryOptions } from '../../types';
import { handleOrchestrationErrors } from '../handlerErrors';
import type { OrchestrationExecutionMemoryRecord } from '../orchestrationExecutionState';
import type { ArvoOrchestrationHandlerType } from '../types';
import { acquireLockWithValidation } from './acquireLockWithValidation';
import { validateAndParseSubject } from './validateAndParseSubject';

export type OrchestrationExecutionContext<TState extends OrchestrationExecutionMemoryRecord<Record<string, any>>> = {
  event: ArvoEvent;
  opentelemetry: ArvoEventHandlerOpenTelemetryOptions;
  spanName: string;
  source: string;
  syncEventResource: SyncEventResource<TState>;
  executionunits: number;
  systemErrorDomain?: (string | null)[];
  selfContract: VersionedArvoContract<ArvoOrchestratorContract, ArvoSemanticVersion>;
  domain: string | null;
  _handlerType: ArvoOrchestrationHandlerType;
};

export type CoreExecutionFn<TState extends OrchestrationExecutionMemoryRecord<Record<string, any>>> = (params: {
  span: any;
  otelHeaders: OpenTelemetryHeaders;
  orchestrationParentSubject: string | null;
  initEventId: string;
  parsedEventSubject: ArvoOrchestrationSubjectContent;
  state: TState | null;
  _handlerType: ArvoOrchestrationHandlerType;
}) => Promise<{
  emittables: ArvoEvent[];
  newState: TState;
}>;

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
 * Wraps orchestration execution with common infrastructure:
 * - OpenTelemetry span management
 * - Lock acquisition and release
 * - State management
 * - Error handling and system error generation
 */
export const executeWithOrchestrationWrapper = async <
  TState extends OrchestrationExecutionMemoryRecord<Record<string, any>>,
>(
  {
    event,
    opentelemetry,
    spanName,
    source,
    syncEventResource,
    executionunits,
    systemErrorDomain,
    selfContract,
    domain,
    _handlerType,
  }: OrchestrationExecutionContext<TState>,
  coreExecutionFn: CoreExecutionFn<TState>,
): Promise<Awaited<ReturnType<IArvoEventHandler['execute']>>> => {
  return await ArvoOpenTelemetry.getInstance().startActiveSpan({
    name: spanName,
    spanOptions: {
      kind: SpanKind.PRODUCER,
      attributes: {
        [ArvoExecution.ATTR_SPAN_KIND]: ArvoExecutionSpanKind.ORCHESTRATOR,
        [OpenInference.ATTR_SPAN_KIND]: OpenInferenceSpanKind.CHAIN,
        ...Object.fromEntries(
          Object.entries(event.otelAttributes).map(([key, value]) => [`to_process.0.${key}`, value]),
        ),
      },
    },
    context:
      opentelemetry.inheritFrom === 'EVENT'
        ? {
            inheritFrom: 'TRACE_HEADERS',
            traceHeaders: {
              traceparent: event.traceparent,
              tracestate: event.tracestate,
            },
          }
        : {
            inheritFrom: 'CONTEXT',
            context: context.active(),
          },
    disableSpanManagement: true,
    fn: async (span) => {
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
          logToSpan(
            {
              level: 'WARNING',
              message: `The orchestration has failed in a previous event. Ignoring event id: ${event.id} with event subject: ${event.subject}`,
            },
            span,
          );
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

        span.setAttribute(`arvo.${_handlerType}.execution.status`, newState.executionStatus)

        // Add OpenTelemetry attributes for emitted events
        for (let i = 0; i < emittables.length; i++) {
          for (const [key, value] of Object.entries(emittables[i].otelAttributes)) {
            span.setAttribute(`to_emit.${i}.${key}`, value);
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
            domain: domain,
            syncEventResource: syncEventResource as any,
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
