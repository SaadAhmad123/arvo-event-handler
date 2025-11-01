import type { ArvoEvent } from 'arvo-core';
import IArvoEventHandler from '../IArvoEventHandler';

/**
 * Defines a single test step in an event handler test sequence.
 *
 * Each step receives the output events from the previous step, generates a new input event,
 * and validates either the output events or expected errors. Steps are executed sequentially,
 * allowing you to test complex event-driven workflows.
 */
export type ArvoTestStep = {
  /**
   * Generates the input event for this step based on previous step's output.
   * Receives null on the first step or an array of ArvoEvents from the previous step.
   */
  input: ((prev: ArvoEvent[] | null) => ArvoEvent) | ((prev: ArvoEvent[] | null) => Promise<ArvoEvent>);
} & (
  | {
      /**
       * Optional validator for output events when the handler executes successfully.
       *
       * @param event - Array of events emitted by the handler
       * @returns true if the events match expectations, false otherwise
       */
      expectedEvents?: ((event: ArvoEvent[]) => boolean) | ((event: ArvoEvent[]) => Promise<boolean>);
      expectedError?: never;
    }
  | {
      /**
       * Optional validator for errors when the handler is expected to throw.
       *
       * @param error - The error thrown by the handler
       * @returns true if the error matches expectations, false otherwise
       */
      expectedError?: ((error: Error) => boolean) | ((error: Error) => Promise<boolean>);
      expectedEvents?: never;
    }
);

/**
 * Defines a complete test case containing one or more sequential steps.
 *
 * Test cases execute steps in order, passing output events from each step to the next.
 * This allows testing of complex event chains and workflows. Optional repeat configuration
 * helps handle flaky tests by running them multiple times and checking success rate.
 *
 * @example
 * ```typescript
 * const testCase: ArvoTestCase = {
 *   name: 'User registration flow',
 *   steps: [
 *     { input: () => createUserEvent(), expectedEvents: (e) => e.length === 2 },
 *     { input: (prev) => prev[0], expectedEvents: (e) => e[0].type === 'email.sent' }
 *   ],
 *   repeat: { times: 10, successThreshold: 95 }
 * };
 * ```
 */
export type ArvoTestCase = {
  /**  Descriptive name for the test case, displayed in test output. */
  name: string;

  /**  Sequential steps to execute in order. Must contain at least one step. */
  steps: [ArvoTestStep, ...ArvoTestStep[]];

  /**
   * Optional configuration for running the test multiple times.
   * Useful for testing non-deterministic handlers or catching intermittent failures.
   * The test passes only if the success rate meets or exceeds the threshold.
   */
  repeat?: {
    /** Number of times to execute the entire test case */
    times: number;
    /**
     * Minimum percentage of successful runs required for the test to pass (0-100).
     * For example, 95 means at least 95% of runs must succeed.
     */
    successThreshold: number;
  };
};

/**
 * Configuration for the event handler or function under test.
 *
 * Supports testing either an IArvoEventHandler instance or a raw async function.
 * Multiple configs can be provided to test the same cases against different implementations.
 */
export type ArvoTestConfig = {
  /**
   * Optional display name for the test suite.
   * If not provided, defaults to the handler source or function name.
   */
  name?: string;
} & (
  | {
      /** IArvoEventHandler instance to test. */
      handler?: IArvoEventHandler;
      fn?: never;
    }
  | {
      /** Raw async function to test that accepts an ArvoEvent and returns events. */
      fn?: (event: ArvoEvent) => Promise<{ events: ArvoEvent[] }>;
      handler?: never;
    }
);

/**
 * Complete test suite definition combining configuration and test cases.
 *
 * A test suite can test one or more handlers/functions against the same set of test cases.
 * When multiple configs are provided, each test case runs against all configs, enabling
 * cross-implementation testing and comparison.
 *
 * @example
 * ```typescript
 * const suite: ArvoTestSuite = {
 *   config: [
 *     { name: 'V1 Handler', handler: handlerV1 },
 *     { name: 'V2 Handler', handler: handlerV2 }
 *   ],
 *   cases: [
 *     {
 *       name: 'Should process user event',
 *       steps: [{ input: () => userEvent, expectedEvents: (e) => e.length > 0 }]
 *     },
 *     {
 *       name: 'Step 2',
 *       steps: [{ input: () => someEvent, expectedEvents: (e) => expect(e.type).toBe('com.some.event') }]
 *     }
 *   ]
 * };
 * ```
 */
export type ArvoTestSuite = {
  /** Handler or function configuration(s) to test. */
  config: ArvoTestConfig | ArvoTestConfig[];

  /** Array of test cases to execute against the configured handler(s) */
  cases: ArvoTestCase[];
};

/**
 * Result of executing a single test run.
 */
export type ArvoTestResult = {
  /** Whether the test execution passed all steps successfully */
  success: boolean;
  /** Detailed error message if the test failed. */
  error?: string;
  /** Iteration number when using repeat configuration. */
  iteration?: number;
  /** Index of the last completed step (0-based). */
  step?: number;
};

/**
 * Adapter interface for integrating with different test frameworks.
 *
 * Provides a unified interface for test framework primitives (describe, test, beforeEach),
 * enabling the same test suites to run on Vitest, Jest, Mocha, or any other framework.
 * Implementations should wrap their framework's native functions.
 *
 * @example
 * ```typescript
 * // Vitest adapter
 * import { describe, test, beforeEach } from 'vitest';
 *
 * const vitestAdapter: IArvoTestFramework = {
 *   describe,
 *   test,
 *   beforeEach
 * };
 *
 * // Mocha adapter
 * const mochaAdapter: IArvoTestFramework = {
 *   describe,
 *   test: it,
 *   beforeEach
 * };
 * ```
 */
export interface IArvoTestFramework {
  /** Groups related tests into a test suite. */
  describe(name: string, fn: () => void): void;
  /** Defines a single test case. */
  test(name: string, fn: () => Promise<void>): void;
  /** Runs setup logic before each test in the current describe block. */
  beforeEach(fn: () => void): void;
}
