import type { Span } from '@opentelemetry/api';
import type {
  ArvoContract,
  ArvoEvent,
  ArvoOrchestratorContract,
  ArvoSemanticVersion,
  VersionedArvoContract,
} from 'arvo-core';
import type { AnyActorLogic } from 'xstate';
import { type EventValidationResult, validateInputEvent } from '../ArvoOrchestrationUtils/inputValidation';

/**
 * Represents an ArvoMachine object that can be consumed by an Arvo orchestrator.
 * ArvoMachine encapsulates the logic and metadata required for an Arvo-compatible
 * state machine. It combines XState's actor logic with Arvo-specific contracts
 * and versioning information.
 *
 * It is strongly recommended to use `setupArvoMachine(...).createMachine(...)`
 * instead of creating this object directly. The setup function provides additional
 * type safety and validation that helps prevent runtime errors.
 */
export default class ArvoMachine<
  TId extends string,
  TVersion extends ArvoSemanticVersion,
  TSelfContract extends VersionedArvoContract<ArvoOrchestratorContract, TVersion>,
  TServiceContract extends Record<string, VersionedArvoContract<ArvoContract, ArvoSemanticVersion>>,
  TLogic extends AnyActorLogic,
> {
  constructor(
    public readonly id: TId,
    public readonly version: TVersion,
    public readonly contracts: {
      self: TSelfContract;
      services: TServiceContract;
    },
    public readonly logic: TLogic,
    public readonly requiresResourceLocking: boolean = true,
  ) {}

  /**
   * Gets the event type that this machine accepts, as defined in its contract.
   */
  get source(): TSelfContract['accepts']['type'] {
    return this.contracts.self.accepts.type;
  }

  /**
   * Validates an event against the machine's contracts and data schemas.
   * Performs validation for both self-contract events and service contract events.
   *
   * @param event - The event to validate
   *
   * See {@link validateInputEvent} for more infromation
   */
  validateInput(event: ArvoEvent, span?: Span): EventValidationResult {
    return validateInputEvent({
      event,
      selfContract: this.contracts.self,
      serviceContracts: this.contracts.services,
      span,
    });
  }
}
