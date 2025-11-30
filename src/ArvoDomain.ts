import type { ArvoEvent, VersionedArvoContract } from 'arvo-core';

/**
 * Symbolic constants for domain resolution in Arvo event emission.
 *
 * These can be passed into the `domain` array of an emitted ArvoEvent to indicate
 * that the final domain should be dynamically resolved from a specific context.
 */
export const ArvoDomain = {
  /**
   * Resolve the domain from the emitting handler’s own contract (`handlerSelfContract.domain`).
   *
   * Use this when the handler’s contract defines a stable domain that should apply
   * to all emitted events, regardless of the triggering context.
   */
  FROM_SELF_CONTRACT: 'domain.contract.self.inherit',

  /**
   * Resolve the domain from the contract that defines the event being emitted (`eventContract.domain`).
   *
   * In `ArvoResumable` and `ArvoMachine`, this is typically used when emitting service events
   * (not the completion event). In `ArvoEventHandler`, where only the self contract exists,
   * this resolves to the same value as `FROM_SELF_CONTRACT`.
   *
   * For orchestration `complete` events, this behaves identically to `FROM_SELF_CONTRACT`
   * since the emitting contract is also the self contract.
   */
  FROM_EVENT_CONTRACT: 'domain.contract.inherit',

  /**
   * Resolve the domain from the triggering event’s `domain` field (`triggeringEvent.domain`).
   *
   * Use this when you want to preserve the domain context of the incoming event
   * and carry it forward through event emissions.
   */
  FROM_TRIGGERING_EVENT: 'domain.event.inherit',

  /**
   * Keep the event in the current execution context (null domain).
   *
   * Use this when the event should remain local to the current domain without
   * crossing execution boundaries through the exchange layer.
   */
  LOCAL: null
} as const;

/**
 * Resolves a symbolic or static domain value into a concrete domain string or `null`.
 *
 * Used internally in the Arvo execution model to interpret symbolic domain constants
 * at the moment an event is emitted. Supports resolution from:
 * - the emitting handler's own contract
 * - the emitted event’s associated contract
 * - the triggering event’s `domain` field
 *
 * @param param - Parameters for resolving the domain.
 * @param param.domainToResolve - Either a static domain string, symbolic value, or null.
 * @param param.handlerSelfContract - The contract of the handler currently emitting the event.
 * @param param.eventContract - The contract of the event being emitted (optional).
 * @param param.triggeringEvent - The triggering event that caused this emission.
 *
 * @returns A resolved domain string, or `null` if no valid domain is found.
 */
export const resolveEventDomain = (param: {
  domainToResolve: string | null;
  handlerSelfContract: VersionedArvoContract<any, any>;
  eventContract: VersionedArvoContract<any, any> | null;
  triggeringEvent: ArvoEvent;
}): string | null => {
  const ArvoDomainValues = Object.values(ArvoDomain);

  if (param.domainToResolve && ArvoDomainValues.includes(param.domainToResolve as (typeof ArvoDomainValues)[number])) {
    const domainToResolve = param.domainToResolve as (typeof ArvoDomainValues)[number];

    if (domainToResolve === ArvoDomain.FROM_EVENT_CONTRACT) {
      return param.eventContract?.domain ?? null;
    }

    if (domainToResolve === ArvoDomain.FROM_SELF_CONTRACT) {
      return param.handlerSelfContract.domain;
    }

    if (domainToResolve === ArvoDomain.FROM_TRIGGERING_EVENT) {
      return param.triggeringEvent.domain;
    }
  }

  return param.domainToResolve;
};
