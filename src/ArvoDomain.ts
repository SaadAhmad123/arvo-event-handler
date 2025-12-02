import { ArvoOrchestrationSubject, exceptionToSpan, type ArvoEvent, type VersionedArvoContract } from 'arvo-core';

/**
 * Symbolic constants for domain resolution in Arvo event emission.
 *
 * These can be passed into the `domain` array of an emitted ArvoEvent to indicate
 * that the final domain should be dynamically resolved from a specific context.
 */
export const ArvoDomain = {
  /**
   * Resolve domain from the handler's contract.
   *
   * Uses `handlerSelfContract.domain` for all emitted events.
   */
  FROM_SELF_CONTRACT: 'domain.contract.self.inherit',

  /**
   * Resolve domain from the event's contract.
   *
   * For orchestrators, uses the service contract's domain.
   * For handlers, behaves the same as FROM_SELF_CONTRACT.
   */
  FROM_EVENT_CONTRACT: 'domain.contract.inherit',

  /**
   * Resolve domain from the triggering event's domain field.
   *
   * Preserves the domain context of the incoming event.
   */
  FROM_TRIGGERING_EVENT: 'domain.event.inherit',

  /**
   * Extract domain from the current event's subject.
   *
   * Parses the subject to retrieve `execution.domain`.
   * Falls back to LOCAL if subject is not a valid ArvoOrchestrationSubject.
   */
  FROM_CURRENT_SUBJECT: 'domain.event.current.subject',

  /**
   * Extract domain from the parent orchestration subject.
   *
   * Parses the parent subject to retrieve `execution.domain`.
   * Falls back to LOCAL if subject is not a valid ArvoOrchestrationSubject.
   */
  FROM_PARENT_SUBJECT: 'domain.parent.subject',

  /**
   * Resolve domain based on orchestration context.
   *
   * Routes responses and completions back through the orchestration chain:
   * - For handlers: routes back to the orchestration's domain
   * - For child orchestrations: routes to parent's domain if different, LOCAL if same
   * - For root orchestrations: routes to own domain if cross-domain call, LOCAL otherwise
   *
   * This is the recommended default for maintaining domain coherence in orchestration workflows.
   */
  ORCHESTRATION_CONTEXT: 'domain.orchestration.context',

  /**
   * Stay in the current execution context (null domain).
   *
   * Event remains local without crossing domain boundaries.
   */
  LOCAL: null,
} as const;

/**
 * Extracts the domain from an ArvoOrchestrationSubject string.
 *
 * @param subject - Orchestration subject string or null
 * @returns Domain from subject's execution context, or null if parsing fails
 */
const getDomainFromArvoSubject = (subject: string | null): string | null => {
  if (subject === null) return null;
  try {
    const parsedSubject = ArvoOrchestrationSubject.parse(subject);
    return parsedSubject.execution.domain;
  } catch (e) {
    exceptionToSpan(
      new Error(
        `Unable to parse the provided subject. Falling back to ArvoDomain.LOCAL. Error: ${(e as Error).message}`,
      ),
    );
  }
  return null;
};

/**
 * Resolves symbolic domain constants to concrete domain values.
 *
 * Interprets domain resolution symbols and returns the appropriate domain string or null.
 * Static domain strings pass through unchanged.
 *
 * @param param.domainToResolve - Domain string or symbolic constant to resolve
 * @param param.parentSubject - Parent orchestration subject (null for root orchestrations or handlers)
 * @param param.currentSubject - Current event subject
 * @param param.handlerSelfContract - Contract of the handler emitting the event
 * @param param.eventContract - Contract of the event being emitted (optional)
 * @param param.triggeringEvent - Event that triggered this emission
 *
 * @returns Resolved domain string or null
 */
export const resolveEventDomain = (param: {
  domainToResolve: string | null;
  parentSubject: string | null;
  currentSubject: string;
  handlerSelfContract: VersionedArvoContract<any, any>;
  eventContract: VersionedArvoContract<any, any> | null;
  triggeringEvent: ArvoEvent;
}): string | null => {
  if (!param.domainToResolve) {
    return null;
  }

  if (param.domainToResolve === ArvoDomain.LOCAL) {
    return null;
  }

  if (param.domainToResolve === ArvoDomain.FROM_EVENT_CONTRACT) {
    return param.eventContract?.domain ?? null;
  }

  if (param.domainToResolve === ArvoDomain.FROM_SELF_CONTRACT) {
    return param.handlerSelfContract.domain;
  }

  if (param.domainToResolve === ArvoDomain.FROM_TRIGGERING_EVENT) {
    return param.triggeringEvent.domain;
  }

  if (param.domainToResolve === ArvoDomain.FROM_CURRENT_SUBJECT) {
    return getDomainFromArvoSubject(param.currentSubject);
  }

  if (param.domainToResolve === ArvoDomain.FROM_PARENT_SUBJECT) {
    return getDomainFromArvoSubject(param.parentSubject);
  }

  if (param.domainToResolve === ArvoDomain.ORCHESTRATION_CONTEXT) {
    const currentDomain = getDomainFromArvoSubject(param.currentSubject);
    const parentDomain = getDomainFromArvoSubject(param.parentSubject);
    const triggeringDomain = param.triggeringEvent.domain;
    // No parent orchestration (root orchestration or handler)
    if (param.parentSubject === null) {
      // Triggering event is local
      if (triggeringDomain === null) {
        return null;
      }
      // Current and triggering domains match
      if (currentDomain === triggeringDomain) {
        return null;
      }
      // Cross-domain call - route back to orchestration's domain
      return currentDomain;
    }

    // Has parent orchestration
    // Child and parent in same domain
    if (currentDomain === parentDomain) {
      return null;
    }
    // Child in different domain - route to parent's domain
    return parentDomain;
  }

  // Static domain string
  return param.domainToResolve;
};
