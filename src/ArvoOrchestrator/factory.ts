import { ArvoOrchestrator } from '.';
import { MachineExecutionEngine } from '../MachineExecutionEngine';
import { MachineRegistry } from '../MachineRegistry';
import type { ICreateArvoOrchestrator } from './types';

/**
 * Creates a new Arvo orchestrator instance with default components.
 * For custom components, use ArvoOrchestrator constructor directly.
 *
 * @param config - Orchestrator configuration
 * @param config.memory - State persistence interface for storing machine states
 * @param config.executionunits - Cost units for execution tracking
 * @param config.machines - Array of state machines to manage. Their resource locking flags determine orchestrator's locking behavior
 * @param config.systemErrorDomain - An optional array of system error domain overrides
 * @returns Configured ArvoOrchestrator instance with default registry and execution engine
 *
 * @remarks
 * The orchestrator's resource locking is enabled if any machine requires it. Locking is needed when:
 * - Machine contains parallel states where multiple states can be active simultaneously
 * - Race conditions need to be prevented in concurrent processing
 * - State consistency must be maintained across distributed executions
 *
 * @example
 * ```typescript
 * const orchestrator = createArvoOrchestrator({
 *   memory: new SimpleMachineMemory() // or, any other IMachineMemory implementation,
 *   executionunits: 1,
 *   machines: [machineA, machineB]
 * });
 * ```
 */
export const createArvoOrchestrator = ({
  executionunits,
  memory,
  machines,
  systemErrorDomain,
}: ICreateArvoOrchestrator): ArvoOrchestrator => {
  if (!machines?.length) {
    throw new Error('At least one machine must be provided');
  }

  const registry = new MachineRegistry(...machines);
  const requiresResourceLocking = machines.some((machine) => machine.requiresResourceLocking);

  return new ArvoOrchestrator({
    executionunits,
    memory,
    registry,
    executionEngine: new MachineExecutionEngine(),
    requiresResourceLocking,
    systemErrorDomain,
  });
};
