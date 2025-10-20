import { type Span, SpanStatusCode } from '@opentelemetry/api';
import {
  type ArvoEvent,
  ArvoOrchestrationSubject,
  type ArvoOrchestrationSubjectContent,
  type ArvoOrchestratorContract,
  type ArvoSemanticVersion,
  type OpenTelemetryHeaders,
  type VersionedArvoContract,
  type ViolationError,
  createArvoError,
  createArvoOrchestratorEventFactory,
  exceptionToSpan,
  isViolationError,
  logToSpan,
} from 'arvo-core';
import { resolveEventDomain } from '../ArvoDomain';
import type { MachineMemoryRecord } from '../ArvoOrchestrator/types';
import type { ArvoResumableState } from '../ArvoResumable/types';
import type { SyncEventResource } from '../SyncEventResource';
import { ExecutionViolation } from '../errors';
import { isError } from '../utils';
import { isTransactionViolationError } from './error';
/**
 * Parameters for system error event creation
 */
export type CreateSystemErrorEventsParams = {
  error: unknown;
  event: ArvoEvent;
  otelHeaders: OpenTelemetryHeaders;
  orchestrationParentSubject: string | null;
  initEventId: string | null;
  selfContract: VersionedArvoContract<ArvoOrchestratorContract, ArvoSemanticVersion>;
  systemErrorDomain?: (string | null)[];
  executionunits: number;
  source: string;
  domain: string | null;
};

/**
 * Creates system error events
 */
export const createSystemErrorEvents = ({
  error,
  event,
  otelHeaders,
  orchestrationParentSubject,
  initEventId,
  selfContract,
  systemErrorDomain,
  executionunits,
  source,
  domain,
}: CreateSystemErrorEventsParams & { error: Error }): ArvoEvent[] => {
  // In case of none transaction errors like errors from
  // the machine or the event creation etc, the are workflow
  // error and shuold be handled by the workflow. Then are
  // called system error and must be sent
  // to the initiator. In as good of a format as possible
  let parsedEventSubject: ArvoOrchestrationSubjectContent | null = null;
  try {
    parsedEventSubject = ArvoOrchestrationSubject.parse(event.subject);
  } catch (e) {
    logToSpan({
      level: 'WARNING',
      message: `Unable to parse event subject: ${(e as Error).message}`,
    });
  }

  const domainSets = new Set(
    systemErrorDomain
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
    result.push(
      createArvoOrchestratorEventFactory(selfContract).systemError({
        source: source,
        // If the initiator of the workflow exist then match the
        // subject so that it can incorporate it in its state. If
        // parent does not exist then this is the root workflow so
        // use its own subject
        subject: orchestrationParentSubject ?? event.subject,
        // The system error must always go back to
        // the source which initiated it
        to: parsedEventSubject?.execution.initiator ?? event.source,
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

export const handleOrchestrationErrors = async (
  handlerType: string,
  param: CreateSystemErrorEventsParams & {
    syncEventResource: SyncEventResource<MachineMemoryRecord | ArvoResumableState<Record<string, any>>>;
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

  // A transaction violation means that there is something
  // wrong in the state persitance which inevitably means
  // state cannot be persisted
  if (!isTransactionViolationError(error)) {
    await param.syncEventResource
      .persistState(
        param.event,
        {
          executionStatus: 'failure',
          subject: param.event.subject,
          error: createArvoError(param.error as Error),
        } as MachineMemoryRecord | ArvoResumableState<Record<string, any>>,
        null,
        span,
      )
      .catch((e) => {
        logToSpan({
          level: 'CRITICAL',
          message: `Error in orchestrator persisting the failure state: ${e.message}`,
        });
      });
  }

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

  logToSpan({
    level: 'ERROR',
    message: `${handlerType || 'Arvo orchestration handler'} execution failed: ${error.message}`,
  });

  const errorEvents = createSystemErrorEvents({ ...param, error: error });

  for (const [errEvtIdx, errEvt] of Object.entries(errorEvents)) {
    for (const [key, value] of Object.entries(errEvt.otelAttributes)) {
      span.setAttribute(`to_emit.${errEvtIdx}.${key}`, value);
    }
  }

  return {
    errorToThrow: null,
    events: errorEvents,
  };
};
