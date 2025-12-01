import type { Span } from '@opentelemetry/api';
import {
  type ArvoContract,
  type ArvoEvent,
  ArvoOrchestrationSubject,
  type ArvoOrchestratorContract,
  type ArvoSemanticVersion,
  EventDataschemaUtil,
  type OpenTelemetryHeaders,
  type VersionedArvoContract,
  createArvoEvent,
  logToSpan,
} from 'arvo-core';
import type z from 'zod';
import { ArvoDomain, resolveEventDomain } from '../ArvoDomain';
import type { EnqueueArvoEventActionParam } from '../ArvoMachine/types';
import { ContractViolation, ExecutionViolation } from '../errors';

/**
 * Parameters for creating an emittable event from raw event data.
 */
export type CreateEmittableEventParams = {
  /** Raw event parameters from machine execution */
  event: EnqueueArvoEventActionParam;
  /** OpenTelemetry headers for distributed tracing */
  otelHeaders: OpenTelemetryHeaders;
  /** Parent orchestration subject for nested workflows */
  orchestrationParentSubject: string | null;
  /** Event that triggered this emission */
  sourceEvent: ArvoEvent;
  /** Self contract for orchestrator validation */
  selfContract: VersionedArvoContract<ArvoOrchestratorContract, ArvoSemanticVersion>;
  /** Service contracts for external event validation */
  serviceContracts: Record<string, VersionedArvoContract<any, any>>;
  /** ID of the workflow initialization event */
  initEventId: string;
  /** Domain for event routing */
  domain: string | null;
  /** Execution units to assign to event */
  executionunits: number;
  /** Source identifier for the orchestrator */
  source: string;
};

/**
 * Creates a fully-formed emittable event from raw event parameters.
 *
 * Transforms machine-emitted event data into valid Arvo events by:
 * - Validating against appropriate contracts (self or service)
 * - Resolving domains for routing
 * - Generating proper subjects for orchestration events
 * - Adding tracing context and metadata
 *
 * Handles three event types differently:
 * 1. Completion events - routed to workflow initiator with parent subject
 * 2. Service orchestrator events - creates/extends orchestration subjects
 * 3. Regular service events - standard external service calls
 *
 * @returns Fully-formed Arvo event ready for emission
 * @throws {ContractViolation} When event data fails schema validation
 * @throws {ExecutionViolation} When orchestration subject creation fails
 */
export const createEmittableEvent = (
  {
    event,
    otelHeaders,
    orchestrationParentSubject,
    sourceEvent,
    selfContract,
    serviceContracts,
    initEventId,
    domain: _domain,
    executionunits,
    source,
  }: CreateEmittableEventParams,
  span: Span,
): ArvoEvent => {
  logToSpan(
    {
      level: 'INFO',
      message: `Creating emittable event: ${event.type}`,
    },
    span,
  );

  const serviceContractMap: Record<
    string,
    VersionedArvoContract<ArvoContract, ArvoSemanticVersion>
  > = Object.fromEntries(
    (Object.values(serviceContracts) as VersionedArvoContract<ArvoContract, ArvoSemanticVersion>[]).map((item) => [
      item.accepts.type,
      item,
    ]),
  );

  let schema: z.ZodTypeAny | null = null;
  let contract: VersionedArvoContract<any, any> | null = null;
  let subject: string = sourceEvent.subject;
  let parentId: string = sourceEvent.id;
  const subjectForDomainResolution = sourceEvent.subject;
  let domain = resolveEventDomain({
    currentSubject: subjectForDomainResolution,
    domainToResolve: _domain,
    handlerSelfContract: selfContract,
    eventContract: null,
    triggeringEvent: sourceEvent,
  });

  if (event.type === selfContract.metadata.completeEventType) {
    logToSpan(
      {
        level: 'INFO',
        message: `Creating event for workflow completion: ${event.type}`,
      },
      span,
    );
    contract = selfContract;
    schema = selfContract.emits[selfContract.metadata.completeEventType];
    subject = orchestrationParentSubject ?? sourceEvent.subject;
    parentId = initEventId;
    domain = resolveEventDomain({
      currentSubject: subjectForDomainResolution,
      domainToResolve: _domain,
      handlerSelfContract: selfContract,
      eventContract: selfContract,
      triggeringEvent: sourceEvent,
    });
  } else if (serviceContractMap[event.type]) {
    logToSpan(
      {
        level: 'INFO',
        message: `Creating service event for external system: ${event.type}`,
      },
      span,
    );
    contract = serviceContractMap[event.type];
    schema = serviceContractMap[event.type].accepts.schema;
    domain = resolveEventDomain({
      currentSubject: subjectForDomainResolution,
      domainToResolve: _domain,
      handlerSelfContract: selfContract,
      eventContract: contract,
      triggeringEvent: sourceEvent,
    });

    if ((contract as any).metadata.contractType === 'ArvoOrchestratorContract') {
      if (event.data.parentSubject$$) {
        try {
          ArvoOrchestrationSubject.parse(event.data.parentSubject$$);
        } catch {
          throw new ExecutionViolation(
            `[Emittable Event Creation] Invalid parentSubject$$ for the event(type='${event.type}', uri='${event.dataschema ?? EventDataschemaUtil.create(contract)}'). It must be follow the ArvoOrchestrationSubject schema. The easiest way is to use the current orchestration subject by storing the subject via the context block in the machine definition.`,
          );
        }
      }

      try {
        if (event.data.parentSubject$$) {
          subject = ArvoOrchestrationSubject.from({
            orchestator: contract.accepts.type,
            version: contract.version,
            subject: event.data.parentSubject$$,
            domain: domain ?? null,
            meta: {
              redirectto: event.redirectto ?? source,
            },
          });
        } else {
          subject = ArvoOrchestrationSubject.new({
            version: contract.version,
            orchestator: contract.accepts.type,
            initiator: source,
            domain: domain ?? undefined,
            meta: {
              redirectto: event.redirectto ?? source,
            },
          });
        }
      } catch (error) {
        throw new ExecutionViolation(
          `[Emittable Event Creation] Orchestration subject creation failed due to invalid parameters - Event: ${event.type} - ${(error as Error)?.message}`,
        );
      }
    }
  }

  let finalDataschema: string | undefined = event.dataschema;
  let finalData: any = event.data;

  if (contract && schema) {
    try {
      finalData = schema.parse(event.data);
      finalDataschema = EventDataschemaUtil.create(contract);
    } catch (error) {
      throw new ContractViolation(
        `[Emittable Event Creation] Invalid event data: Schema validation failed.\nEvent type: ${event.type}\nDetails: ${(error as Error).message}`,
      );
    }
  }

  const emittableEvent = createArvoEvent(
    {
      id: event.id,
      source: source,
      type: event.type,
      subject: subject,
      dataschema: finalDataschema ?? undefined,
      data: finalData,
      to: event.to ?? event.type,
      accesscontrol: event.accesscontrol ?? sourceEvent.accesscontrol ?? undefined,
      redirectto: event.redirectto ?? source,
      executionunits: event.executionunits ?? executionunits,
      traceparent: otelHeaders.traceparent ?? undefined,
      tracestate: otelHeaders.tracestate ?? undefined,
      parentid: parentId,
      domain: domain ?? undefined,
    },
    event.__extensions ?? {},
  );

  logToSpan(
    {
      level: 'INFO',
      message: `Event created successfully: ${emittableEvent.type}`,
    },
    span,
  );

  return emittableEvent;
};

/**
 * Processes raw events into emittable events with domain resolution
 */
export const processRawEventsIntoEmittables = (
  params: {
    rawEvents: EnqueueArvoEventActionParam[];
    otelHeaders: OpenTelemetryHeaders;
    orchestrationParentSubject: string | null;
    sourceEvent: ArvoEvent;
    selfContract: VersionedArvoContract<ArvoOrchestratorContract, ArvoSemanticVersion>;
    serviceContracts: Record<string, VersionedArvoContract<any, any>>;
    initEventId: string;
    executionunits: number;
    source: string;
  },
  span: Span,
): ArvoEvent[] => {
  const emittables: ArvoEvent[] = [];
  for (const item of params.rawEvents) {
    for (const _dom of Array.from(new Set(item.domain ?? [ArvoDomain.LOCAL]))) {
      const evt = createEmittableEvent(
        {
          event: item,
          otelHeaders: params.otelHeaders,
          orchestrationParentSubject: params.orchestrationParentSubject,
          sourceEvent: params.sourceEvent,
          selfContract: params.selfContract,
          serviceContracts: params.serviceContracts,
          initEventId: params.initEventId,
          domain: _dom,
          executionunits: params.executionunits,
          source: params.source,
        },
        span,
      );
      emittables.push(evt);
      for (const [key, value] of Object.entries(emittables[emittables.length - 1].otelAttributes)) {
        span.setAttribute(`emittables.${emittables.length - 1}.${key}`, value);
      }
    }
  }
  return emittables;
};
