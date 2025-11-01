import { trace } from '@opentelemetry/api';
import {
  ArvoErrorSchema,
  EventDataschemaUtil,
  createArvoContract,
  createArvoEvent,
  createArvoEventFactory,
  currentOpenTelemetryHeaders,
} from 'arvo-core';
import { z } from 'zod';
import {
  ArvoDomain,
  type ArvoEventHandlerFunction,
  ArvoTestSuite,
  ExecutionViolation,
  IArvoTestFramework,
  createArvoEventHandler,
  runArvoTestSuites,
} from '../../src';
import { telemetrySdkStart, telemetrySdkStop } from '../utils';
runArvoTestSuites

const jestAdapter: IArvoTestFramework = {
  describe,
  test,
  beforeEach,
};

describe('ArvoEventHandler', () => {
  beforeAll(() => {
    telemetrySdkStart();
  });

  afterAll(() => {
    telemetrySdkStop();
  });

  const mockContract = createArvoContract({
    uri: '#/test/ArvoEventHandler',
    type: 'com.hello.world',
    versions: {
      '0.0.1': {
        accepts: z.object({
          name: z.string(),
          age: z.number(),
        }),
        emits: {
          'evt.hello.world.success': z.object({
            result: z.string(),
          }),
          'evt.hello.world.error': ArvoErrorSchema,
        },
      },
    },
  });

  const mockEvent = createArvoEventFactory(mockContract.version('0.0.1')).accepts({
    to: 'com.hello.world',
    source: 'com.test.env',
    subject: 'test-subject',
    data: {
      name: 'Saad Ahmad',
      age: 26,
    },
  });

  const mockHandlerFunction: ArvoEventHandlerFunction<typeof mockContract> = {
    '0.0.1': async ({ event }) => {
      return {
        type: 'evt.hello.world.success',
        data: {
          result: `My name is ${event.data.name}. I am ${event.data.age} years old`,
        },
      };
    },
  };

  const testSuites: ArvoTestSuite[] = [
    {
      config: {
        name: 'Basic Handler Tests',
        handler: createArvoEventHandler({
          contract: mockContract,
          executionunits: 100,
          handler: mockHandlerFunction,
        }),
      },
      cases: [
        {
          name: 'should create an instance with default source',
          steps: [
            {
              input: () => mockEvent,
              expectedEvents: (events) => {
                const handler = createArvoEventHandler({
                  contract: mockContract,
                  executionunits: 100,
                  handler: mockHandlerFunction,
                });
                expect(handler.source).toBe(mockContract.type);
                return events.length > 0;
              },
            },
          ],
        },
        {
          name: 'should execute handler successfully',
          steps: [
            {
              input: () => mockEvent,
              expectedEvents: (events) => events.length > 0,
            },
          ],
        },
        {
          name: 'should execute handler successfully with event domain to null by default',
          steps: [
            {
              input: () =>
                createArvoEventFactory(mockContract.version('0.0.1')).accepts({
                  to: 'com.hello.world',
                  source: 'com.test.env',
                  subject: 'test-subject',
                  domain: 'test.test',
                  data: {
                    name: 'Saad Ahmad',
                    age: 26,
                  },
                }),
              expectedEvents: (events) => {
                expect(events[0].domain).toBe(null);
                return true;
              },
            },
          ],
        },
      ],
    },
    {
      config: {
        name: 'Domain Override Tests',
        handler: createArvoEventHandler({
          contract: mockContract,
          executionunits: 100,
          handler: {
            '0.0.1': async ({ event }) => {
              return {
                domain: ['test', 'notification'],
                type: 'evt.hello.world.success',
                data: {
                  result: `My name is ${event.data.name}. I am ${event.data.age} years old`,
                },
              };
            },
          },
        }),
      },
      cases: [
        {
          name: 'should execute handler successfully with event domain handler override',
          steps: [
            {
              input: () =>
                createArvoEventFactory(mockContract.version('0.0.1')).accepts({
                  to: 'com.hello.world',
                  source: 'com.test.env',
                  subject: 'test-subject',
                  domain: 'test.test',
                  data: {
                    name: 'Saad Ahmad',
                    age: 26,
                  },
                }),
              expectedEvents: (events) => {
                expect(events.length).toBe(2);
                expect(events[0].domain).toBe('test');
                expect(events[1].domain).toBe('notification');
                return true;
              },
            },
          ],
        },
      ],
    },
    {
      config: {
        name: 'Explicit Null Domain Tests',
        handler: createArvoEventHandler({
          contract: mockContract,
          executionunits: 100,
          handler: {
            '0.0.1': async ({ event }) => {
              return {
                domain: [null, null, ArvoDomain.FROM_SELF_CONTRACT],
                type: 'evt.hello.world.success',
                data: {
                  result: `My name is ${event.data.name}. I am ${event.data.age} years old`,
                },
              };
            },
          },
        }),
      },
      cases: [
        {
          name: 'should execute handler successfully with event domain explicit null',
          steps: [
            {
              input: () =>
                createArvoEventFactory(mockContract.version('0.0.1')).accepts({
                  to: 'com.hello.world',
                  source: 'com.test.env',
                  subject: 'test-subject',
                  domain: null,
                  data: {
                    name: 'Saad Ahmad',
                    age: 26,
                  },
                }),
              expectedEvents: (events) => {
                expect(events.length).toBe(1);
                expect(events[0].domain).toBe(null);
                return true;
              },
            },
          ],
        },
      ],
    },
    {
      config: {
        name: 'Contract Domain Inheritance Tests',
        handler: createArvoEventHandler({
          contract: createArvoContract({
            uri: '#/test/ArvoEventHandler',
            type: 'com.hello.world',
            domain: 'test.3333',
            versions: {
              '0.0.1': {
                accepts: z.object({
                  name: z.string(),
                  age: z.number(),
                }),
                emits: {
                  'evt.hello.world.success': z.object({
                    result: z.string(),
                  }),
                  'evt.hello.world.error': ArvoErrorSchema,
                },
              },
            },
          }),
          executionunits: 100,
          handler: {
            '0.0.1': async ({ event }) => {
              return {
                type: 'evt.hello.world.success',
                domain: [ArvoDomain.FROM_SELF_CONTRACT, ArvoDomain.FROM_TRIGGERING_EVENT],
                data: {
                  result: `My name is ${event.data.name}. I am ${event.data.age} years old`,
                },
              };
            },
          },
        }),
      },
      cases: [
        {
          name: 'should execute handler successfully with event domain inherited from contract',
          steps: [
            {
              input: () =>
                createArvoEventFactory(mockContract.version('0.0.1')).accepts({
                  to: 'com.hello.world',
                  source: 'com.test.env',
                  subject: 'test-subject',
                  domain: null,
                  data: {
                    name: 'Saad Ahmad',
                    age: 26,
                  },
                }),
              expectedEvents: (events) => {
                expect(events.length).toBe(2);
                expect(events[0].domain).toBe('test.3333');
                expect(events[1].domain).toBe(null);
                return true;
              },
            },
          ],
        },
      ],
    },
    {
      config: {
        name: 'All Domains Tests',
        handler: createArvoEventHandler({
          contract: createArvoContract({
            uri: '#/test/ArvoEventHandler',
            type: 'com.hello.world',
            domain: 'test.3333',
            versions: {
              '0.0.1': {
                accepts: z.object({
                  name: z.string(),
                  age: z.number(),
                }),
                emits: {
                  'evt.hello.world.success': z.object({
                    result: z.string(),
                  }),
                  'evt.hello.world.error': ArvoErrorSchema,
                },
              },
            },
          }),
          executionunits: 100,
          handler: {
            '0.0.1': async ({ event }) => {
              return {
                id: {
                  deduplication: 'DEVELOPER_MANAGED',
                  value: 'custom-id',
                },
                type: 'evt.hello.world.success',
                domain: [
                  null,
                  ArvoDomain.FROM_SELF_CONTRACT,
                  ArvoDomain.FROM_EVENT_CONTRACT,
                  ArvoDomain.FROM_TRIGGERING_EVENT,
                  'test.3',
                ],
                data: {
                  result: `My name is ${event.data.name}. I am ${event.data.age} years old`,
                },
              };
            },
          },
        }),
      },
      cases: [
        {
          name: 'should execute handler successfully with all domains',
          steps: [
            {
              input: () =>
                createArvoEventFactory(mockContract.version('0.0.1')).accepts({
                  to: 'com.hello.world',
                  source: 'com.test.env',
                  subject: 'test-subject',
                  domain: 'test.1',
                  data: {
                    name: 'Saad Ahmad',
                    age: 26,
                  },
                }),
              expectedEvents: (events) => {
                expect(events.length).toBe(4);
                expect(events[0].id).toBe('custom-id');
                expect(events[0].domain).toBe(null);
                expect(events[1].id).toBe('custom-id');
                expect(events[1].domain).toBe('test.3333');
                expect(events[2].id).toBe('custom-id');
                expect(events[2].domain).toBe('test.1');
                expect(events[3].id).toBe('custom-id');
                expect(events[3].domain).toBe('test.3');
                return true;
              },
            },
          ],
        },
      ],
    },
    {
      config: {
        name: 'Error Domain Tests - Contract and Event',
        handler: createArvoEventHandler({
          contract: createArvoContract({
            uri: '#/test/ArvoEventHandler',
            type: 'com.hello.world',
            domain: 'test.3333',
            versions: {
              '0.0.1': {
                accepts: z.object({
                  name: z.string(),
                  age: z.number(),
                }),
                emits: {
                  'evt.hello.world.success': z.object({
                    result: z.string(),
                  }),
                  'evt.hello.world.error': ArvoErrorSchema,
                },
              },
            },
          }),
          executionunits: 100,
          handler: {
            '0.0.1': async ({ event }) => {
              throw new Error('some error');
            },
          },
        }),
      },
      cases: [
        {
          name: 'should handle error domains for contract, event and null',
          steps: [
            {
              input: () =>
                createArvoEventFactory(mockContract.version('0.0.1')).accepts({
                  to: 'com.hello.world',
                  source: 'com.test.env',
                  subject: 'test-subject',
                  domain: 'test.1',
                  data: {
                    name: 'Saad Ahmad',
                    age: 26,
                  },
                }),
              expectedEvents: (events) => {
                expect(events.length).toBe(3);
                expect(events[0].domain).toBe('test.1');
                expect(events[1].domain).toBe('test.3333');
                expect(events[2].domain).toBe(null);
                return events.every((e) => e.parentid);
              },
            },
          ],
        },
      ],
    },
    {
      config: {
        name: 'Error Domain Tests - Event and Null',
        handler: createArvoEventHandler({
          contract: mockContract,
          executionunits: 100,
          handler: {
            '0.0.1': async ({ event }) => {
              throw new Error('some error');
            },
          },
        }),
      },
      cases: [
        {
          name: 'should handle error domains for event and null (with event domain)',
          steps: [
            {
              input: () =>
                createArvoEventFactory(mockContract.version('0.0.1')).accepts({
                  to: 'com.hello.world',
                  source: 'com.test.env',
                  subject: 'test-subject',
                  domain: 'test.1',
                  data: {
                    name: 'Saad Ahmad',
                    age: 26,
                  },
                }),
              expectedEvents: (events) => {
                expect(events.length).toBe(2);
                expect(events[0].domain).toBe('test.1');
                expect(events[1].domain).toBe(null);
                return true;
              },
            },
          ],
        },
        {
          name: 'should handle error domains for null only (without event domain)',
          steps: [
            {
              input: () =>
                createArvoEventFactory(mockContract.version('0.0.1')).accepts({
                  to: 'com.hello.world',
                  source: 'com.test.env',
                  subject: 'test-subject',
                  data: {
                    name: 'Saad Ahmad',
                    age: 26,
                  },
                }),
              expectedEvents: (events) => {
                expect(events.length).toBe(1);
                expect(events[0].domain).toBe(null);
                return events[0].parentid !== undefined;
              },
            },
          ],
        },
      ],
    },
  ];

  runArvoTestSuites(testSuites, jestAdapter);

  it('should handle validation error', async () => {
    const handler = createArvoEventHandler({
      contract: mockContract,
      executionunits: 100,
      handler: mockHandlerFunction,
    });

    await expect(
      handler.execute(
        createArvoEvent({
          type: 'com.saad.invalid.test',
          source: 'test',
          subject: 'test',
          to: 'com.saad.exe',
          data: {
            name: 'saad',
          },
        }) as any,
      ),
    ).rejects.toThrow("Event type mismatch: Received 'com.saad.invalid.test', expected 'com.hello.world'");
  });

  it('should handle handler error', async () => {
    const tracer = trace.getTracer('test-tracer');
    await tracer.startActiveSpan('test', async (span) => {
      const otelHeaders = currentOpenTelemetryHeaders();
      const mockEvent = createArvoEventFactory(mockContract.version('0.0.1')).accepts({
        to: 'com.hello.world',
        source: 'com.test.env',
        subject: 'test-subject',
        data: {
          name: 'Saad',
          age: 10,
        },
        traceparent: otelHeaders.traceparent ?? undefined,
        tracestate: otelHeaders.tracestate ?? undefined,
      });
      const handler = createArvoEventHandler({
        contract: mockContract,
        executionunits: 100,
        handler: {
          '0.0.1': async () => {
            throw new Error('Test error');
          },
        },
      });
      const result = await handler.execute(mockEvent);
      expect(result.events).toBeDefined();
      expect(result.events[0].subject).toBe(mockEvent.subject);
      expect(result.events[0].type).toBe('sys.com.hello.world.error');
      expect(result.events[0].data.errorMessage).toBe('Test error');
      span.end();
    });
  });

  it('should throw Execution error which are supposed to be thrown', async () => {
    const tracer = trace.getTracer('test-tracer');
    await tracer.startActiveSpan('test', async (span) => {
      const otelHeaders = currentOpenTelemetryHeaders();
      const mockEvent = createArvoEventFactory(mockContract.version('0.0.1')).accepts({
        to: 'com.hello.world',
        source: 'com.test.env',
        subject: 'test-subject',
        data: {
          name: 'Saad',
          age: 10,
        },
        traceparent: otelHeaders.traceparent ?? undefined,
        tracestate: otelHeaders.tracestate ?? undefined,
      });
      const handler = createArvoEventHandler({
        contract: mockContract,
        executionunits: 100,
        handler: {
          '0.0.1': async () => {
            throw new ExecutionViolation('Test error');
          },
        },
      });

      await expect(handler.execute(mockEvent)).rejects.toThrow('Test error');

      span.end();
    });
  });

  it('should validate the input and throw error on invalid', async () => {
    const tracer = trace.getTracer('test-tracer');
    await tracer.startActiveSpan('test', async (span) => {
      const otelHeaders = currentOpenTelemetryHeaders();
      const mockEvent = createArvoEvent({
        type: 'com.hello.world',
        to: 'com.hello.world',
        source: 'com.test.env',
        subject: 'test-subject',
        data: {
          name: 'Saad',
        },
        traceparent: otelHeaders.traceparent ?? undefined,
        tracestate: otelHeaders.tracestate ?? undefined,
      });
      const handler = createArvoEventHandler({
        contract: mockContract,
        executionunits: 100,
        handler: {
          '0.0.1': async () => {},
        },
      });

      await expect(handler.execute(mockEvent)).rejects.toThrow(
        'ViolationError<Contract> Input event payload validation failed:',
      );

      span.end();
    });
  });

  it('should use custom executionunits if provided in handler result', async () => {
    const handler = createArvoEventHandler({
      contract: mockContract,
      executionunits: 100,
      handler: {
        '0.0.1': async ({ event }) => {
          return [
            {
              type: 'evt.hello.world.success',
              data: {
                result: `My name is ${event.data.name}. I am ${event.data.age} years old`,
              },
              executionunits: 200,
            },
            {
              type: 'evt.hello.world.success',
              data: {
                result: `My name is ${event.data.name}. I am ${event.data.age} years old`,
              },
              executionunits: 500,
            },
          ];
        },
      },
    });
    const result = await handler.execute(mockEvent);
    expect(result.events[0].executionunits).toBe(200);
    expect(result.events[1].executionunits).toBe(500);
  });

  it('should allow to discover the system error message', () => {
    const handler = createArvoEventHandler({
      contract: mockContract,
      executionunits: 100,
      handler: mockHandlerFunction,
    });

    expect(handler.systemErrorSchema.type).toBe(`sys.${handler.contract.type}.error`);
  });

  it('should not return any output if the handler does not', async () => {
    const handler = createArvoEventHandler({
      contract: mockContract,
      executionunits: 100,
      handler: {
        '0.0.1': async () => {},
      },
    });

    const { events } = await handler.execute(mockEvent);
    expect(events.length).toBe(0);
  });

  it('should handle multiple contract versions', () => {
    const multiVersionContract = createArvoContract({
      uri: '#/test/MultiVersion',
      type: 'com.hello.world',
      versions: {
        '0.0.1': {
          accepts: z.object({
            name: z.string(),
          }),
          emits: {
            'evt.hello.success': z.object({ result: z.string() }),
          },
        },
        '0.0.2': {
          accepts: z.object({
            name: z.string(),
            title: z.string(),
          }),
          emits: {
            'evt.hello.success': z.object({ result: z.string() }),
          },
        },
      },
    });

    const handler = createArvoEventHandler({
      contract: multiVersionContract,
      executionunits: 100,
      handler: {
        '0.0.1': async ({ event }) => ({
          type: 'evt.hello.success',
          data: { result: `Hello ${event.data.name}` },
        }),
        '0.0.2': async ({ event }) => ({
          type: 'evt.hello.success',
          data: { result: `Hello ${event.data.title} ${event.data.name}` },
        }),
      },
    });

    expect(handler).toBeDefined();
  });

  it('should throw error when handler implementation is missing for a version', () => {
    const contract = createArvoContract({
      uri: '#/test/Missing',
      type: 'com.hello.world',
      versions: {
        '0.0.1': {
          accepts: z.object({ name: z.string() }),
          emits: {
            'evt.hello.success': z.object({ result: z.string() }),
          },
        },
        '0.0.2': {
          accepts: z.object({ name: z.string() }),
          emits: {
            'evt.hello.success': z.object({ result: z.string() }),
          },
        },
      },
    });

    expect(() =>
      createArvoEventHandler({
        contract,
        executionunits: 100,
        // @ts-ignore
        handler: {
          '0.0.1': async () => ({
            type: 'evt.hello.success',
            data: { result: 'hello' },
          }),
          // Missing 0.0.2 handler
        },
      }),
    ).toThrow(/requires handler implementation/);
  });

  it('should handle events with dataschema version specification', async () => {
    const eventWithSchema = createArvoEvent({
      type: 'com.hello.world',
      source: 'test',
      subject: 'test',
      to: 'com.hello.world',
      dataschema: '#/test/ArvoEventHandler/0.0.1',
      data: {
        name: 'Test',
        age: 25,
      },
    });

    const handler = createArvoEventHandler({
      contract: mockContract,
      executionunits: 100,
      handler: mockHandlerFunction,
    });

    const result = await handler.execute(eventWithSchema);
    expect(result.events[0].type).toBe('evt.hello.world.success');
  });

  it('should reject events with mismatched contract URI in dataschema', async () => {
    const eventWithWrongSchema = createArvoEvent({
      type: 'com.hello.world',
      source: 'test',
      subject: 'test',
      to: 'com.hello.world',
      dataschema: '#/wrong/contract/0.0.1',
      data: {
        name: 'Test',
        age: 25,
      },
    });

    const handler = createArvoEventHandler({
      contract: mockContract,
      executionunits: 100,
      handler: mockHandlerFunction,
    });

    await expect(handler.execute(eventWithWrongSchema)).rejects.toThrow(
      `Contract URI mismatch: Handler expects '#/test/ArvoEventHandler' but event dataschema specifies '#/wrong/contract/0.0.1'. Events must reference the same contract URI as their handler.`,
    );
  });

  it('should support custom span options', async () => {
    const customSpanOptions = {
      attributes: {
        'custom.attribute': 'test-value',
      },
    };

    const handler = createArvoEventHandler({
      contract: mockContract,
      executionunits: 100,
      handler: mockHandlerFunction,
      spanOptions: customSpanOptions,
    });

    expect(handler.spanOptions.attributes?.['custom.attribute']).toBe('test-value');
    const result = await handler.execute(mockEvent);
    expect(result.events[0].type).toBe('evt.hello.world.success');
  });

  it('should handle single output as non-array', async () => {
    const handler = createArvoEventHandler({
      contract: mockContract,
      executionunits: 100,
      handler: {
        '0.0.1': async ({ event }) => ({
          type: 'evt.hello.world.success',
          data: {
            result: `Single output for ${event.data.name}`,
          },
        }),
      },
    });

    const result = await handler.execute(mockEvent);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('evt.hello.world.success');
  });

  it('should throw contract violation error on invalid event data', async () => {
    const handler = createArvoEventHandler({
      contract: mockContract,
      executionunits: 100,
      handler: {
        '0.0.1': async ({ event }) => ({
          type: 'evt.hello.world.success',
          data: {
            result: `Single output for ${event.data.name}`,
          },
        }),
      },
    });

    const invalidMockEvent = createArvoEvent({
      subject: 'test-subject',
      source: 'com.test.test',
      type: 'com.hello.world',
      dataschema: EventDataschemaUtil.create(mockContract.version('0.0.1')),
      data: {
        input: 2,
      },
    });

    await expect(handler.execute(invalidMockEvent)).rejects.toThrow('ViolationError<Contract>');
  });

  it('should throw config violation error on invalid event dataschema version', async () => {
    const handler = createArvoEventHandler({
      contract: mockContract,
      executionunits: 100,
      handler: {
        '0.0.1': async ({ event }) => ({
          type: 'evt.hello.world.success',
          data: {
            result: `Single output for ${event.data.name}`,
          },
        }),
      },
    });

    const invalidMockEvent = createArvoEvent({
      subject: 'test-subject',
      source: 'com.test.test',
      type: 'com.hello.world',
      dataschema: `${mockContract.uri}/0.0.2`,
      data: {
        input: 2,
      },
    });

    await expect(handler.execute(invalidMockEvent)).rejects.toThrow('ViolationError<Config>');
  });

  it('should throw contract violation error on invalid event emission', async () => {
    const handler = createArvoEventHandler({
      contract: mockContract,
      executionunits: 100,
      handler: {
        '0.0.1': async ({ event }) => ({
          type: 'evt.hello.world.success',
          data: {
            result: 2 as any,
          },
        }),
      },
    });

    await expect(handler.execute(mockEvent)).rejects.toThrow('ViolationError<Contract>');
  });

  describe('parentid support', () => {
    const parentIdTestSuites: ArvoTestSuite[] = [
      {
        config: {
          name: 'ParentId Preservation Tests',
          handler: createArvoEventHandler({
            contract: mockContract,
            executionunits: 100,
            handler: mockHandlerFunction,
          }),
        },
        cases: [
          {
            name: 'should preserve parentid from input event to output events',
            steps: [
              {
                input: () =>
                  createArvoEventFactory(mockContract.version('0.0.1')).accepts({
                    to: 'com.hello.world',
                    source: 'com.test.env',
                    subject: 'test-subject',
                    data: {
                      name: 'Saad Ahmad',
                      age: 26,
                    },
                  }),
                expectedEvents: (events) => {
                  return events.every((e) => e.parentid !== undefined);
                },
              },
            ],
          },
        ],
      },
      {
        config: {
          name: 'ParentId Error Tests',
          handler: createArvoEventHandler({
            contract: mockContract,
            executionunits: 100,
            handler: {
              '0.0.1': async () => {
                throw new Error('Test error');
              },
            },
          }),
        },
        cases: [
          {
            name: 'should handle parentid in system error events',
            steps: [
              {
                input: () =>
                  createArvoEventFactory(mockContract.version('0.0.1')).accepts({
                    to: 'com.hello.world',
                    source: 'com.test.env',
                    subject: 'test-subject',
                    data: {
                      name: 'Saad',
                      age: 10,
                    },
                  }),
                expectedEvents: (events) => {
                  expect(events[0].type).toBe('sys.com.hello.world.error');
                  return events[0].parentid !== undefined;
                },
              },
            ],
          },
        ],
      },
      {
        config: {
          name: 'ParentId Multiple Output Tests',
          handler: createArvoEventHandler({
            contract: mockContract,
            executionunits: 100,
            handler: {
              '0.0.1': async ({ event }) => [
                {
                  type: 'evt.hello.world.success',
                  data: {
                    result: `First output for ${event.data.name}`,
                  },
                },
                {
                  type: 'evt.hello.world.success',
                  data: {
                    result: `Second output for ${event.data.name}`,
                  },
                },
              ],
            },
          }),
        },
        cases: [
          {
            name: 'should handle parentid in multiple output events',
            steps: [
              {
                input: () =>
                  createArvoEventFactory(mockContract.version('0.0.1')).accepts({
                    to: 'com.hello.world',
                    source: 'com.test.env',
                    subject: 'test-subject',
                    data: {
                      name: 'Saad Ahmad',
                      age: 26,
                    },
                  }),
                expectedEvents: (events) => {
                  expect(events).toHaveLength(2);
                  return events.every((e) => e.parentid !== undefined);
                },
              },
            ],
          },
        ],
      },
      {
        config: {
          name: 'ParentId Override Prevention Tests',
          handler: createArvoEventHandler({
            contract: mockContract,
            executionunits: 100,
            handler: {
              '0.0.1': async ({ event }) => ({
                type: 'evt.hello.world.success',
                parentid: 'custom-parent-override',
                data: {
                  result: `Custom parentid for ${event.data.name}`,
                },
              }),
            },
          }),
        },
        cases: [
          {
            name: 'should not allow handler to override parentid in output events',
            steps: [
              {
                input: () =>
                  createArvoEventFactory(mockContract.version('0.0.1')).accepts({
                    to: 'com.hello.world',
                    source: 'com.test.env',
                    subject: 'test-subject',
                    data: {
                      name: 'Saad Ahmad',
                      age: 26,
                    },
                  }),
                expectedEvents: (events) => {
                  return events[0].parentid !== 'custom-parent-override';
                },
              },
            ],
          },
        ],
      },
      {
        config: {
          name: 'ParentId OpenTelemetry Tests',
          handler: createArvoEventHandler({
            contract: mockContract,
            executionunits: 100,
            handler: mockHandlerFunction,
          }),
        },
        cases: [
          {
            name: 'should include parentid in OpenTelemetry attributes for handler execution',
            steps: [
              {
                input: () =>
                  createArvoEventFactory(mockContract.version('0.0.1')).accepts({
                    to: 'com.hello.world',
                    source: 'com.test.env',
                    subject: 'test-subject',
                    data: {
                      name: 'Saad Ahmad',
                      age: 26,
                    },
                  }),
                expectedEvents: (events) => {
                  const otelAttributes = events[0].otelAttributes;
                  return otelAttributes['cloudevents.arvo.event_parentid'] !== undefined;
                },
              },
            ],
          },
        ],
      },
    ];

    runArvoTestSuites(parentIdTestSuites, jestAdapter);
  });
});