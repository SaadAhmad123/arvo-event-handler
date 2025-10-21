import type { ArvoOrchestratorContract, VersionedArvoContract } from 'arvo-core';
import { ArvoResumable } from '.';
import { servicesValidation } from '../ArvoOrchestrationUtils/servicesValidation';
import type { IMachineMemory } from '../MachineMemory/interface';
import type { ArvoEventHandlerOtelSpanOptions } from '../types';
import type { ArvoResumableHandler, ArvoResumableState } from './types';

/**
 * Factory function for creating ArvoResumable orchestrator instances
 *
 * Creates a new ArvoResumable orchestrator with type safety and sensible defaults.
 * ArvoResumable provides handler-based workflow orchestration with explicit context management,
 * contract validation, and distributed locking capabilities.
 *
 * @param param - Configuration object for the orchestrator
 * @param param.types - Optional type hints for better TypeScript inference
 * @param param.types.context - Partial type hint for the workflow context structure (not used at runtime)
 * @param param.contracts - Contract definitions for the orchestrator and its services
 * @param param.contracts.self - The orchestrator's own contract defining accepted events and emitted events
 * @param param.contracts.services - Record of service contracts this orchestrator can invoke, keyed by service name
 * @param param.memory - Generic memory interface for state persistence, locking, and retrieval operations
 * @param param.handler - Versioned orchestration logic handlers mapped by semantic version
 * @param param.executionunits - Resource allocation cost for this orchestrator's execution (default: 0)
 * @param param.requiresResourceLocking - Enable distributed locking for concurrent safety (default: auto-determined by service count)
 * @param param.systemErrorDomain - The domain override of the system error events. (default [event.domain, self.contract.domain, null])
 *
 * @returns A new ArvoResumable orchestrator instance configured with the provided parameters
 *
 * @throws {Error} Service contracts have duplicate URIs - Multiple versions of the same contract are not allowed
 * @throws {Error} Circular dependency detected - Self contract is registered as a service, creating execution loops
 */
export const createArvoResumable = <
  TMemory extends Record<string, any>,
  TSelfContract extends ArvoOrchestratorContract = ArvoOrchestratorContract,
  TServiceContract extends Record<string, VersionedArvoContract<any, any>> = Record<
    string,
    VersionedArvoContract<any, any>
  >,
>(param: {
  types?: {
    context?: Partial<TMemory>;
  };
  contracts: {
    self: TSelfContract;
    services: TServiceContract;
  };
  memory: IMachineMemory<Record<string, any>>;
  handler: ArvoResumableHandler<ArvoResumableState<TMemory>, TSelfContract, TServiceContract>;
  executionunits?: number;
  requiresResourceLocking?: boolean;
  systemErrorDomain?: (string | null)[];
  spanOptions?: ArvoEventHandlerOtelSpanOptions;
}) => {
  servicesValidation(param.contracts, 'resumable');
  return new ArvoResumable<TMemory, TSelfContract, TServiceContract>({
    contracts: param.contracts,
    memory: param.memory as IMachineMemory<ArvoResumableState<TMemory>>,
    handler: param.handler,
    executionunits: param.executionunits ?? 0,
    requiresResourceLocking: param.requiresResourceLocking ?? Object.keys(param.contracts.services).length > 1,
    systemErrorDomain: param.systemErrorDomain,
    spanOptions: param.spanOptions,
  });
};
