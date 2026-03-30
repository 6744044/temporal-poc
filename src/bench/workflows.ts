import { proxyActivities } from '@temporalio/workflow';
import type * as activities from './activities';
import type { BenchmarkWorkflowInput, BenchmarkWorkflowResult } from './types';

const { stepOne, stepTwo, stepThree, stepFour, stepFive } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: '30 seconds',
    allowEagerDispatch: false,
    retry: {
      maximumAttempts: 1,
    },
  });

export async function benchmarkWorkflow(
  input: BenchmarkWorkflowInput
): Promise<BenchmarkWorkflowResult> {
  const activityResults = [
    await stepOne(input),
    await stepTwo(input),
    await stepThree(input),
    await stepFour(input),
    await stepFive(input),
  ];

  return {
    benchmarkLabel: input.benchmarkLabel,
    iteration: input.iteration,
    activityResults,
  };
}
