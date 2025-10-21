export const ArvoOrchestrationHandlerMap = {
  orchestrator: 'ArvoOrchestrator',
  resumable: 'ArvoResumable',
  machine: 'ArvoMachine',
  handler: 'ArvoEventHandler',
} as const;

export type ArvoOrchestrationHandlerType = keyof typeof ArvoOrchestrationHandlerMap;
