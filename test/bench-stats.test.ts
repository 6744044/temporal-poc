import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildBenchmarkStepName,
  normalizeBenchmarkStepName,
  type BenchmarkRecord,
} from '../src/bench/types';
import { buildBenchmarkSummary, formatSummary } from '../src/bench/stats';

void test('buildBenchmarkSummary supports configurable activity counts', () => {
  const activityCount = 10;
  const records: BenchmarkRecord[] = [
    {
      phase: 'measure',
      workflowId: 'workflow-1',
      iteration: 1,
      startedAtEpochMs: 0,
      completedAtEpochMs: 200,
      latencyMs: 200,
      status: 'success',
      activityResults: Array.from({ length: activityCount }, (_unused, index) => ({
        step: buildBenchmarkStepName(index + 1),
        workerDurationMs: 2,
        payloadBytes: 1024,
        workerHost: 'test-host',
        deploymentLabel: 'test-deployment',
      })),
    },
  ];

  const summary = buildBenchmarkSummary({
    benchmarkLabel: 'test',
    totalRequested: 1,
    warmupWorkflows: 0,
    concurrency: 1,
    activityCount,
    activityDelayMs: 1,
    payloadBytes: 1024,
    records,
  });

  assert.equal(summary.activityCount, activityCount);
  assert.equal(summary.derivedLatencyEstimatesMs.activityCountPerWorkflow, activityCount);
  assert.equal(summary.stepDurationsMs.step10.meanMs, 2);
  assert.match(formatSummary(summary), /activities\/workflow: 10/);
});

void test('legacy step names normalize to numeric step labels', () => {
  assert.equal(normalizeBenchmarkStepName('stepOne'), 'step1');
  assert.equal(normalizeBenchmarkStepName('stepFive'), 'step5');
  assert.equal(normalizeBenchmarkStepName('step10'), 'step10');
});
