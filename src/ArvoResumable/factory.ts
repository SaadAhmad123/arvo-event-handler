import type { ArvoOrchestratorContract, VersionedArvoContract } from 'arvo-core';
import { ArvoResumable } from '.';
import { servicesValidation } from '../ArvoOrchestrationUtils/servicesValidation';
import type { IMachineMemory } from '../MachineMemory/interface';
import type { ArvoResumableState, CreateArvoResumableParam } from './types';

/**
 * Creates a new {@link ArvoResumable} orchestrator instance.
 *
 * Factory function that constructs a resumable workflow handler with automatic
 * resource locking determination and contract validation. Validates that service
 * contracts have unique URIs and no circular dependencies exist.
 *
 * @param param - Configuration parameters for the resumable
 * @returns Configured ArvoResumable instance ready for event handling
 *
 * @throws {ConfigViolation} When service contracts have duplicate URIs
 * @throws {ConfigViolation} When circular dependency detected (self contract registered as service)
 *
 * @example
 * ```typescript
 * const resumable = createArvoResumable({
 *   contracts: {
 *     self: myOrchestratorContract,
 *     services: {
 *      userService: userContract.version('1.0.0'),
 *      paymentService: paymentContract.version('1.0.0') }
 *   },
 *   memory: new SimpleMachineMemory(),
 *   handler: {
 *     '1.0.0': async ({ input, service, context }) => {
 *       // Handler implementation
 *     }
 *   },
 *   executionunits: 1
 * });
 * ```
 *
 * @see {@link ArvoResumable} For the orchestrator class documentation
 * @see {@link ArvoResumableHandler} For handler interface details
 */
export const createArvoResumable = <
  TMemory extends Record<string, any> = Record<string, any>,
  TSelfContract extends ArvoOrchestratorContract = ArvoOrchestratorContract,
  TServiceContract extends Record<string, VersionedArvoContract<any, any>> = Record<
    string,
    VersionedArvoContract<any, any>
  >,
>(
  param: CreateArvoResumableParam<TMemory, TSelfContract, TServiceContract>,
) => {
  servicesValidation(param.contracts, 'resumable');
  return new ArvoResumable<TMemory, TSelfContract, TServiceContract>({
    contracts: param.contracts,
    memory: param.memory as IMachineMemory<ArvoResumableState<TMemory>>,
    handler: param.handler,
    executionunits: param.executionunits ?? 0,
    requiresResourceLocking: param.requiresResourceLocking ?? Object.keys(param.contracts.services).length > 1,
    defaultEventEmissionDomains: param.defaultEventEmissionDomains,
    spanOptions: param.spanOptions,
  });
};
