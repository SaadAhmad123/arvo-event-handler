import {
  ArvoErrorSchema,
  createArvoContract,
  createArvoEvent,
  createArvoEventFactory,
  currentOpenTelemetryHeaders,
} from 'arvo-core';
import { telemetrySdkStart, telemetrySdkStop } from '../utils';
import { z } from 'zod';
import {
  ArvoEventHandler,
  ArvoEventHandlerFunction,
  createArvoEventHandler,
} from '../../src';
import { trace } from '@opentelemetry/api';

describe('ArvoEventHandler', () => {

  beforeAll(() => {
    telemetrySdkStart();
  });

  afterAll(() => {
    telemetrySdkStop();
  });

  const mockContract = createArvoContract({
    uri: '#/test/ArvoEventHandler',
    accepts: {
      type: 'com.hello.world',
      schema: z.object({
        name: z.string(),
        age: z.number(),
      }),
    },
    emits: {
      'evt.hello.world.success': z.object({
        result: z.string(),
      }),
      'evt.hello.world.error': ArvoErrorSchema,
    },
  });

  const mockEvent = createArvoEventFactory(mockContract).accepts({
    to: 'com.hello.world',
    source: 'com.test.env',
    subject: 'test-subject',
    data: {
      name: 'Saad Ahmad',
      age: 26,
    },
  });

  const mockHandlerFunction: ArvoEventHandlerFunction<
    typeof mockContract
  > = async ({ event }) => {
    return {
      type: 'evt.hello.world.success',
      data: {
        result: `My name is ${event.data.name}. I am ${event.data.age} years old`,
      },
    };
  };
  

  it('should create an instance with default source', () => {
    const handler = new ArvoEventHandler({
      contract: mockContract,
      executionunits: 100,
      handler: mockHandlerFunction,
    });
    expect(handler.source).toBe(mockContract.accepts.type);
  });

  it('should create an instance with custom source', () => {
    const handler = new ArvoEventHandler({
      contract: mockContract,
      executionunits: 100,
      handler: mockHandlerFunction,
      source: 'custom-source',
    });
    expect(handler.source).toBe('custom-source');
  });

  it('should throw an error for invalid source', () => {
    expect(() => {
      new ArvoEventHandler({
        contract: mockContract,
        executionunits: 100,
        handler: mockHandlerFunction,
        source: 'test source with spaces',
      });
    }).toThrow("The provided 'source' is not a valid string");
  });

  it('should execute handler successfully', async () => {
    const handler = new ArvoEventHandler({
      contract: mockContract,
      executionunits: 100,
      handler: mockHandlerFunction,
    });

    const result = await handler.execute(mockEvent);
    expect(result).toBeDefined();
  });

  it('should handle validation error', async () => {
    const handler = new ArvoEventHandler({
      contract: mockContract,
      executionunits: 100,
      handler: mockHandlerFunction,
    });

    const result = await handler.execute(
      createArvoEvent({
        type: 'com.saad.invalid.test',
        source: 'test',
        subject: 'test',
        to: 'com.saad.exe',
        data: {
          name: 'saad',
        },
      }) as any,
    );

    expect(result[0]).toBeDefined();
    expect(result[0].executionunits).toBe(100);
    expect(result[0].type).toBe('sys.com.hello.world.error');
    expect(result[0].data.errorMessage).toBe(
      'Accept type "com.saad.invalid.test" not found in contract',
    );
  });

  it('should handle handler error', async () => {
    const tracer = trace.getTracer('test-tracer')
    await tracer.startActiveSpan('test', async (span) => {
      const otelHeaders = currentOpenTelemetryHeaders()
      const mockEvent = createArvoEventFactory(mockContract).accepts({
        to: 'com.hello.world',
        source: 'com.test.env',
        subject: 'test-subject',
        data: {
          name: "Saad",
          age: 10,
        },
        traceparent: otelHeaders.traceparent || undefined,
        tracestate: otelHeaders.tracestate || undefined,
      })
      const handler = new ArvoEventHandler({
        contract: mockContract,
        executionunits: 100,
        handler: async () => {
          throw new Error('Test error');
        },
      });
      const result = await handler.execute(mockEvent);
      expect(result).toBeDefined();
      expect(result[0].type).toBe('sys.com.hello.world.error');
      expect(result[0].data.errorMessage).toBe('Test error');
      span.end()
    })
  });

  it('should validate the input and throw error on invalid', async () => {
    const tracer = trace.getTracer('test-tracer')
    await tracer.startActiveSpan('test', async (span) => {
      const otelHeaders = currentOpenTelemetryHeaders()
      const mockEvent = createArvoEvent({
        type: 'com.hello.world',
        to: 'com.hello.world',
        source: 'com.test.env',
        subject: 'test-subject',
        data: {
          name: "Saad",
        },
        traceparent: otelHeaders.traceparent || undefined,
        tracestate: otelHeaders.tracestate || undefined,
      })
      const handler = new ArvoEventHandler({
        contract: mockContract,
        executionunits: 100,
        handler: async () => {},
      });
      // @ts-ignore
      const result = await handler.execute(mockEvent);
      expect(result).toBeDefined();
      expect(result[0].type).toBe('sys.com.hello.world.error');
      expect(result[0].data.errorMessage.includes("Invalid event payload")).toBe(true);
      
      const inputTraceparent = otelHeaders.traceparent?.split('-')?.[1]
      const outputTraceparent = result[0].traceparent?.split('-')?.[1]
      const inputTraceId = otelHeaders.traceparent?.split('-')?.[2]
      const outputTraceId = result[0].traceparent?.split('-')?.[2]
      
      if (process.env.ENABLE_OTEL === "TRUE") {
        expect(inputTraceparent).toBeDefined()
        expect(outputTraceparent).toBeDefined()
        expect(inputTraceparent).toBe(outputTraceparent)
        expect(inputTraceId).not.toBe(outputTraceId)
      }
      span.end()
    })
  });

  it('should use custom executionunits if provided in handler result', async () => {
    const handler = createArvoEventHandler({
      contract: mockContract,
      executionunits: 100,
      handler: async ({ event }) => {
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
          }
        ];
      },
    });
    const result = await handler.execute(mockEvent);
    expect(result[0].executionunits).toBe(200);
    expect(result[1].executionunits).toBe(500)
  });

  it('should allow to discover the system error message', () => {
    const handler = new ArvoEventHandler({
      contract: mockContract,
      executionunits: 100,
      handler: mockHandlerFunction,
    });

    expect(handler.systemErrorSchema.type).toBe(`sys.${handler.contract.accepts.type}.error`)
  })

  it('should not return any output if the handler does not', async () => {
    const handler = new ArvoEventHandler({
      contract: mockContract,
      executionunits: 100,
      handler: async () => {},
    });

    const events = await handler.execute(mockEvent)
    expect(events.length).toBe(0)
  })
});
