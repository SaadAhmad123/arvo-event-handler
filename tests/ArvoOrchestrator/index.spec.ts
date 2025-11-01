import {
  type ArvoEvent,
  ArvoOrchestrationSubject,
  EventDataschemaUtil,
  createArvoEvent,
  createArvoEventFactory,
  createArvoOrchestratorContract,
  createArvoOrchestratorEventFactory,
  createSimpleArvoContract,
} from 'arvo-core';
import { z } from 'zod';
import { ExecutionViolation, xstate } from '../../src';
import {
  type ArvoOrchestrator,
  type MachineMemoryRecord,
  SimpleMachineMemory,
  createArvoOrchestrator,
  createSimpleEventBroker,
  setupArvoMachine,
} from '../../src';
import { telemetrySdkStart, telemetrySdkStop } from '../utils';
import {
  decrementOrchestratorContract,
  incrementContract,
  incrementOrchestratorContract,
  numberModifierOrchestrator as numberModifierOrchestratorContract,
  valueReadContract,
} from './contracts';
import { decrementNumberHandler } from './handler/decrement.number';
import { incrementNumberHandler } from './handler/increment.number';
import { valueReadHandler } from './handler/value.read';
import { valueWriteHandler } from './handler/value.write';
import { decrementOrchestrator } from './orchestrators/decrement';
import { incrementOrchestrator } from './orchestrators/increment';
import { numberModifierOrchestrator } from './orchestrators/number.modifier';
import { runArvoTestSuites, ArvoTestSuite } from '../../src';

const promiseTimeout = (timeout = 10) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, timeout);
  });

describe('ArvoOrchestrator', () => {
  beforeAll(() => {
    telemetrySdkStart();
  });

  afterAll(() => {
    telemetrySdkStop();
  });

  const valueStore: Record<string, number> = {};
  const machineMemory = new SimpleMachineMemory<MachineMemoryRecord>();

  const handlers = {
    increment: incrementNumberHandler(),
    decrement: decrementNumberHandler(),
    valueRead: valueReadHandler({ valueStore }),
    valueWrite: valueWriteHandler({ valueStore }),
    incrementAgent: incrementOrchestrator({ memory: machineMemory }),
    decrementAgent: decrementOrchestrator({ memory: machineMemory }),
    numberModifierAgent: numberModifierOrchestrator({ memory: machineMemory }),
  };

  // Test suite for valid init event orchestration
  const validInitEventSuite: ArvoTestSuite = {
    config: {
      name: 'Increment Orchestrator - Valid Init Event',
      handler: handlers.incrementAgent,
    },
    cases: [
      {
        name: 'should orchestrate valid init event through complete flow',
        steps: [
          {
            input: () => {
              const initEvent = createArvoOrchestratorEventFactory(
                incrementOrchestratorContract.version('0.0.1')
              ).init({
                source: 'com.test.test',
                data: {
                  key: 'test.key',
                  modifier: 2,
                  trend: 'linear',
                  parentSubject$$: null,
                },
              });
              valueStore[initEvent.data.key] = 2;
              return initEvent;
            },
            expectedEvents: (events) => {
              if (events.length !== 1) return false;
              const event = events[0];
              return (
                event.type === valueReadContract.type &&
                event.to === valueReadContract.type &&
                event.source === incrementOrchestratorContract.type
              );
            },
          },
          {
            input: async (prev) => {
              await promiseTimeout();
              const valueReadEvent = prev![0];
              const result = await handlers.valueRead.execute(valueReadEvent, {
                inheritFrom: 'EVENT',
              });
              return result.events[0];
            },
            expectedEvents: (events) => {
              if (events.length !== 1) return false;
              const event = events[0];
              return (
                event.type === incrementContract.type &&
                event.to === incrementContract.type &&
                event.source === incrementOrchestratorContract.type &&
                event.data.init === 2 &&
                event.data.increment === 2
              );
            },
          },
          {
            input: async (prev) => {
              await promiseTimeout();
              const incrementEvent = prev![0];
              const result = await handlers.increment.execute(incrementEvent, {
                inheritFrom: 'EVENT',
              });
              return result.events[0];
            },
            expectedEvents: (events) => {
              if (events.length !== 1) return false;
              const event = events[0];
              return (
                event.type === incrementOrchestratorContract.metadata.completeEventType &&
                event.to === 'com.test.test' &&
                event.source === incrementOrchestratorContract.type &&
                event.data.success === true &&
                event.data.error.length === 0 &&
                event.data.final === 4
              );
            },
          },
        ],
      },
    ],
  };

  // Test suite for lock acquisition errors
  const lockAcquisitionSuite: ArvoTestSuite = {
    config: {
      name: 'Increment Orchestrator - Lock Acquisition',
      handler: handlers.incrementAgent,
    },
    cases: [
      {
        name: 'should throw error if lock not acquired',
        steps: [
          {
            input: async () => {
              const initEvent = createArvoOrchestratorEventFactory(
                incrementOrchestratorContract.version('0.0.1')
              ).init({
                source: 'com.test.test',
                data: {
                  key: 'test.key.lock',
                  modifier: 2,
                  trend: 'linear',
                  parentSubject$$: null,
                },
              });
              await machineMemory.lock(initEvent.subject);
              return initEvent;
            },
            expectedError: (error) =>
              error.message.includes('Lock acquisition denied - Unable to obtain exclusive access to event processing'),
          },
        ],
      },
    ],
  };

  // Test suite for contract validation errors
  const contractValidationSuite: ArvoTestSuite = {
    config: {
      name: 'Increment Orchestrator - Contract Validation',
      handler: handlers.incrementAgent,
    },
    cases: [
      {
        name: 'should throw error if contract unresolved',
        steps: [
          {
            input: () => {
              return createArvoOrchestratorEventFactory(
                incrementOrchestratorContract.version('0.0.1')
              ).init({
                source: 'com.test.test',
                data: {
                  key: 'test.key.contract',
                  modifier: 2,
                  trend: 'linear',
                  parentSubject$$: null,
                },
              });
            },
            expectedEvents: (events) => events.length === 1,
          },
          {
            input: (prev) => prev![0],
            expectedError: (error) =>
              error.message.includes('Contract validation failed - Event does not match any registered contract schemas in the machine'),
          },
        ],
      },
      {
        name: 'should throw error on invalid event data',
        steps: [
          {
            input: async () => {
              const initEvent = createArvoOrchestratorEventFactory(
                incrementOrchestratorContract.version('0.0.1')
              ).init({
                source: 'com.test.test',
                data: {
                  key: 'test.key.invalid',
                  modifier: 2,
                  trend: 'linear',
                  parentSubject$$: null,
                },
              });
              
              // First execute to get subject, then unlock for new test
              await handlers.incrementAgent.execute(initEvent, { inheritFrom: 'EVENT' });
              await machineMemory.unlock(initEvent.subject);
              
              return createArvoEvent({
                subject: initEvent.subject,
                source: 'com.test.test',
                type: 'evt.value.read.success',
                data: {
                  value: 'saad' as any,
                },
                dataschema: EventDataschemaUtil.create(valueReadContract.version('0.0.1')),
              });
            },
            expectedError: (error) =>
              error.message.includes('Input validation failed - Event data does not meet contract requirements'),
          },
        ],
      },
    ],
  };

  // Test suite for parentid support
  const parentIdSuite: ArvoTestSuite = {
    config: {
      name: 'Increment Orchestrator - ParentID Support',
      handler: handlers.incrementAgent,
    },
    cases: [
      {
        name: 'should set parentid correctly for orchestrator-emitted events',
        steps: [
          {
            input: () => {
              const initEvent = createArvoOrchestratorEventFactory(
                incrementOrchestratorContract.version('0.0.1')
              ).init({
                source: 'com.test.test',
                data: {
                  key: 'test.key.parentid',
                  modifier: 2,
                  trend: 'linear',
                  parentSubject$$: null,
                },
              });
              valueStore[initEvent.data.key] = 5;
              return initEvent;
            },
            expectedEvents: (events) => {
              if (events.length !== 1) return false;
              const event = events[0];
              return event.type === valueReadContract.type && event.parentid !== undefined;
            },
          },
          {
            input: async (prev) => {
              await promiseTimeout();
              const valueReadEvent = prev![0];
              const result = await handlers.valueRead.execute(valueReadEvent, {
                inheritFrom: 'EVENT',
              });
              return result.events[0];
            },
            expectedEvents: (events) => {
              if (events.length !== 1) return false;
              const event = events[0];
              return event.type === incrementContract.type && event.parentid !== undefined;
            }
          },
        ],
      },
    ],
  };

  // Run all test suites
  runArvoTestSuites(
    [
      validInitEventSuite,
      lockAcquisitionSuite,
      contractValidationSuite,
      parentIdSuite,
    ],
    { describe, test, beforeEach }
  );

  // Keep the nested orchestrator test as-is since it uses the broker pattern
  it('should conducting nested orchestrators', async () => {
    const { broker } = createSimpleEventBroker(Object.values(handlers));
    let finalEvent: ArvoEvent | null = null;
    broker.subscribe('com.test.test', async (event) => {
      finalEvent = event;
    });

    const initEvent = createArvoOrchestratorEventFactory(numberModifierOrchestratorContract.version('0.0.1')).init({
      source: 'com.test.test',
      data: {
        init: 1,
        modifier: 4,
        trend: 'linear',
        operation: 'decrement',
        parentSubject$$: null,
      },
    });

    await broker.publish(initEvent);
    expect(finalEvent).not.toBe(null);
    expect(finalEvent!.to).toBe('com.test.test');
    expect(finalEvent!.data.success).toBe(true);
    expect(finalEvent!.data.error.length).toBe(0);
    expect(finalEvent!.data.final).toBe(-3);
    expect(broker.events.length).toBe(
      1 + // Number modifier orchestrator init event
        1 + // Write event
        1 + // Sucess event for write
        1 + // Init decrement orchestrator event
        1 + // Notification event
        1 + // Read event
        1 + // Read success event
        1 + // Decrement event
        1 + // Decrement success event
        1 + // Decrement orchestrator completion event
        1, // Number modifier orchestrator completion event
    );

    expect(broker.events[0].type).toBe('arvo.orc.number.modifier');
    expect(broker.events[0].to).toBe('arvo.orc.number.modifier');

    expect(broker.events[1].type).toBe('com.value.write');
    expect(broker.events[1].to).toBe('com.value.write');
    expect(broker.events[1].subject).toBe(initEvent.subject);
    expect(broker.events[1].data.key).toBe(initEvent.subject);
    expect(broker.events[1].data.value).toBe(initEvent.data.init);

    expect(broker.events[3].type).toBe('arvo.orc.dec');
    expect(broker.events[3].data.parentSubject$$).toBe(initEvent.subject);
    expect(ArvoOrchestrationSubject.parse(broker.events[3].subject).orchestrator.name).toBe('arvo.orc.dec');
    expect(ArvoOrchestrationSubject.parse(broker.events[3].subject).orchestrator.version).toBe('0.0.1');
    expect(ArvoOrchestrationSubject.parse(broker.events[3].subject).execution.initiator).toBe(
      'arvo.orc.number.modifier',
    );

    const badEvent = createArvoEvent({
      source: 'com.test.test',
      subject: 'test',
      data: {},
      type: numberModifierOrchestratorContract.type,
    });
    expect(async () => {
      await handlers.numberModifierAgent.execute(badEvent, {
        inheritFrom: 'EVENT',
      });
    }).rejects.toThrow(
      `ViolationError<Execution> Invalid event (id=${badEvent.id}) subject format. Expected an ArvoOrchestrationSubject but received 'test'. The subject must follow the format specified by ArvoOrchestrationSubject schema`,
    );
  });

  // Keep remaining tests that don't fit the sequential step pattern
  it('should throw error on different mahines', () => {
    expect(() => {
      createArvoOrchestrator({
        executionunits: 0.1,
        memory: new SimpleMachineMemory(),
        machines: [
          ...(handlers.incrementAgent as ArvoOrchestrator).registry.machines,
          ...(handlers.decrementAgent as ArvoOrchestrator).registry.machines,
        ],
      });
    }).toThrow("All the machines in the orchestrator must have type 'arvo.orc.inc'");
  });

  it('should throw error on duplicate mahines', () => {
    expect(() => {
      createArvoOrchestrator({
        executionunits: 0.1,
        memory: new SimpleMachineMemory(),
        machines: [
          ...(handlers.incrementAgent as ArvoOrchestrator).registry.machines,
          ...(handlers.incrementAgent as ArvoOrchestrator).registry.machines,
        ],
      });
    }).toThrow(
      'An orchestrator must have unique machine versions. Machine ID:machineV001 has duplicate version 0.0.1.',
    );
  });

  it('should throw error on execute in case of faulty locking mechanism', async () => {
    const orchestrator = createArvoOrchestrator({
      executionunits: 0.1,
      memory: {
        read: async (id: string) => null,
        write: async (id: string, data: MachineMemoryRecord) => {},
        lock: async (id: string) => {
          throw new Error('Locking system failure!');
        },
        unlock: async (id: string) => true,
      },
      machines: [...(handlers.incrementAgent as ArvoOrchestrator).registry.machines],
    });

    const initEvent = createArvoOrchestratorEventFactory(incrementOrchestratorContract.version('0.0.1')).init({
      source: 'com.test.test',
      data: {
        parentSubject$$: null,
        key: 'test',
        modifier: 2,
        trend: 'linear',
      },
    });

    await expect(orchestrator.execute(initEvent)).rejects.toThrow(
      `Error acquiring lock for event (subject=${initEvent.subject}): Locking system failure!`,
    );
  });

  it('should throw error on execute in case of faulty reading locking mechanism', async () => {
    const orchestrator = createArvoOrchestrator({
      executionunits: 0.1,
      memory: {
        read: async (id: string) => {
          throw new Error('Failed to acquire memory');
        },
        write: async (id: string, data: MachineMemoryRecord) => {},
        lock: async (id: string) => true,
        unlock: async (id: string) => true,
      },
      machines: [...(handlers.incrementAgent as ArvoOrchestrator).registry.machines],
    });

    const initEvent = createArvoOrchestratorEventFactory(incrementOrchestratorContract.version('0.0.1')).init({
      source: 'com.test.test',
      data: {
        parentSubject$$: null,
        key: 'test',
        modifier: 2,
        trend: 'linear',
      },
    });

    await expect(orchestrator.execute(initEvent)).rejects.toThrow(
      `Error reading state for event (subject=${initEvent.subject}): Failed to acquire memory`,
    );
  });

  it('should throw error on execute in case of faulty writing locking mechanism', async () => {
    const orchestrator = createArvoOrchestrator({
      executionunits: 0.1,
      memory: {
        read: async (id: string) => null,
        write: async (id: string, data: MachineMemoryRecord) => {
          throw new Error('Failed to write memory');
        },
        lock: async (id: string) => true,
        unlock: async (id: string) => true,
      },
      machines: [...(handlers.incrementAgent as ArvoOrchestrator).registry.machines],
    });

    const initEvent = createArvoOrchestratorEventFactory(incrementOrchestratorContract.version('0.0.1')).init({
      source: 'com.test.test',
      data: {
        parentSubject$$: null,
        key: 'test',
        modifier: 2,
        trend: 'linear',
      },
    });

    await expect(orchestrator.execute(initEvent)).rejects.toThrow(
      `Error writing state for event (subject=${initEvent.subject}): Failed to write memory`,
    );
  });

  it('should redirect the completion event to a different location', async () => {
    const { broker } = createSimpleEventBroker(Object.values(handlers));
    let finalEventFromTest: ArvoEvent | null = null;
    let finalEventFromTest1: ArvoEvent | null = null;
    broker.subscribe('com.test.test', async (event) => {
      finalEventFromTest = event;
    });
    broker.subscribe('com.test.test.1', async (event) => {
      finalEventFromTest1 = event;
    });

    const initEvent = createArvoOrchestratorEventFactory(numberModifierOrchestratorContract.version('0.0.1')).init({
      source: 'com.test.test',
      data: {
        init: 1,
        modifier: 4,
        trend: 'linear',
        operation: 'decrement',
        parentSubject$$: null,
      },
      redirectto: 'com.test.test.1',
    });

    await broker.publish(initEvent);

    expect(broker.events.length).toBe(
      1 + // Number modifier orchestrator init event
        1 + // Write event
        1 + // Sucess event for write
        1 + // Init decrement orchestrator event
        1 + // Notification event
        1 + // Read event
        1 + // Read success event
        1 + // Decrement event
        1 + // Decrement success event
        1 + // Decrement orchestrator completion event
        1, // Number modifier orchestrator completion event
    );
    const state = await machineMemory.read(initEvent.subject);

    expect(state?.initEventId).toBe(initEvent.id);
    expect(initEvent.id).toBe(broker.events[broker.events.length - 1].parentid);
    expect(initEvent.id).not.toBe(broker.events[broker.events.length - 2].parentid);
    expect(finalEventFromTest).toBe(null);
    expect(finalEventFromTest1).not.toBe(null);
    expect(finalEventFromTest1!.to).toBe('com.test.test.1');
  });

  it('should throw error event in case of faulty parent subject', async () => {
    let brokerError: Error | null = null;
    const { broker } = createSimpleEventBroker(Object.values(handlers), {
      onError: (error) => {
        brokerError = error;
      },
    });
    let finalEventFromTest: ArvoEvent | null = null;
    broker.subscribe('com.test.test', async (event) => {
      finalEventFromTest = event;
    });

    const initEvent = createArvoOrchestratorEventFactory(numberModifierOrchestratorContract.version('0.0.2')).init({
      source: 'com.test.test',
      data: {
        init: 1,
        modifier: 4,
        trend: 'exponential',
        operation: 'decrement',
        parentSubject$$: null,
      },
      redirectto: 'com.test.test.1',
    });

    await broker.publish(initEvent);

    expect(broker.events.length).toBe(
      1 + // Number modifier orchestrator init event
        1 + // Write event
        1 + // Sucess event for write
        0, // Faulty parent subject will raise an ExecutionViolation
    );

    expect(finalEventFromTest).toBe(null);
    expect(brokerError).toBeDefined();
    expect((brokerError! as ExecutionViolation).name).toBe('ViolationError<Execution>');
    expect((brokerError! as ExecutionViolation).message).toBe(
      'ViolationError<Execution> [Emittable Event Creation] Invalid parentSubject$$ for the ' +
        "event(type='arvo.orc.dec', uri='#/test/orchestrator/decrement/0.0.2'). It must be follow " +
        'the ArvoOrchestrationSubject schema. The easiest way is to use the current orchestration ' +
        'subject by storing the subject via the context block in the machine definition.',
    );
  });

  it('should redirect the completion event to a different location', async () => {
    const { broker } = createSimpleEventBroker(Object.values(handlers));
    let finalEventFromTest: ArvoEvent | null = null;
    broker.subscribe('com.test.test', async (event) => {
      finalEventFromTest = event;
    });

    const initEvent = createArvoOrchestratorEventFactory(numberModifierOrchestratorContract.version('0.0.2')).init({
      source: 'com.test.test',
      data: {
        init: 1,
        modifier: 4,
        trend: 'exponential',
        operation: 'increment',
        parentSubject$$: null,
      },
    });

    await broker.publish(initEvent);
    expect(broker.events.length).toBe(
      1 + // Number modifier orchestrator init event
        1 + // Write event
        1 + // Sucess event for write
        1 + // Init increment orchestrator event
        1 + // Init increment orchestrator event with out parent subject
        1 + // Read event
        1 + // Read success event
        1 + // Increment event
        1 + // Increment success event 1
        1 + // Increment success event 2
        1 + // Increment orchestrator completion event
        1 + // Number modifier orchestrator completion event
        1 + // Read event
        1 + // Read success event
        1 + // Increment event
        1 + // Increment success event 1
        1 + // Increment success event 2
        1, // Increment orchestrator completion event
    );
    expect(finalEventFromTest).not.toBe(null);
    expect(finalEventFromTest!.to).toBe('com.test.test');
  });

  it('shoud not emit any event on a non init event with no state', async () => {
    const subject = ArvoOrchestrationSubject.new({
      initiator: 'com.test.test',
      orchestator: incrementOrchestratorContract.version('0.0.1').accepts.type,
      version: incrementOrchestratorContract.version('0.0.1').version,
    });

    const event = createArvoEventFactory(incrementContract.version('0.0.1')).emits({
      subject: subject,
      source: 'com.test.test',
      type: 'evt.increment.number.success',
      data: {
        result: 12,
      },
    });

    const events = await handlers.incrementAgent.execute(event, { inheritFrom: 'EVENT' });

    expect(events.events.length).toBe(0);
  });

  it('should have system error schema which is standard', () => {
    expect(handlers.decrementAgent.systemErrorSchema.type).toBe(decrementOrchestratorContract.systemError.type);
  });

  it('should throw violation if the event is looking for a different machine version', () => {
    const corruptSubject = ArvoOrchestrationSubject.new({
      orchestator: incrementOrchestratorContract.type,
      initiator: 'com.test.test',
      version: '1.0.0',
    });
    const event = createArvoOrchestratorEventFactory(incrementOrchestratorContract.version('0.0.1')).init({
      subject: corruptSubject,
      source: 'com.test.test',
      data: {
        modifier: 2,
        trend: 'linear',
        parentSubject$$: null,
        key: 'string',
      },
    });

    expect(() => handlers.incrementAgent.execute(event, { inheritFrom: 'EVENT' })).rejects.toThrow(
      "ViolationError<Config> Machine resolution failed: No machine found matching orchestrator name='arvo.orc.inc' and version='1.0.0'.",
    );
  });

  it('should throw error event on non violations. Such as when machine internally throws error', async () => {
    const someServiceEvent = createSimpleArvoContract({
      uri: '#/test/dumb/service',
      type: 'dumb.service',
      versions: {
        '1.0.0': {
          accepts: z.object({}),
          emits: z.object({}),
        },
      },
    });

    const dumbOrchestratorContract = createArvoOrchestratorContract({
      uri: '#/test/dumb',
      name: 'dumb',
      versions: {
        '1.0.0': {
          init: z.object({
            error_type: z.enum(['violation', 'normal']),
          }),
          complete: z.object({}),
        },
      },
    });

    const machineId = 'machineV100';
    const dumbMachine = setupArvoMachine({
      contracts: {
        self: dumbOrchestratorContract.version('1.0.0'),
        services: {
          someServiceEvent: someServiceEvent.version('1.0.0'),
        },
      },
      types: {
        context: {} as {
          error_type: 'violation' | 'normal';
        },
      },
      actions: {
        throwNormalError: () => {
          throw new Error('Normal error');
        },
        throwViolationError: () => {
          throw new ExecutionViolation('Violation error');
        },
      },
    }).createMachine({
      id: machineId,
      initial: 'router',
      context: ({ input }) => ({
        error_type: input.data.error_type,
      }),
      states: {
        router: {
          always: [
            {
              target: 'normal_error',
              guard: ({ context }) => context.error_type === 'normal',
            },
            {
              target: 'violation_error',
              guard: ({ context }) => context.error_type === 'violation',
            },
            {
              target: 'done',
            },
          ],
        },
        normal_error: {
          entry: { type: 'throwNormalError' },
          always: {
            target: 'error',
          },
        },
        violation_error: {
          entry: { type: 'throwViolationError' },
          always: {
            target: 'done',
          },
        },
        done: {
          type: 'final',
        },
        error: {
          on: {
            '*': {
              actions: xstate.emit({
                type: 'com.dumb.service',
                data: {},
              }),
              target: 'error',
            },
          },
        },
      },
    });
    const dumbOrchestrator = createArvoOrchestrator({
      executionunits: 1,
      memory: machineMemory,
      machines: [dumbMachine],
    });

    let event = createArvoEventFactory(dumbOrchestratorContract.version('1.0.0')).accepts({
      source: 'com.test.test',
      data: {
        parentSubject$$: null,
        error_type: 'normal' as const,
      },
    });

    const results = await dumbOrchestrator.execute(event);

    expect(results.events.length).toBe(1);
    expect(results.events[0].type).toBe(dumbOrchestratorContract.systemError.type);
    expect(results.events[0].data.errorMessage).toBe('Normal error');
    expect(results.events[0].to).toBe('com.test.test');

    const reresults = await dumbOrchestrator.execute(
      createArvoEventFactory(someServiceEvent.version('1.0.0')).emits({
        subject: results.events[0].subject,
        source: 'test.test.test',
        type: 'evt.dumb.service.success',
        data: {},
      }),
    );

    expect(reresults.events.length).toBe(0);

    event = createArvoEventFactory(dumbOrchestratorContract.version('1.0.0')).accepts({
      source: 'com.test.test',
      data: {
        parentSubject$$: null,
        error_type: 'violation' as const,
      },
    });

    await expect(() => dumbOrchestrator.execute(event)).rejects.toThrow('ViolationError<Execution> Violation error');
    expect((await machineMemory.read(event.subject))?.executionStatus).toBe(undefined);
  });
});