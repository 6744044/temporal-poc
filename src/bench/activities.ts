import os from 'os';
import { setTimeout as sleep } from 'timers/promises';
import { log } from '@temporalio/activity';
import type {
  BenchmarkActivityResult,
  BenchmarkStepName,
  BenchmarkWorkflowInput,
} from './types';

export async function stepOne(
  input: BenchmarkWorkflowInput
): Promise<BenchmarkActivityResult> {
  return await runStep('stepOne', input);
}

export async function stepTwo(
  input: BenchmarkWorkflowInput
): Promise<BenchmarkActivityResult> {
  return await runStep('stepTwo', input);
}

export async function stepThree(
  input: BenchmarkWorkflowInput
): Promise<BenchmarkActivityResult> {
  return await runStep('stepThree', input);
}

export async function stepFour(
  input: BenchmarkWorkflowInput
): Promise<BenchmarkActivityResult> {
  return await runStep('stepFour', input);
}

export async function stepFive(
  input: BenchmarkWorkflowInput
): Promise<BenchmarkActivityResult> {
  return await runStep('stepFive', input);
}

async function runStep(
  step: BenchmarkStepName,
  input: BenchmarkWorkflowInput
): Promise<BenchmarkActivityResult> {
  const startedAt = Date.now();

  if (input.activityDelayMs > 0) {
    await sleep(input.activityDelayMs);
  }

  const payloadBytes = Buffer.byteLength(input.payload, 'utf8');
  const workerDurationMs = Date.now() - startedAt;
  const result: BenchmarkActivityResult = {
    step,
    workerDurationMs,
    payloadBytes,
    workerHost: os.hostname(),
    deploymentLabel: process.env.BENCH_DEPLOYMENT_LABEL ?? input.benchmarkLabel,
  };

  log.info('benchmark activity completed', {
    step,
    iteration: input.iteration,
    workerDurationMs,
    payloadBytes,
    deploymentLabel: result.deploymentLabel,
  });

  return result;
}
