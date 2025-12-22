import type { ArvoSemanticVersion } from 'arvo-core';
import { ArvoOrchestrator } from '.';
import { MachineExecutionEngine } from '../MachineExecutionEngine';
import { MachineRegistry } from '../MachineRegistry';
import { ConfigViolation } from '../errors';
import type { CreateArvoOrchestratorParam, MachineMemoryRecord } from './types';
import { IMachineMemory } from '../MachineMemory/interface';

/**
 * Creates a new Arvo orchestrator instance with default components.
 *
 * Factory function that constructs an orchestrator with standard execution engine
 * and registry implementations. Validates that all machines share the same source
 * identifier and have unique versions.
 *
 * @param params - Configuration parameters for the orchestrator
 * @returns Configured ArvoOrchestrator instance ready for event handling
 *
 * @throws {Error} When no machines are provided
 * @throws {ConfigViolation} When machines have different source identifiers
 * @throws {ConfigViolation} When machines have duplicate versions
 *
 * @example
 * ```typescript
 * const orchestrator = createArvoOrchestrator({
 *   memory: new SimpleMachineMemory(),
 *   machines: [userOnboardingMachine, paymentMachine]
 * });
 *
 * // Process events
 * const result = await orchestrator.execute(event);
 * ```
 *
 * @see {@link setupArvoMachine} for creating machine definitions
 * @see {@link ArvoOrchestrator} for direct instantiation with custom components
 */
export const createArvoOrchestrator = ({
  executionunits,
  memory,
  machines,
  defaultEventEmissionDomains,
  spanOptions,
  requiresResourceLocking: _locking,
}: CreateArvoOrchestratorParam): ArvoOrchestrator => {
  if (!machines?.length) {
    throw new Error('At least one machine must be provided');
  }

  const registry = new MachineRegistry(...machines);
  const requiresResourceLocking = _locking ?? machines.some((machine) => machine.requiresResourceLocking);

  const representativeMachine = registry.machines[0];
  const lastSeenVersions = new Set<ArvoSemanticVersion>();
  for (const machine of registry.machines) {
    if (representativeMachine.source !== machine.source) {
      throw new ConfigViolation(
        `All the machines in the orchestrator must have source '${representativeMachine.source}'. Make sure all machine are implementing versions of the same self contract`,
      );
    }
    if (lastSeenVersions.has(machine.version)) {
      throw new ConfigViolation(
        `An orchestrator must have unique machine versions. Machine ID:${machine.id} has duplicate version ${machine.version}.`,
      );
    }
    lastSeenVersions.add(machine.version);
  }

  return new ArvoOrchestrator({
    executionunits,
    memory: memory as IMachineMemory<MachineMemoryRecord>,
    registry,
    executionEngine: new MachineExecutionEngine(),
    requiresResourceLocking,
    defaultEventEmissionDomains,
    spanOptions,
  });
};
