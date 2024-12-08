import {
  cleanString,
  createArvoEvent,
  currentOpenTelemetryHeaders,
} from 'arvo-core';
import {
  createMultiArvoEventHandler,
  MultiArvoEventHandlerFunction,
} from '../../src';
import { telemetrySdkStart, telemetrySdkStop } from '../utils';
import { trace } from '@opentelemetry/api';

describe('MultiArvoEventHandler', () => {
  beforeAll(() => {
    telemetrySdkStart();
  });

  afterAll(() => {
    telemetrySdkStop();
  });

  const mockHandlerFunction: MultiArvoEventHandlerFunction = async ({
    event,
    source,
  }) => {
    if (event.type === 'com.user.register') {
      return {
        type: 'evt.user.register.success',
        data: {
          success: true,
        },
        executionunits: 150,
      };
    }

    if (event.type === 'com.user.announce') {
      return [
        {
          type: 'notif.user.status',
          data: {
            registered: true,
          },
          executionunits: 15,
          accesscontrol: 'role=none',
        },
        {
          type: 'notif.user.name',
          data: {
            name: 'Saad',
          },
          executionunits: 15,
        },
      ];
    }

    if (event.type === 'com.user.log') {
      return;
    }

    throw new Error('No event found');
  };

  it('should create an instance with default source', () => {
    const handler = createMultiArvoEventHandler({
      source: 'multi.event.handler',
      executionunits: 100,
      handler: mockHandlerFunction,
    });
    expect(handler.source).toBe('multi.event.handler');
    expect(handler.executionunits).toBe(100);
  });

  it('should throw an error for invalid source', () => {
    expect(() => {
      createMultiArvoEventHandler({
        executionunits: 100,
        handler: mockHandlerFunction,
        source: 'test source with spaces',
      });
    }).toThrow(
      "Invalid source identifier 'test source with spaces': Must contain only alphanumeric characters (example: order.handler)",
    );
  });

  it('should execute handler successfully', async () => {
    const handler = createMultiArvoEventHandler({
      source: 'multi.event.handler',
      executionunits: 100,
      handler: mockHandlerFunction,
    });

    const result = await handler.execute(
      createArvoEvent({
        to: 'multi.event.handler',
        type: 'com.user.register',
        source: 'test',
        subject: 'test',
        data: {
          name: 'Saad Ahmad',
        },
        accesscontrol: 'role=test-role',
      }),
    );
    expect(result).toBeDefined();
    expect(result[0].type).toBe('evt.user.register.success');
    expect(result[0].executionunits).toBe(150);
    expect(result[0].source).toBe('multi.event.handler');
    expect(result[0].accesscontrol).toBe('role=test-role');
  });

  it('should execute handler with invalid error and return error event', async () => {
    const handler = createMultiArvoEventHandler({
      source: 'multi.event.handler',
      executionunits: 100,
      handler: mockHandlerFunction,
    });

    const result = await handler.execute(
      createArvoEvent({
        to: 'multi.event.handler.invalid',
        type: 'com.user.register',
        source: 'test',
        subject: 'test',
        data: {
          name: 'Saad Ahmad',
        },
      }),
    );
    expect(result).toBeDefined();
    expect(result[0].type).toBe('sys.multi.event.handler.error');
    expect(result[0].source).toBe('multi.event.handler');
    expect(result[0].data.errorMessage).toBe(
      "Event destination mismatch: Expected 'multi.event.handler', received 'multi.event.handler.invalid'",
    );
    expect(result[0].source).toBe('multi.event.handler');
    expect(result[0].executionunits).toBe(100);
  });

  it('should execute handler with invalid error and return error event', async () => {
    const tracer = trace.getTracer('test-tracer');
    await tracer.startActiveSpan('test', async (span) => {
      const otelHeaders = currentOpenTelemetryHeaders();
      const handler = createMultiArvoEventHandler({
        source: 'multi.event.handler',
        executionunits: 100,
        handler: mockHandlerFunction,
      });

      let result = await handler.execute(
        createArvoEvent({
          to: 'multi.event.handler',
          type: 'com.user.announce',
          source: 'test',
          subject: 'test',
          data: {
            name: 'Saad Ahmad',
          },
          redirectto: 'multi.event.handler.1',
          traceparent: otelHeaders.traceparent || undefined,
          tracestate: otelHeaders.tracestate || undefined,
          accesscontrol: 'role=test',
        }),
      );
      expect(result).toBeDefined();
      expect(result.length).toBe(2);
      expect(result[0].type).toBe('notif.user.status');
      expect(result[0].to).toBe('multi.event.handler.1');
      expect(result[0].executionunits).toBe(15);
      expect(result[0].accesscontrol).toBe('role=none');
      expect(result[1].to).toBe('multi.event.handler.1');
      expect(result[1].type).toBe('notif.user.name');
      expect(result[1].executionunits).toBe(15);
      expect(result[1].accesscontrol).toBe('role=test');

      result = await handler.execute(
        createArvoEvent({
          to: 'multi.event.handler',
          type: 'com.user.log',
          source: 'test',
          subject: 'test',
          data: {
            name: 'Saad Ahmad',
          },
          traceparent: otelHeaders.traceparent || undefined,
          tracestate: otelHeaders.tracestate || undefined,
        }),
      );
      expect(result).toBeDefined();
      expect(result.length).toBe(0);
      span.end();
    });
  });

  it('should allow to discover the system error message', () => {
    const handler = createMultiArvoEventHandler({
      source: 'multi.event.handler',
      executionunits: 100,
      handler: mockHandlerFunction,
    });

    expect(handler.systemErrorSchema.type).toBe(
      `sys.multi.event.handler.error`,
    );
  });
});
