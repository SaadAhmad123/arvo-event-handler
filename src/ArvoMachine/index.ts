import {
  type ArvoContract,
  type ArvoEvent,
  type ArvoOrchestratorContract,
  type ArvoSemanticVersion,
  EventDataschemaUtil,
  type VersionedArvoContract,
  isWildCardArvoSematicVersion,
  logToSpan,
} from 'arvo-core';
import type { AnyActorLogic } from 'xstate';
import type { z } from 'zod';

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
   * @returns A validation result object:
   *   - "VALID" - Event is valid and can be processed
   *   - "CONTRACT_UNRESOLVED" - No matching contract found for the event
   *   - "INVALID" - Event dataschema conflict with contract
   *   - "INVALID_DATA" - Event data conflicts with contract
   */
  validateInput(event: ArvoEvent):
    | {
        type: 'VALID';
      }
    | {
        type: 'CONTRACT_UNRESOLVED';
      }
    | {
        type: 'INVALID';
        error: Error;
      }
    | {
        type: 'INVALID_DATA';
        error: z.ZodError;
      } {
    let resovledContract: VersionedArvoContract<any, any> | null = null;
    let contractType: 'self' | 'service';
    if (event.type === this.contracts.self.accepts.type) {
      resovledContract = this.contracts.self;
      contractType = 'self';
    } else {
      resovledContract =
        Object.fromEntries(
          Object.values(this.contracts.services).reduce(
            (acc, cur) => [
              // biome-ignore lint/performance/noAccumulatingSpread: This is fine
              ...acc,
              ...[...cur.emitList, cur.systemError].map(
                (item) => [item.type, cur] as [string, VersionedArvoContract<any, any>],
              ),
            ],
            [] as [string, VersionedArvoContract<any, any>][],
          ),
        )[event.type] ?? null;
      contractType = 'service';
    }

    if (!resovledContract) {
      logToSpan({
        level: 'WARNING',
        message: `Contract resolution failed: No matching contract found for event (id='${event.id}', type='${event.type}')`,
      });
      return {
        type: 'CONTRACT_UNRESOLVED',
      };
    }

    logToSpan({
      level: 'INFO',
      message: `Contract resolved: Contract(uri='${resovledContract.uri}', version='${resovledContract.version}', type='${resovledContract.accepts.type}') for the event(id='${event.id}', type='${event.type}')`,
    });

    const dataschema = EventDataschemaUtil.parse(event);

    if (!dataschema) {
      logToSpan({
        level: 'WARNING',
        message: `Dataschema resolution failed: Unable to parse dataschema='${event.dataschema}' for event(id='${event.id}', type='${event.type}')`,
      });
    } else {
      logToSpan({
        level: 'INFO',
        message: `Dataschema resolved: ${event.dataschema} matches contract(uri='${resovledContract.uri}', version='${resovledContract.version}')`,
      });
      if (dataschema.uri !== resovledContract.uri) {
        return {
          type: 'INVALID',
          error: new Error(
            `Contract URI mismatch: ${contractType} Contract(uri='${resovledContract.uri}', type='${resovledContract.accepts.type}') does not match Event(dataschema='${event.dataschema}', type='${event.type}')`,
          ),
        };
      }
      if (!isWildCardArvoSematicVersion(dataschema.version) && dataschema.version !== resovledContract.version) {
        return {
          type: 'INVALID',
          error: new Error(
            `Contract version mismatch: ${contractType} Contract(version='${resovledContract.version}', type='${resovledContract.accepts.type}', uri=${resovledContract.uri}) does not match Event(dataschema='${event.dataschema}', type='${event.type}')`,
          ),
        };
      }
    }

    const validationSchema: z.AnyZodObject =
      contractType === 'self'
        ? resovledContract.accepts.schema
        : (resovledContract.emits[event.type] ?? resovledContract.systemError.schema);
    const error = validationSchema.safeParse(event.data).error ?? null;
    if (error) {
      return {
        type: 'INVALID_DATA',
        error: error,
      };
    }
    return {
      type: 'VALID',
    };
  }
}
