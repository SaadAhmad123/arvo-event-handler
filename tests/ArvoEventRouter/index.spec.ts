import {
  ArvoErrorSchema,
  cleanString,
  createArvoContract,
  createArvoEvent,
  createArvoEventFactory,
  currentOpenTelemetryHeaders,
  exceptionToSpan,
} from 'arvo-core';
import {
  ArvoEventRouter,
  createArvoEventHandler,
  createArvoEventRouter,
} from '../../src';
import { z } from 'zod';
import { telemetrySdkStart, telemetrySdkStop } from '../utils';
import { trace } from '@opentelemetry/api';

describe('ArvoEventRouter', () => {
  beforeAll(() => {
    telemetrySdkStart();
  });

  afterAll(() => {
    telemetrySdkStop();
  });

  const userRegisterContract = createArvoContract({
    uri: '#/test/user/register',
    accepts: {
      type: 'com.user.register',
      schema: z.object({
        name: z.string(),
        age: z.number(),
      }),
    },
    emits: {
      'evt.user.register.success': z.object({
        created: z.boolean(),
        name: z.string(),
      }),
      'notif.user.register': z.object({
        message: z.string(),
      }),
      'evt.user.register.error': ArvoErrorSchema,
    },
  });

  const userReadContract = createArvoContract({
    uri: '#/test/user/read',
    accepts: {
      type: 'com.user.read',
      schema: z.object({
        name: z.string(),
      }),
    },
    emits: {
      'evt.user.read.success': z.object({
        created: z.boolean(),
        name: z.string(),
      }),
      'notif.user.read': z.object({
        message: z.string(),
      }),
      'evt.user.read.error': ArvoErrorSchema,
    },
  });

  const userRegisterHandler = createArvoEventHandler({
    contract: userRegisterContract,
    executionunits: 10,
    handler: async ({ event }) => {
      try {
        if (event.data.age > 100) {
          throw new Error('Age more than 100. It is invalid');
        }
        return [
          {
            type: 'evt.user.register.success',
            data: {
              created: true,
              name: event.data.name,
            },
          },
          {
            type: 'notif.user.register',
            data: {
              message: `User created: ${event.data.name}`,
            },
          },
        ];
      } catch (e) {
        exceptionToSpan(e as Error)
        return {
          type: 'evt.user.register.error',
          data: {
            errorMessage: (e as Error).message,
            errorName: (e as Error).name,
            errorStack: (e as Error).stack ?? null,
          },
        };
      }
    },
  });

  // Simulated function to find a user
  async function findUser(name: string): Promise<{ name: string } | null> {
    // This is a mock implementation. In a real scenario, you would query a database or external service.
    if (name === 'John Doe') {
      return { name: 'John Doe' };
    }
    return null;
  }

  const userReadHandler = createArvoEventHandler({
    contract: userReadContract,
    executionunits: 5, // You can adjust this value based on the complexity of the operation
    handler: async ({ event }) => {
      try {
        // Simulating a user read operation
        const user = await findUser(event.data.name);

        if (user) {
          return [
            {
              type: 'evt.user.read.success',
              data: {
                created: true,
                name: user.name,
              },
            },
            {
              type: 'notif.user.read',
              data: {
                message: `User read: ${user.name}`,
              },
            },
          ];
        } else {
          return [
            {
              type: 'evt.user.read.success',
              data: {
                created: false,
                name: event.data.name,
              },
            },
            {
              type: 'notif.user.read',
              data: {
                message: `User not found: ${event.data.name}`,
              },
            },
          ];
        }
      } catch (e) {
        return {
          type: 'evt.user.read.error',
          data: {
            errorMessage: (e as Error).message,
            errorName: (e as Error).name,
            errorStack: (e as Error).stack ?? null,
          },
        };
      }
    },
  });

  let router: ArvoEventRouter;

  beforeEach(() => {
    router = createArvoEventRouter({
      source: 'test-router',
      executionunits: 1,
      handlers: [userRegisterHandler, userReadHandler],
    });
  });

  it('should route user register event to the correct handler', async () => {
    const event = createArvoEvent({
      type: 'com.user.register',
      source: 'test-source',
      subject: 'test',
      to: 'test-router',
      data: {
        name: 'John Doe',
        age: 30,
      },
    });

    const results = await router.execute(event);

    expect(results).toHaveLength(2);
    expect(results[0].type).toBe('evt.user.register.success');
    expect(results[1].type).toBe('notif.user.register');
  });

  it('should route user read event to the correct handler', async () => {
    const tracer = trace.getTracer('test-tracer');
    await tracer.startActiveSpan('test-arvo-event-router-0', async (span) => {
      const otelHeaders = currentOpenTelemetryHeaders();
      const event = createArvoEvent({
        type: 'com.user.read',
        source: 'test-source',
        subject: 'test',
        to: 'test-router',
        data: {
          name: 'John Doe'
        },
        traceparent: otelHeaders.traceparent ?? undefined,
        tracestate: otelHeaders.tracestate ?? undefined,
      })
  
      const results = await router.execute(event)
  
      expect(results).toHaveLength(2)
      expect(results[0].type).toBe('evt.user.read.success')
      expect(results[1].type).toBe('notif.user.read')
      span.end()
    })
    
  })

  it('should handle errors in user register event', async () => {
    const tracer = trace.getTracer('test-tracer');
    await tracer.startActiveSpan('test-arvo-event-router-1', async (span) => {
      const otelHeaders = currentOpenTelemetryHeaders(); 
      const event = createArvoEvent({
        type: 'com.user.register',
        source: 'test-source',
        subject: 'test',
        to: 'test-router',
        data: {
          name: 'Old Person',
          age: 101
        },
        traceparent: otelHeaders.traceparent ?? undefined,
        tracestate: otelHeaders.tracestate ?? undefined,
      })
  
      const results = await router.execute(event)
  
      expect(results).toHaveLength(1)
      expect(results[0].type).toBe('evt.user.register.error')
      expect(results[0].data.errorMessage).toBe('Age more than 100. It is invalid')
      span.end()
    })
    
  })

  it('should handle non-existent user in read event', async () => {
    const event = createArvoEvent({
      type: 'com.user.read',
      source: 'test-source',
      subject: 'test',
      to: 'test-router',
      data: {
        name: 'Non Existent User'
      }
    })

    const results = await router.execute(event)

    expect(results).toHaveLength(2)
    expect(results[0].type).toBe('evt.user.read.success')
    expect(results[0].data.created).toBe(false)
    expect(results[1].type).toBe('notif.user.read')
    expect(results[1].data.message).toBe('User not found: Non Existent User')
  })

  it('should throw an error for mismatched source', async () => {
    const tracer = trace.getTracer('test-tracer');
    await tracer.startActiveSpan('test-arvo-event-router', async (span) => {
      const otelHeaders = currentOpenTelemetryHeaders();
      const event = createArvoEvent({
        type: 'com.user.register',
        source: 'test-source',
        subject: 'test',
        to: 'wrong-router',
        data: {
          name: 'John Doe',
          age: 30
        },
        traceparent: otelHeaders.traceparent ?? undefined,
        tracestate: otelHeaders.tracestate ?? undefined,
      })
  
      const result = await router.execute(event)
      expect(result[0].data.errorMessage).toBe(cleanString(`
        Invalid event. The 'event.to' is wrong-router while this handler
        listens to only 'event.to' equal to test-router. If this is a mistake,
        please update the 'source' field of the handler
      `))
      span.end()
    })
  })

  it('should throw an error for unhandled event type', async () => {
    const event = createArvoEvent({
      type: 'com.user.unhandled',
      source: 'test-source',
      subject: 'test',
      to: 'test-router',
      data: {}
    })
    const result = await router.execute(event)
    expect(result[0].data.errorMessage).toBe(cleanString(`
      Invalid event (type=com.user.unhandled). No valid handler
      <handler[*].contract.accepts.type> found in the router.
    `))
  })

  it('should add execution units to the result events', async () => {
    const event = createArvoEvent({
      type: 'com.user.register',
      source: 'test-source',
      to: 'test-router',
      subject: 'test',
      data: {
        name: 'John Doe',
        age: 30
      }
    })

    const results = await router.execute(event)

    results.forEach(result => {
      expect(result.executionunits).toBe(11) // 10 from handler + 1 from router
    })
  })

  it ('should throw error on duplication', () => {
    expect(() => {
      createArvoEventRouter({
        source: 'test-router',
        executionunits: 1,
        handlers: [userRegisterHandler, userReadHandler, userRegisterHandler],
      })
    }).toThrow(cleanString(`
      Duplicate handlers for event.type=com.user.register found. There are same 'contract.accept.types' in
      contracts 'uri=#/test/user/register' and 'uri=#/test/user/register'. This router does not support handlers
      with the same 'contract.accept.type'.
    `))
  })

  it ('should throw error on invalid source', () => {
    expect(() => {
      createArvoEventRouter({
        source: 'invalid source with spaces',
        executionunits: 1,
        handlers: [userRegisterHandler, userReadHandler, userRegisterHandler],
      })
    }).toThrow("The provided 'source' is not a valid string. Error")
  })

});
