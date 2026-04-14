import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Connection, WorkflowClient } from '@temporalio/client';
import type { BenchmarkConfig } from './config';
import { loadBenchmarkConfig, toClientConnectionOptions } from './config';
import { buildBenchmarkSummary, formatSummary } from './stats';
import type {
  BenchmarkPhase,
  BenchmarkRecord,
  BenchmarkWorkflowInput,
  BenchmarkWorkflowResult,
} from './types';
import { benchmarkWorkflow } from './workflows';

async function run(): Promise<void> {
  const config = await loadBenchmarkConfig();
  await fs.mkdir(config.resultsDir, { recursive: true });

  const connection = await Connection.connect(
    toClientConnectionOptions(config.temporal)
  );
  const client = new WorkflowClient({
    connection,
    namespace: config.temporal.namespace,
  });

  console.log(
    `Connected benchmark client to ${config.temporal.address} using namespace ${config.temporal.namespace}`
  );

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const allRecords: BenchmarkRecord[] = [];

  if (config.warmupWorkflows > 0) {
    console.log(
      `Running warmup phase (${config.warmupWorkflows} workflows @ concurrency ${config.concurrency}, ${config.activityCount} activities/workflow)`
    );
    allRecords.push(
      ...(await runPhase({
        phase: 'warmup',
        totalWorkflows: config.warmupWorkflows,
        iterationOffset: 0,
        client,
        config,
      }))
    );
  }

  console.log(
    `Running measured phase (${config.totalWorkflows} workflows @ concurrency ${config.concurrency}, ${config.activityCount} activities/workflow)`
  );
  allRecords.push(
    ...(await runPhase({
      phase: 'measure',
      totalWorkflows: config.totalWorkflows,
      iterationOffset: config.warmupWorkflows,
      client,
      config,
    }))
  );

  const summary = buildBenchmarkSummary({
    benchmarkLabel: config.deploymentLabel,
    totalRequested: config.totalWorkflows,
    warmupWorkflows: config.warmupWorkflows,
    concurrency: config.concurrency,
    activityCount: config.activityCount,
    activityDelayMs: config.activityDelayMs,
    payloadBytes: config.payloadBytes,
    records: allRecords,
  });

  const resultsBaseName = `${config.deploymentLabel}-${timestamp}`;
  const recordsPath = path.join(config.resultsDir, `${resultsBaseName}.jsonl`);
  const summaryPath = path.join(
    config.resultsDir,
    `${resultsBaseName}.summary.json`
  );

  await fs.writeFile(
    recordsPath,
    allRecords.map((record) => JSON.stringify(record)).join('\n') +
      (allRecords.length > 0 ? '\n' : '')
  );
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2));

  console.log('');
  console.log(formatSummary(summary));
  console.log('');
  console.log(`Detailed records written to ${recordsPath}`);
  console.log(`Summary written to ${summaryPath}`);

  await connection.close();

  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

async function runPhase(args: {
  phase: BenchmarkPhase;
  totalWorkflows: number;
  iterationOffset: number;
  client: WorkflowClient;
  config: BenchmarkConfig;
}): Promise<BenchmarkRecord[]> {
  if (args.totalWorkflows === 0) {
    return [];
  }

  const records = new Array<BenchmarkRecord>(args.totalWorkflows);
  const workerCount = Math.min(args.config.concurrency, args.totalWorkflows);
  let nextIndex = 0;
  let completed = 0;
  const progressInterval = Math.max(1, Math.floor(args.totalWorkflows / 10));

  const loops = Array.from({ length: workerCount }, async () => {
    while (true) {
      const currentIndex = nextIndex++;
      if (currentIndex >= args.totalWorkflows) {
        return;
      }

      const iteration = args.iterationOffset + currentIndex + 1;
      records[currentIndex] = await runSingleWorkflow({
        phase: args.phase,
        iteration,
        client: args.client,
        config: args.config,
      });

      completed += 1;
      if (completed % progressInterval === 0 || completed === args.totalWorkflows) {
        console.log(`[${args.phase}] completed ${completed}/${args.totalWorkflows}`);
      }
    }
  });

  await Promise.all(loops);
  return records;
}

async function runSingleWorkflow(args: {
  phase: BenchmarkPhase;
  iteration: number;
  client: WorkflowClient;
  config: BenchmarkConfig;
}): Promise<BenchmarkRecord> {
  const workflowId = `${args.phase}-${args.config.deploymentLabel}-${args.iteration}-${randomUUID()}`;
  const workflowInput: BenchmarkWorkflowInput = {
    benchmarkLabel: args.config.deploymentLabel,
    iteration: args.iteration,
    activityCount: args.config.activityCount,
    activityDelayMs: args.config.activityDelayMs,
    payload: 'x'.repeat(args.config.payloadBytes),
  };

  const startedAtEpochMs = Date.now();

  try {
    const handle = await args.client.start(benchmarkWorkflow, {
      args: [workflowInput],
      taskQueue: args.config.taskQueue,
      workflowId,
    });
    const result: BenchmarkWorkflowResult = await handle.result();
    const completedAtEpochMs = Date.now();

    return {
      phase: args.phase,
      workflowId,
      runId: handle.firstExecutionRunId,
      iteration: args.iteration,
      startedAtEpochMs,
      completedAtEpochMs,
      latencyMs: completedAtEpochMs - startedAtEpochMs,
      status: 'success',
      activityResults: result.activityResults,
    };
  } catch (error) {
    const completedAtEpochMs = Date.now();

    return {
      phase: args.phase,
      workflowId,
      iteration: args.iteration,
      startedAtEpochMs,
      completedAtEpochMs,
      latencyMs: completedAtEpochMs - startedAtEpochMs,
      status: 'failure',
      error: serializeError(error),
    };
  }
}

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
