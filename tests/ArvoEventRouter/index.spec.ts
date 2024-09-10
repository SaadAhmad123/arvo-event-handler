import {
  ArvoErrorSchema,
  createArvoContract,
  createArvoEvent,
  createArvoEventFactory,
} from 'arvo-core';
import {
  ArvoEventRouter,
  createArvoEventHandler,
  createArvoEventRouter,
} from '../../src';
import { z } from 'zod';
import { telemetrySdkStart, telemetrySdkStop } from '../utils';

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
});
