import AbstractArvoEventHandler from './AbstractArvoEventHandler';
import ArvoEventHandler from './ArvoEventHandler';
import { createArvoEventHandler } from './ArvoEventHandler/helpers';
import {
  ArvoEventHandlerFunction,
  ArvoEventHandlerFunctionInput,
  ArvoEventHandlerFunctionOutput,
  IArvoEventHandler,
} from './ArvoEventHandler/types';
import { ConfigViolation, ContractViolation, ExecutionViolation } from './errors';
import { ArvoEventHandlerOpenTelemetryOptions, EventHandlerFactory, PartialExcept } from './types';
import { coalesce, coalesceOrDefault, getValueOrDefault, isNullOrUndefined } from './utils';
import { assign, emit } from 'xstate';
import ArvoMachine from './ArvoMachine';
import { setupArvoMachine } from './ArvoMachine/createMachine';
import { ArvoMachineContext, EnqueueArvoEventActionParam } from './ArvoMachine/types';
import { ArvoOrchestrator } from './ArvoOrchestrator';
import { TransactionViolation, TransactionViolationCause } from './ArvoOrchestrator/error';
import { createArvoOrchestrator } from './ArvoOrchestrator/factory';
import { IArvoOrchestrator, MachineMemoryRecord } from './ArvoOrchestrator/types';
import { MachineExecutionEngine } from './MachineExecutionEngine';
import { IMachineExectionEngine } from './MachineExecutionEngine/interface';
import { ExecuteMachineInput, ExecuteMachineOutput } from './MachineExecutionEngine/types';
import { SimpleMachineMemory } from './MachineMemory/Simple';
import { TelemetredSimpleMachineMemory } from './MachineMemory/TelemetredSimple';
import { IMachineMemory } from './MachineMemory/interface';
import { MachineRegistry } from './MachineRegistry';
import { IMachineRegistry } from './MachineRegistry/interface';
import { SimpleEventBroker } from './utils/SimpleEventBroker';
import { createSimpleEventBroker } from './utils/SimpleEventBroker/helper';
import { ArvoResumable } from './ArvoResumable';
import { createArvoResumable } from './ArvoResumable/factory';
import { ArvoResumableHandler, ArvoResumableState } from './ArvoResumable/types';
import { ArvoDomain, resolveEventDomain } from './ArvoDomain';

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
  AbstractArvoEventHandler,
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
  IArvoOrchestrator,
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
};
