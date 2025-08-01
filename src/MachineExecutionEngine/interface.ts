import type { ArvoEventHandlerOpenTelemetryOptions } from '../types';
import type { ExecuteMachineInput, ExecuteMachineOutput } from './types';

/**
 * Interface defining a machine execution engine.
 */
export interface IMachineExectionEngine {
  /**
   * Executes a state machine and processes events.
   * @param param - Input parameters for machine execution
   * @param opentelemetry - Telemetry configuration options
   * @returns Machine execution results including state and events
   */
  execute: (param: ExecuteMachineInput, opentelemetry: ArvoEventHandlerOpenTelemetryOptions) => ExecuteMachineOutput;
}
