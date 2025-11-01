import { trace, context, type Tracer, SpanStatusCode } from '@opentelemetry/api';
import type { ArvoTestResult, ArvoTestSuite, ArvoTestStep, IArvoTestFramework } from './types.js';
import { ArvoOpenTelemetry, type ArvoEvent } from 'arvo-core';

type ArvoTestHandlerType = {
  source: string;
  execute: (event: ArvoEvent) => Promise<{ events: ArvoEvent[] }>;
};

const validateExpectedError = async (
  handler: ArvoTestHandlerType,
  input: ArvoEvent,
  expectedError: NonNullable<ArvoTestStep['expectedError']>,
  stepIndex: number,
): Promise<{ success: boolean; error?: string; events: ArvoEvent[] }> => {
  try {
    await handler.execute(input);
    return {
      success: false,
      error: `Step ${stepIndex}: Expected error but function succeeded`,
      events: [],
    };
  } catch (error) {
    const matches = await expectedError(error as Error);
    return matches
      ? { success: true, events: [] }
      : {
          success: false,
          error: `Step ${stepIndex}: Error didn't match custom validator: ${(error as Error).message}`,
          events: [],
        };
  }
};

const validateExpectedEvents = async (
  handler: ArvoTestHandlerType,
  input: ArvoEvent,
  expectedEvents: NonNullable<ArvoTestStep['expectedEvents']>,
  stepIndex: number,
): Promise<{ success: boolean; error?: string; events: ArvoEvent[] }> => {
  const actualResult = (await handler.execute(input)).events;
  try {
    const matches = await expectedEvents(actualResult);
    if (!matches) {
      return {
        success: false,
        error: `Step ${stepIndex}: Custom validator returned false\nActual events: ${actualResult.map((item) => item.toString(2)).join('\n')}`,
        events: actualResult,
      };
    }
    return { success: true, events: actualResult };
  } catch (error) {
    if (error instanceof Error) {
      return {
        success: false,
        error: `Step ${stepIndex}: Custom validator threw error: ${error.message}\nActual events: ${actualResult.map((item) => item.toString(2)).join('\n')}`,
        events: actualResult,
      };
    }
    return {
      success: false,
      error: `Step ${stepIndex}: Custom validator threw unknown error`,
      events: actualResult,
    };
  }
};

const executeStep = async (
  handler: ArvoTestHandlerType,
  step: ArvoTestStep,
  stepIndex: number,
  previousEvents: ArvoEvent[] | null,
  tracer: Tracer,
): Promise<{ success: boolean; error?: string; events: ArvoEvent[]; step: number }> => {
  const stepSpan = tracer.startSpan(`Step<${stepIndex}>`, {
    attributes: {
      'test.step': stepIndex,
      'test.previous.events.count': previousEvents?.length ?? 0,
    },
  });

  try {
    const result = await context.with(trace.setSpan(context.active(), stepSpan), async () => {
      const currentInput = await step.input(previousEvents);
      stepSpan.setAttribute('test.input.type', currentInput.type);

      if (step.expectedError) {
        return await validateExpectedError(handler, currentInput, step.expectedError, stepIndex);
      }
      if (step.expectedEvents) {
        return await validateExpectedEvents(handler, currentInput, step.expectedEvents, stepIndex);
      }
      const actualResult = (await handler.execute(currentInput)).events;
      return { success: true, events: actualResult };
    });

    stepSpan.setStatus(
      result.success ? { code: SpanStatusCode.OK } : { code: SpanStatusCode.ERROR, message: result.error },
    );
    stepSpan.end();

    return { ...result, step: stepIndex };
  } catch (error) {
    stepSpan.recordException(error as Error);
    stepSpan.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
    stepSpan.end();
    return {
      success: false,
      error: `Step ${stepIndex}: Unexpected exception: ${(error as Error).message}`,
      events: [],
      step: stepIndex,
    };
  }
};

const executeAllSteps = async (
  handler: ArvoTestHandlerType,
  steps: ArvoTestStep[],
  tracer: Tracer,
): Promise<{ success: boolean; error?: string; step: number }> => {
  let previousEvents: ArvoEvent[] | null = null;
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
    // biome-ignore lint/style/noNonNullAssertion: This will never be undefined
    const stepResult = await executeStep(handler, steps[stepIndex]!, stepIndex + 1, previousEvents, tracer);
    if (!stepResult.success) {
      return stepResult;
    }
    previousEvents = stepResult.events || [];
  }
  return { success: true, step: steps.length - 1 };
};

const handleRepeatTest = async (
  testFn: () => Promise<ArvoTestResult>,
  repeat: { times: number; successThreshold: number },
): Promise<void> => {
  const results = await Promise.all(Array.from({ length: repeat.times }, (_, i) => testFn()));
  const failures = results.filter((r) => !r.success);
  const successCount = results.length - failures.length;
  const successRate = (successCount / repeat.times) * 100;

  if (successRate < repeat.successThreshold) {
    const failureSummary = failures
      .slice(0, 10)
      .map((f) => `  Iteration ${f.iteration}: ${f.error}`)
      .join('\n');
    const additionalFailures = failures.length > 10 ? `\n  ... and ${failures.length - 10} more failures` : '';

    throw new Error(
      `Success rate ${successRate.toFixed(2)}% is below threshold ${repeat.successThreshold}%\n` +
        `Successes: ${successCount}/${repeat.times}\n` +
        `Sample failures:\n${failureSummary}${additionalFailures}`,
    );
  }
};

/**
 * Executes test suites for Arvo event handlers using the provided test framework adapter.
 *
 * This function registers test suites with your test framework (Vitest, Jest, Mocha, etc.)
 * by using the provided adapter. Each test suite can contain multiple configurations and
 * test cases. Test cases execute sequentially with each step receiving output from the
 * previous step, enabling testing of complex event-driven workflows.
 *
 * Features include OpenTelemetry tracing for observability, support for error validation,
 * event output validation, and optional retry logic for flaky tests.
 *
 * @param testSuites - Array of test suites to execute
 * @param adapter - Test framework adapter providing describe, test, and beforeEach functions
 *
 * @example
 * ```typescript
 * import { runArvoTestSuites } from 'arvo-event-handler/test';
 * import { describe, test, beforeEach } from 'vitest';
 *
 * const vitestAdapter = { describe, test, beforeEach };
 *
 * const suites: ArvoTestSuite[] = [
 *   {
 *     config: { name: 'User Handler', handler: userHandler },
 *     cases: [
 *       {
 *         name: 'Should create user and send email',
 *         steps: [
 *           {
 *             input: () => createArvoEvent({}),
 *             expectedEvents: (events) => events.length === 2
 *           },
 *           {
 *             input: (prev) => prev[1], // Use second event from previous step
 *             expectedEvents: (events) => events[0].type === 'email.sent'
 *           }
 *         ]
 *       }
 *     ]
 *   }
 * ];
 *
 * runArvoTestSuites(suites, vitestAdapter);
 * ```
 *
 * @example
 * ```typescript
 * // Testing with retry logic for non-deterministic handlers
 * const suites: ArvoTestSuite[] = [
 *   {
 *     config: { name: 'Flaky Handler', handler: flakyHandler },
 *     cases: [
 *       {
 *         name: 'Should eventually succeed',
 *         steps: [{ input: () => event, expectedEvents: (e) => e.length > 0 }],
 *         repeat: { times: 10, successThreshold: 80 } // 80% success rate required
 *       }
 *     ]
 *   }
 * ];
 *
 * runArvoTestSuites(suites, vitestAdapter);
 * ```
 *
 * @example
 * ```typescript
 * // Testing error cases
 * const suites: ArvoTestSuite[] = [
 *   {
 *     config: { name: 'Error Handler', handler: errorHandler },
 *     cases: [
 *       {
 *         name: 'Should throw validation error',
 *         steps: [
 *           {
 *             input: () => createArvoEvent({}),
 *             expectedError: (error) => error.message.includes('validation')
 *           }
 *         ]
 *       }
 *     ]
 *   }
 * ];
 *
 * runArvoTestSuites(suites, vitestAdapter);
 * ```
 */
export const runArvoTestSuites = (testSuites: ArvoTestSuite[], adapter: IArvoTestFramework) => {
  for (const { config, cases } of testSuites) {
    const configs = Array.isArray(config) ? config : [config];

    for (const { name: fnName, handler: _handler, fn } of configs) {
      const handler: ArvoTestHandlerType = (_handler as unknown as ArvoTestHandlerType) ?? {
        source: fn?.name ?? 'unknown',
        execute: fn,
      };

      adapter.describe(fnName ?? `Test<${handler.source}>`, () => {
        let tracer: Tracer;

        adapter.beforeEach(() => {
          tracer = ArvoOpenTelemetry.getInstance().tracer;
        });

        for (const { name, steps, repeat } of cases) {
          adapter.test(name, async () => {
            const runTest = async (iteration?: number): Promise<ArvoTestResult> => {
              const span = tracer.startSpan(`Case<${name}>[${iteration ?? 0}]`, {
                attributes: {
                  'test.function.name': fnName,
                  'test.iteration': iteration,
                  'test.total.steps': steps.length,
                },
              });

              try {
                const result = await context.with(trace.setSpan(context.active(), span), async () => {
                  return await executeAllSteps(handler, steps, tracer);
                });

                span.setStatus(
                  result.success
                    ? { code: SpanStatusCode.OK }
                    : { code: SpanStatusCode.ERROR, message: result.error ?? 'Test suite failed' },
                );
                if (result.error) {
                  span.setAttribute('test.error', result.error);
                }
                if (result.step !== undefined) {
                  span.setAttribute('test.steps.completed', result.step + 1);
                }
                return { ...result, iteration };
              } catch (error) {
                span.recordException(error as Error);
                span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
                return {
                  success: false,
                  error: `Unexpected exception: ${(error as Error).message}`,
                  iteration,
                };
              } finally {
                span.end();
              }
            };

            if (repeat) {
              await handleRepeatTest(() => runTest(), repeat);
            } else {
              const result = await runTest();
              if (!result.success) {
                throw new Error(result.error);
              }
            }
          });
        }
      });
    }
  }
};
