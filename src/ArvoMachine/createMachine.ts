import {
  type ArvoOrchestratorEventTypeGen,
  type CreateArvoEvent,
  type InferVersionedArvoContract,
  type VersionedArvoContract,
  cleanString,
} from 'arvo-core';
import {
  type ActionFunction,
  type MachineConfig,
  type MachineContext,
  type MetaObject,
  type ParameterizedObject,
  type SetupTypes,
  assign,
  setup as xstateSetup,
} from 'xstate';
import type { z } from 'zod';
import ArvoMachine from '.';
import { servicesValidation } from '../ArvoOrchestrationUtils/servicesValidation';
import { ConfigViolation } from '../errors';
import { getAllPaths } from '../utils/object';
import type {
  ArvoMachineContext,
  EnqueueArvoEventActionParam,
  ExtractOrchestratorType,
  InferServiceContract,
  ToParameterizedObject,
  ToProvidedActor,
} from './types';
import { detectParallelStates } from './utils';
import { NonEmptyArray } from '../types';

/**
 * Establishes the foundation for creating Arvo-compatible state machines.
 *
 * Designed for synchronous state machine orchestrations in Arvo's event-driven architecture.
 * Builds upon XState with Arvo-specific constraints to enforce predictable state transitions.
 *
 * @throws {ConfigViolation} When configuration violates Arvo constraints:
 * - Using `actors` or `delays` (async behavior not supported)
 * - Overriding reserved `enqueueArvoEvent` action name
 * - Machine version mismatch with contract version
 * - Using `invoke` or `after` in state configurations
 * - Service contracts with duplicate URIs (multiple versions of same contract)
 * - Circular dependency (self contract URI matches a service contract URI)
 */
export function setupArvoMachine<
  TContext extends MachineContext,
  TSelfContract extends VersionedArvoContract<any, any>,
  TServiceContracts extends Record<string, VersionedArvoContract<any, any>>,
  // biome-ignore lint/complexity/noBannedTypes: Taking {} from xstate. Cannot be helped.
  TActions extends Record<string, ParameterizedObject['params'] | undefined> = {},
  // biome-ignore lint/complexity/noBannedTypes: Taking {} from xstate. Cannot be helped
  TGuards extends Record<string, ParameterizedObject['params'] | undefined> = {},
  TTag extends string = string,
  TMeta extends MetaObject = MetaObject,
>(param: {
  schemas?: unknown;
  /**
   * Contract definitions for the machine's event interface.
   * Defines what events the machine accepts, emits, and exchanges with services.
   */
  contracts: {
    /**
     * Self contract defining the machine's initialization input structure
     * and the completion output structure when the machine finishes execution.
     */
    self: TSelfContract;

    /**
     * Service contracts defining the event interfaces for external services.
     * Each service specifies the events it accepts and emits, enabling
     * type-safe communication between the machine and its dependencies.
     */
    services: TServiceContracts;
  };
  /**
   * Type definitions for the machine's internal structure.
   * Specifies the shape of context and other variables used throughout
   * the machine's lifecycle. These types enable full type inference and safety.
   */
  types?: Omit<
    SetupTypes<
      TContext,
      InferServiceContract<TServiceContracts>['events'],
      // biome-ignore lint/complexity/noBannedTypes: Taking {} from xstate. Cannot be helped
      {},
      TTag,
      InferVersionedArvoContract<TSelfContract>['accepts']['data'],
      InferVersionedArvoContract<TSelfContract>['emits'][ReturnType<
        typeof ArvoOrchestratorEventTypeGen.complete<ExtractOrchestratorType<TSelfContract['accepts']['type']>>
      >]['data'],
      InferServiceContract<TServiceContracts>['emitted'],
      TMeta
    >,
    'input' | 'output' | 'children' | 'emitted'
  >;
  /**
   * Named action implementations that can be referenced throughout the machine.
   * Actions perform side effects like data transformations, context updates,
   * and event emissions. Each action receives the current context and event,
   * along with any parameters defined in its type.
   *
   * For more information, see [xstate action docs](https://stately.ai/docs/actions)
   *
   * @example
   * ```typescript
   * actions: {
   *   updateUser: ({ context, event }, params) => {
   *     // Transform and update context
   *   },
   *   logEvent: ({ event }) => {
   *     // Log for debugging
   *   }
   * }
   * ```
   */
  actions?: {
    [K in keyof TActions]: ActionFunction<
      TContext,
      InferServiceContract<TServiceContracts>['events'],
      InferServiceContract<TServiceContracts>['events'],
      TActions[K],
      never,
      ToParameterizedObject<TActions>,
      ToParameterizedObject<TGuards>,
      never,
      InferServiceContract<TServiceContracts>['emitted']
    >;
  };
  /**
   * Named guard implementations that control conditional state transitions.
   * Guards are boolean functions that determine whether a transition should occur
   * based on the current context and event. They enable dynamic flow control
   * without side effects.
   *
   * For more information, see [xstate guard docs](https://stately.ai/docs/guards)
   *
   * @example
   * ```typescript
   * guards: {
   *   isAuthorized: ({ context, event }, params) => {
   *     return context.user.role === 'admin';
   *   },
   *   hasRequiredData: ({ context }) => {
   *     return context.data !== null;
   *   }
   * }
   * ```
   */
  guards?: {
    [K in keyof TGuards]: (
      args: {
        context: TContext;
        event: InferServiceContract<TServiceContracts>['events'];
      },
      params: TGuards[K],
    ) => boolean;
  };
}) {
  const createConfigErrorMessage = (type: 'actor' | 'delays') => {
    return cleanString(`
      Configuration Error: '${type}' not supported in Arvo machines
      
      Arvo machines do not support XState ${type === 'actor' ? 'actors' : 'delay transitions'} as they introduce asynchronous behavior.
      
      To fix:
      1. Remove the '${type}' configuration
      2. Use Arvo's event-driven patterns instead for asynchronous operations
    `);
  };

  if ((param as any).actors) {
    throw new ConfigViolation(createConfigErrorMessage('actor'));
  }

  if ((param as any).delays) {
    throw new ConfigViolation(createConfigErrorMessage('delays'));
  }

  if (param.actions?.enqueueArvoEvent) {
    throw new ConfigViolation(
      cleanString(`
        Configuration Error: Reserved action name 'enqueueArvoEvent'
        
        'enqueueArvoEvent' is an internal Arvo system action and cannot be overridden.
        
        To fix: Use a different name for your action, such as:
        - 'queueCustomEvent'
        - 'scheduleEvent'
        - 'dispatchEvent'
      `),
    );
  }

  servicesValidation(param.contracts, 'machine');

  const combinedActions = {
    ...((param.actions ?? {}) as typeof param.actions),
    enqueueArvoEvent: assign<
      TContext & ArvoMachineContext,
      InferServiceContract<TServiceContracts>['events'],
      InferServiceContract<TServiceContracts>['emitted'],
      InferServiceContract<TServiceContracts>['events'],
      never
    >(({ context }, param) => ({
      ...(context ?? {}),
      arvo$$: {
        ...(context?.arvo$$ ?? {}),
        volatile$$: {
          ...(context?.arvo$$?.volatile$$ ?? {}),
          eventQueue$$: [...(context?.arvo$$?.volatile$$?.eventQueue$$ || []), param],
        },
      },
    })),
  };

  // Call the original setup function with modified parameters
  const systemSetup = xstateSetup<
    TContext,
    InferServiceContract<TServiceContracts>['events'],
    // biome-ignore lint/complexity/noBannedTypes: Taking {} from xstate. Cannot be helped
    {}, // No actors
    // biome-ignore lint/complexity/noBannedTypes: Taking {} from xstate. Cannot be helped
    {}, // No children map
    TActions & {
      enqueueArvoEvent: EnqueueArvoEventActionParam;
    },
    TGuards,
    never, // No delays
    TTag,
    InferVersionedArvoContract<TSelfContract>['accepts']['data'],
    InferVersionedArvoContract<TSelfContract>['emits'][ReturnType<
      typeof ArvoOrchestratorEventTypeGen.complete<ExtractOrchestratorType<TSelfContract['accepts']['type']>>
    >]['data'],
    InferServiceContract<TServiceContracts>['emitted'],
    TMeta
  >({
    schemas: param.schemas,
    types: param.types,
    guards: param.guards as any,
    actions: combinedActions as any,
  });

  /**
   * Creates an Arvo-compatible XState machine.
   */
  const createMachine = <
    const TConfig extends MachineConfig<
      TContext,
      InferServiceContract<TServiceContracts>['events'],
      // biome-ignore lint/complexity/noBannedTypes: Taking {} from xstate. Cannot be helped
      ToProvidedActor<{}, {}>,
      ToParameterizedObject<
        TActions & {
          enqueueArvoEvent: EnqueueArvoEventActionParam;
        }
      >,
      ToParameterizedObject<TGuards>,
      never,
      TTag,
      InferVersionedArvoContract<TSelfContract>['accepts'],
      z.input<
        TSelfContract['emits'][ReturnType<
          typeof ArvoOrchestratorEventTypeGen.complete<ExtractOrchestratorType<TSelfContract['accepts']['type']>>
        >]
      > & {
        __id?: CreateArvoEvent<Record<string, unknown>, string>['id'];
        __executionunits?: CreateArvoEvent<Record<string, unknown>, string>['executionunits'];
        __domain?: NonEmptyArray<string | null>;
      },
      InferServiceContract<TServiceContracts>['emitted'],
      TMeta
    >,
  >(
    config: TConfig & {
      id: string;
      version?: TSelfContract['version'];
    },
  ) => {
    const machineVersion: TSelfContract['version'] = config.version ?? param.contracts.self.version;

    if (machineVersion !== param.contracts.self.version) {
      throw new ConfigViolation(
        `Version mismatch: Machine version must be '${param.contracts.self.version}' or undefined, received '${config.version}'`,
      );
    }

    const createConfigErrorMessage = (type: 'invoke' | 'after' | 'enqueueArvoEvent', path: string[]) => {
      const location = path.join(' > ');

      if (type === 'invoke') {
        return cleanString(`
          Configuration Error: 'invoke' not supported
          
          Location: ${location}
          
          Arvo machines do not support XState invocations as they introduce asynchronous behavior.
          
          To fix: Replace 'invoke' with Arvo event-driven patterns for asynchronous operations
        `);
      }

      if (type === 'after') {
        return cleanString(`
          Configuration Error: 'after' not supported
          
          Location: ${location}
          
          Arvo machines do not support delayed transitions as they introduce asynchronous behavior.
          
          To fix: Replace 'after' with Arvo event-driven patterns for time-based operations
        `);
      }

      if (type === 'enqueueArvoEvent') {
        return cleanString(`
          Configuration Error: Reserved action name 'enqueueArvoEvent'
          
          Location: ${location}
          
          'enqueueArvoEvent' is an internal Arvo system action and cannot be used in machine configurations.
          
          To fix: Use a different name for your action
        `);
      }
    };

    for (const item of getAllPaths(config.states ?? {})) {
      if (item.path.includes('invoke')) {
        throw new ConfigViolation(createConfigErrorMessage('invoke', item.path) ?? 'Invoke not allowed');
      }
      if (item.path.includes('after')) {
        throw new ConfigViolation(createConfigErrorMessage('after', item.path) ?? 'After not allowed');
      }
      if (item.path.includes('enqueueArvoEvent')) {
        throw new ConfigViolation(
          createConfigErrorMessage('enqueueArvoEvent', item.path) ?? 'EnqueueArvoEvent not allowed',
        );
      }
    }

    const machine = systemSetup.createMachine({
      ...(config as any),
    });

    const hasParallelStates = detectParallelStates(machine.config);
    const hasMultipleNonSystemErrorEvents = Object.values(param.contracts.services).some(
      (item) => Object.keys(item.emits).length > 1,
    );
    const requiresLocking = hasParallelStates || hasMultipleNonSystemErrorEvents;
    return new ArvoMachine<string, typeof machineVersion, TSelfContract, TServiceContracts, typeof machine>(
      config.id,
      machineVersion,
      param.contracts,
      machine,
      requiresLocking,
    );
  };
  return {
    /**
     * Creates an Arvo-compatible state machine with the specified configuration.
     *
     * Constructs a fully-typed state machine that orchestrates event-driven workflows
     * using the contracts and types defined in setup. The machine enforces synchronous
     * execution and validates configuration against Arvo constraints.
     *
     * For more information, see [xstate state machine docs](https://stately.ai/docs/states)
     * @returns {ArvoMachine} A configured Arvo machine ready for execution
     * @throws {ConfigViolation} When configuration violates Arvo constraints (see {@link setupArvoMachine} docs)
     *
     * @example
     * ```typescript
     * const machine = setup.createMachine({
     *   id: 'machineV100',
     *   initial: 'verifying',
     *   context: ({ input }) => ({
     *     userId: input.data.userId,
     *     verified: false
     *   }),
     *   states: {
     *     verifying: {
     *       on: {
     *         'com.user.verified': {
     *           target: 'active',
     *           actions: { type: 'updateUser' }
     *         }
     *       }
     *     },
     *     active: {
     *       type: 'final'
     *     }
     *   }
     * });
     * ```
     */
    createMachine,
  };
}
