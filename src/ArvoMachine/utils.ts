import type { MachineConfig } from 'xstate';

/**
 * Detects if an XState machine configuration contains any parallel states.
 * Uses a stack-based approach for efficient traversal of the state hierarchy.
 * @param config - XState machine configuration
 * @returns True if the machine contains at least one parallel state, false otherwise
 */
export const detectParallelStates = (config?: MachineConfig<any, any, any, any, any, any, any, any, any, any, any>) => {
  if (!config?.states) {
    return false;
  }
  const stack: Array<typeof config> = [config];
  while (stack.length) {
    const currentConfig = stack.pop();
    if (!currentConfig?.states) continue;
    if (currentConfig.type === 'parallel') return true;
    for (const state of Object.values(currentConfig.states)) {
      stack.push(state);
    }
  }
  return false;
};
