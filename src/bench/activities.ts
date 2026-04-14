import os from 'os';
import { setTimeout as sleep } from 'timers/promises';
import { log } from '@temporalio/activity';
import type {
  BenchmarkActivityInput,
  BenchmarkActivityResult,
} from './types';

export async function runBenchmarkActivity(
  input: BenchmarkActivityInput
): Promise<BenchmarkActivityResult> {
  const startedAt = Date.now();

  if (input.activityDelayMs > 0) {
    await sleep(input.activityDelayMs);
  }

  const payloadBytes = Buffer.byteLength(input.payload, 'utf8');
  const workerDurationMs = Date.now() - startedAt;
  const result: BenchmarkActivityResult = {
    step: input.step,
    workerDurationMs,
    payloadBytes,
    workerHost: os.hostname(),
    deploymentLabel: process.env.BENCH_DEPLOYMENT_LABEL ?? input.benchmarkLabel,
  };

  log.info('benchmark activity completed', {
    step: input.step,
    iteration: input.iteration,
    workerDurationMs,
    payloadBytes,
    deploymentLabel: result.deploymentLabel,
  });

  return result;
}
