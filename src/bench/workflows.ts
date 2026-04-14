import { proxyActivities, proxyLocalActivities } from '@temporalio/workflow';
import type * as activities from './activities';
import { buildBenchmarkStepName } from './types';
import type { BenchmarkWorkflowInput, BenchmarkWorkflowResult } from './types';

const { runBenchmarkActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  allowEagerDispatch: false,
  retry: {
    maximumAttempts: 1,
  },
});

const { runBenchmarkActivity: runLocalBenchmarkActivity } =
  proxyLocalActivities<typeof activities>({
  startToCloseTimeout: '30 seconds',
  retry: {
    maximumAttempts: 1,
  },
});

export async function benchmarkWorkflow(
  input: BenchmarkWorkflowInput
): Promise<BenchmarkWorkflowResult> {
  const activityResults = [];
  for (let activityIndex = 1; activityIndex <= input.activityCount; activityIndex++) {
    const step = buildBenchmarkStepName(activityIndex);
    const runActivity = input.localActivitySteps.includes(step)
      ? runLocalBenchmarkActivity
      : runBenchmarkActivity;

    activityResults.push(
      await runActivity({
        ...input,
        step,
      })
    );
  }

  return {
    benchmarkLabel: input.benchmarkLabel,
    iteration: input.iteration,
    activityResults,
  };
}
