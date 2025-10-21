import type { EventHandlerFactory } from '../../../../src';
import { createArvoOrchestrator } from '../../../../src';
import type { OrchestratorConfig } from '../type';
import { machineV001 } from './machines/v001';
import { machineV002 } from './machines/v002';

export const incrementOrchestrator: EventHandlerFactory<OrchestratorConfig> = ({ memory }) =>
  createArvoOrchestrator({
    memory,
    executionunits: 0.1,
    machines: [machineV001, machineV002],
    spanOptions: {
      spanName: ({ consumedEvent }) => `Increment Orchestrator@${consumedEvent.type}`,
    },
  });
