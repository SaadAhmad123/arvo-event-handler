import { type Span, SpanStatusCode } from '@opentelemetry/api';
import {
  type ArvoContract,
  type ArvoEvent,
  ArvoOrchestrationSubject,
  type ArvoOrchestrationSubjectContent,
  type ArvoSemanticVersion,
  type OpenTelemetryHeaders,
  type VersionedArvoContract,
  type ViolationError,
  createArvoEventFactory,
  createArvoOrchestratorEventFactory,
  exceptionToSpan,
  isViolationError,
  logToSpan,
} from 'arvo-core';
import { resolveEventDomain } from '../ArvoDomain';
import type { SyncEventResource } from '../SyncEventResource';
import { ExecutionViolation } from '../errors';
import { isError } from '../utils';
import type { OrchestrationExecutionMemoryRecord } from './orchestrationExecutionState';
import { ArvoOrchestrationHandlerMap, type ArvoOrchestrationHandlerType } from './types';

/**
 * Parameters for creating system error events during orchestration failures.
 */
export type CreateSystemErrorEventsParams = {
  /** The error that occurred */
  error: unknown;
  /** Event that triggered the error */
  event: ArvoEvent;
  /** OpenTelemetry headers for tracing */
  otelHeaders: OpenTelemetryHeaders;
  /** Parent orchestration subject if nested */
  orchestrationParentSubject: string | null;
  /** ID of the initiating event */
  initEventId: string | null;
  /** Self contract defining error schema */
  selfContract: VersionedArvoContract<ArvoContract, ArvoSemanticVersion>;
  /** Optional domains for error event routing */
  systemErrorDomain?: (string | null)[];
  /** Execution units for error events */
  executionunits: number;
  /** Source identifier */
  source: string;
  /** Domain for error events */
  domain: string | null;
  /** Type of handler reporting the error */
  handlerType: ArvoOrchestrationHandlerType;
};

/**
 * Creates standardized system error events for orchestration failures.
 * 
 * Generates error events that route back to the workflow initiator, preserving
 * tracing context and orchestration hierarchy. Supports multiple domains for
 * error distribution.
 *
 * @param params - Error event creation parameters
 * @returns Array of system error events for each configured domain
 */
export const createSystemErrorEvents = ({
  error,
  event,
  otelHeaders,
  orchestrationParentSubject: _orchestrationParentSubject,
  initEventId,
  selfContract,
  systemErrorDomain,
  executionunits,
  source,
  domain,
  handlerType,
}: CreateSystemErrorEventsParams & { error: Error }): ArvoEvent[] => {
  // In case of none transaction errors like errors from
  // the machine or the event creation etc, the are workflow
  // error and shuold be handled by the workflow. Then are
  // called system error and must be sent
  // to the initiator. In as good of a format as possible
  let parsedEventSubject: ArvoOrchestrationSubjectContent | null = null;
  let orchestrationParentSubject: string | null = null;

  if (handlerType === 'orchestrator' || handlerType === 'resumable') {
    orchestrationParentSubject = _orchestrationParentSubject;
    try {
      parsedEventSubject = ArvoOrchestrationSubject.parse(event.subject);
    } catch (e) {
      logToSpan({
        level: 'WARNING',
        message: `Unable to parse event subject: ${(e as Error).message}`,
      });
    }
  }

  const domainSets = new Set(
    systemErrorDomain?.length
      ? systemErrorDomain.map((item) =>
          resolveEventDomain({
            domainToResolve: item,
            handlerSelfContract: selfContract,
            eventContract: selfContract,
            triggeringEvent: event,
          }),
        )
      : [event.domain, domain, null],
  );
  const result: ArvoEvent[] = [];

  for (const _dom of Array.from(domainSets)) {
    const factoryBuilder = handlerType === 'handler' ? createArvoEventFactory : createArvoOrchestratorEventFactory;
    result.push(
      factoryBuilder(selfContract).systemError({
        source: source,
        // If the initiator of the workflow exist then match the
        // subject so that it can incorporate it in its state. If
        // parent does not exist then this is the root workflow so
        // use its own subject
        subject: orchestrationParentSubject ?? event.subject,
        // The system error must always go back to
        // the source which initiated it
        to: parsedEventSubject?.execution?.initiator ?? event.source,
        error: error,
        traceparent: otelHeaders.traceparent ?? undefined,
        tracestate: otelHeaders.tracestate ?? undefined,
        accesscontrol: event.accesscontrol ?? undefined,
        executionunits: executionunits,
        // If there is initEventID then use that.
        // Otherwise, use event id. If the error is in init event
        // then it will be the same as initEventId. Otherwise,
        // we still would know what cause this error
        parentid: initEventId ?? event.id,
        domain: _dom,
      }),
    );
  }
  return result;
};

/**
 * Handles errors during orchestration execution with proper state management.
 * 
 * Processes errors by determining if they are violations (retriable) or execution
 * errors (terminal). For execution errors, persists failure state and generates
 * system error events. For violations, returns the error to be thrown without
 * state persistence.
 *
 * @returns Either the violation error to throw or system error events to emit
 */
export const handleOrchestrationErrors = async (
  _handlerType: ArvoOrchestrationHandlerType,
  param: CreateSystemErrorEventsParams & {
    syncEventResource: SyncEventResource<OrchestrationExecutionMemoryRecord<Record<string, any>>>;
  },
  span: Span,
): Promise<
  | {
      errorToThrow: ViolationError;
      events: null;
    }
  | {
      errorToThrow: null;
      events: ArvoEvent[];
    }
> => {
  const handlerType = ArvoOrchestrationHandlerMap[_handlerType];
  // If this is not an error this is not exected and must be addressed
  // This is a fundmental unexpected scenario and must be handled as such
  // What this show is the there is a non-error object being throw in the
  // implementation or execution of the machine which is a major NodeJS
  // violation
  const error: Error = isError(param.error)
    ? param.error
    : new ExecutionViolation(
        `Non-Error object thrown during machine execution: ${typeof param.error}. This indicates a serious implementation flaw.`,
      );

  exceptionToSpan(error, span);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error.message,
  });

  // Don't persist state on a violation
  //
  // A violation means that there is something
  // wrong in the state persitance or it is a
  // error which will be handled outside the
  // Arvo mechanism. So, it makes sense that it
  // does not impact the state. The violations
  // can be used to trigger retries as well
  if (isViolationError(error)) {
    logToSpan({
      level: 'CRITICAL',
      message: `${handlerType || 'Arvo orchestration handler'} violation error: ${error.message}`,
    });
    return {
      errorToThrow: error as ViolationError,
      events: null,
    };
  }

  await param.syncEventResource
    .persistState(
      param.event,
      {
        executionStatus: 'failure',
        subject: param.event.subject,
        error: param.error as Error,
      },
      null,
      span,
    )
    .catch((e) => {
      logToSpan({
        level: 'CRITICAL',
        message: `Error in orchestrator persisting the failure state: ${e.message}`,
      });
    });

  logToSpan({
    level: 'ERROR',
    message: `${handlerType || 'Arvo orchestration handler'} execution failed: ${error.message}`,
  });

  const errorEvents = createSystemErrorEvents({ ...param, error: error });

  for (const [errEvtIdx, errEvt] of Object.entries(errorEvents)) {
    for (const [key, value] of Object.entries(errEvt.otelAttributes)) {
      span.setAttribute(`emittables.${errEvtIdx}.${key}`, value);
    }
  }

  return {
    errorToThrow: null,
    events: errorEvents,
  };
};
