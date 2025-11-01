import { assign, emit } from 'xstate';
import { ArvoDomain, resolveEventDomain } from './ArvoDomain';
import ArvoEventHandler from './ArvoEventHandler';
import { createArvoEventHandler } from './ArvoEventHandler/helpers';
import {
  ArvoEventHandlerFunction,
  ArvoEventHandlerFunctionInput,
  ArvoEventHandlerFunctionOutput,
} from './ArvoEventHandler/types';
import ArvoMachine from './ArvoMachine';
import { setupArvoMachine } from './ArvoMachine/createMachine';
import { ArvoMachineContext, EnqueueArvoEventActionParam } from './ArvoMachine/types';
import {
  TransactionViolation,
  TransactionViolationCause,
  isTransactionViolationError,
} from './ArvoOrchestrationUtils/error';
import { OrchestrationExecutionStatus } from './ArvoOrchestrationUtils/orchestrationExecutionState';
import { ArvoOrchestrator } from './ArvoOrchestrator';
import { createArvoOrchestrator } from './ArvoOrchestrator/factory';
import { ArvoOrchestratorParam, MachineMemoryRecord } from './ArvoOrchestrator/types';
import { ArvoResumable } from './ArvoResumable';
import { createArvoResumable } from './ArvoResumable/factory';
import { ArvoResumableHandler, ArvoResumableState } from './ArvoResumable/types';
import IArvoEventHandler from './IArvoEventHandler';
import { MachineExecutionEngine } from './MachineExecutionEngine';
import { IMachineExectionEngine } from './MachineExecutionEngine/interface';
import { ExecuteMachineInput, ExecuteMachineOutput } from './MachineExecutionEngine/types';
import { SimpleMachineMemory } from './MachineMemory/Simple';
import { TelemetredSimpleMachineMemory } from './MachineMemory/TelemetredSimple';
import { IMachineMemory } from './MachineMemory/interface';
import { MachineRegistry } from './MachineRegistry';
import { IMachineRegistry } from './MachineRegistry/interface';
import { ConfigViolation, ContractViolation, ExecutionViolation } from './errors';
import {
  ArvoEventHandlerOpenTelemetryOptions,
  ArvoEventHandlerOtelSpanOptions,
  EventHandlerFactory,
  PartialExcept,
} from './types';
import { coalesce, coalesceOrDefault, getValueOrDefault, isNullOrUndefined } from './utils';
import { SimpleEventBroker } from './utils/SimpleEventBroker';
import { createSimpleEventBroker } from './utils/SimpleEventBroker/helper';
import { runArvoTestSuites } from './runArvoTestSuites';
import {
  ArvoTestStep,
  ArvoTestCase,
  ArvoTestConfig,
  ArvoTestSuite,
  ArvoTestResult,
  IArvoTestFramework,
} from './runArvoTestSuites/types';

const xstate = {
  emit,
  assign,
};

export {
  ArvoEventHandler,
  createArvoEventHandler,
  IArvoEventHandler,
  ArvoEventHandlerFunctionOutput,
  ArvoEventHandlerFunctionInput,
  ArvoEventHandlerFunction,
  PartialExcept,
  isNullOrUndefined,
  getValueOrDefault,
  coalesce,
  coalesceOrDefault,
  ArvoEventHandlerOpenTelemetryOptions,
  EventHandlerFactory,
  ContractViolation,
  ConfigViolation,
  ExecutionViolation,
  ArvoMachine,
  setupArvoMachine,
  ArvoMachineContext,
  EnqueueArvoEventActionParam,
  IMachineRegistry,
  MachineRegistry,
  MachineExecutionEngine,
  IMachineExectionEngine,
  ExecuteMachineInput,
  ExecuteMachineOutput,
  IMachineMemory,
  SimpleMachineMemory,
  MachineMemoryRecord,
  ArvoOrchestratorParam,
  TransactionViolation,
  TransactionViolationCause,
  ArvoOrchestrator,
  createArvoOrchestrator,
  SimpleEventBroker,
  createSimpleEventBroker,
  TelemetredSimpleMachineMemory,
  xstate,
  ArvoResumable,
  createArvoResumable,
  ArvoResumableHandler,
  ArvoResumableState,
  ArvoDomain,
  resolveEventDomain,
  isTransactionViolationError,
  OrchestrationExecutionStatus,
  ArvoEventHandlerOtelSpanOptions,
  runArvoTestSuites,
  ArvoTestStep,
  ArvoTestCase,
  ArvoTestConfig,
  ArvoTestSuite,
  ArvoTestResult,
  IArvoTestFramework,
};
