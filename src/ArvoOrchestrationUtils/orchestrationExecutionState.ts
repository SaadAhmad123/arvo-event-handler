export const OrchestrationExecutionStatus = {
  FAILURE: 'failure',
  NORMAL: 'normal',
} as const;

export type OrchestrationExecutionMemoryRecord<T extends Record<string, unknown>> =
  | (T & {
      executionStatus: typeof OrchestrationExecutionStatus.NORMAL;
    })
  | (Partial<T> & {
      executionStatus: typeof OrchestrationExecutionStatus.FAILURE;
      error: Error;
      subject: string;
    });
