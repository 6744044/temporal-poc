import {
  buildBenchmarkStepNames,
  normalizeBenchmarkStepName,
  BenchmarkDerivedLatencyEstimates,
  BenchmarkRecord,
  BenchmarkSummary,
  PercentileSummary,
} from './types';

export function buildBenchmarkSummary(args: {
  benchmarkLabel: string;
  totalRequested: number;
  warmupWorkflows: number;
  concurrency: number;
  activityCount: number;
  activityDelayMs: number;
  payloadBytes: number;
  records: BenchmarkRecord[];
}): BenchmarkSummary {
  const successfulRecords = args.records.filter(
    (record) =>
      record.phase === 'measure' &&
      record.status === 'success' &&
      record.latencyMs !== undefined
  );
  const failedRecords = args.records.filter(
    (record) => record.phase === 'measure' && record.status === 'failure'
  );

  const workflowLatencies = successfulRecords
    .map((record) => record.latencyMs)
    .filter((value): value is number => value !== undefined);

  const allActivityDurations = successfulRecords.flatMap((record) =>
    (record.activityResults ?? []).map((result) => result.workerDurationMs)
  );

  const expectedStepNames = buildBenchmarkStepNames(args.activityCount);
  const stepDurations = expectedStepNames.reduce<Record<string, number[]>>(
    (accumulator, step) => {
      accumulator[step] = [];
      return accumulator;
    },
    {}
  );

  for (const record of successfulRecords) {
    for (const activityResult of record.activityResults ?? []) {
      const stepName = normalizeBenchmarkStepName(activityResult.step);
      stepDurations[stepName] ??= [];
      stepDurations[stepName].push(activityResult.workerDurationMs);
    }
  }

  const summarizedStepDurations = getOrderedStepNames(
    Object.keys(stepDurations),
    args.activityCount
  ).reduce<Record<string, PercentileSummary>>((accumulator, step) => {
    accumulator[step] = summarizeNumbers(stepDurations[step]);
    return accumulator;
  }, {});

  const workflowSummary = summarizeNumbers(workflowLatencies);
  const workerActivitySummary = summarizeNumbers(allActivityDurations);

  return {
    benchmarkLabel: args.benchmarkLabel,
    generatedAt: new Date().toISOString(),
    totalRequested: args.totalRequested,
    warmupWorkflows: args.warmupWorkflows,
    concurrency: args.concurrency,
    activityCount: args.activityCount,
    activityDelayMs: args.activityDelayMs,
    payloadBytes: args.payloadBytes,
    completed: successfulRecords.length,
    failed: failedRecords.length,
    workflowEndToEndMs: workflowSummary,
    workerActivityDurationMs: workerActivitySummary,
    derivedLatencyEstimatesMs: buildDerivedLatencyEstimates({
      activityCountPerWorkflow: args.activityCount,
      activityDelayMs: args.activityDelayMs,
      workflowEndToEndMeanMs: workflowSummary.meanMs,
      workerActivityMeanMs: workerActivitySummary.meanMs,
    }),
    stepDurationsMs: summarizedStepDurations,
    sampleFailures: failedRecords
      .slice(0, 5)
      .map((record) => record.error ?? 'Unknown benchmark failure'),
  };
}

export function summarizeNumbers(values: number[]): PercentileSummary {
  if (values.length === 0) {
    return {
      count: 0,
      minMs: 0,
      maxMs: 0,
      meanMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
    };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const sum = sorted.reduce((accumulator, value) => accumulator + value, 0);

  return {
    count: sorted.length,
    minMs: sorted[0],
    maxMs: sorted[sorted.length - 1],
    meanMs: roundToTwoDecimals(sum / sorted.length),
    p50Ms: percentile(sorted, 0.5),
    p95Ms: percentile(sorted, 0.95),
    p99Ms: percentile(sorted, 0.99),
  };
}

export function formatSummary(summary: BenchmarkSummary): string {
  const lines = [
    `Benchmark label: ${summary.benchmarkLabel}`,
    `Completed workflows: ${summary.completed}/${summary.totalRequested} (failed: ${summary.failed})`,
    `Concurrency: ${summary.concurrency}, warmup: ${summary.warmupWorkflows}, activities/workflow: ${summary.activityCount}, activity delay: ${summary.activityDelayMs}ms, payload: ${summary.payloadBytes} bytes`,
    '',
    formatPercentileBlock('Workflow end-to-end latency', summary.workflowEndToEndMs),
    '',
    formatPercentileBlock(
      'Worker activity execution duration',
      summary.workerActivityDurationMs
    ),
    '',
    'Derived mean-based estimates:',
    `  worker overhead per activity ~= ${summary.derivedLatencyEstimatesMs.estimatedWorkerOverheadPerActivityMeanMs.toFixed(
      2
    )}ms`,
    `  network + Temporal residual per workflow ~= ${summary.derivedLatencyEstimatesMs.estimatedNetworkAndTemporalResidualPerWorkflowMeanMs.toFixed(
      2
    )}ms`,
    `  network + Temporal residual per activity ~= ${summary.derivedLatencyEstimatesMs.estimatedNetworkAndTemporalResidualPerActivityMeanMs.toFixed(
      2
    )}ms`,
    '  note: residual includes transport, scheduling, polling, workflow execution, and serialization',
    '',
    'Per-step worker activity duration:',
    ...getOrderedStepNames(
      Object.keys(summary.stepDurationsMs),
      summary.activityCount
    ).map((step) =>
      `  ${step}: ${formatPercentileInline(summary.stepDurationsMs[step])}`
    ),
  ];

  if (summary.sampleFailures.length > 0) {
    lines.push('', 'Sample failures:');
    lines.push(...summary.sampleFailures.map((failure) => `  - ${failure}`));
  }

  return lines.join('\n');
}

function formatPercentileBlock(label: string, summary: PercentileSummary): string {
  return `${label}\n  ${formatPercentileInline(summary)}`;
}

function formatPercentileInline(summary: PercentileSummary): string {
  if (summary.count === 0) {
    return 'no data';
  }

  return `count=${summary.count}, min=${summary.minMs.toFixed(2)}ms, mean=${summary.meanMs.toFixed(
    2
  )}ms, p50=${summary.p50Ms.toFixed(2)}ms, p95=${summary.p95Ms.toFixed(
    2
  )}ms, p99=${summary.p99Ms.toFixed(2)}ms, max=${summary.maxMs.toFixed(2)}ms`;
}

function percentile(sortedValues: number[], ratio: number): number {
  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * ratio) - 1)
  );

  return roundToTwoDecimals(sortedValues[index]);
}

function getOrderedStepNames(
  stepNames: string[],
  activityCount: number
): string[] {
  const expectedStepNames = buildBenchmarkStepNames(activityCount);
  const allStepNames = new Set<string>([...expectedStepNames, ...stepNames]);

  return [...allStepNames].sort((left, right) => {
    const leftIndex = parseStepIndex(left);
    const rightIndex = parseStepIndex(right);
    return leftIndex - rightIndex;
  });
}

function parseStepIndex(stepName: string): number {
  const normalizedStepName = normalizeBenchmarkStepName(stepName);
  return Number.parseInt(normalizedStepName.replace('step', ''), 10);
}

function buildDerivedLatencyEstimates(args: {
  activityCountPerWorkflow: number;
  activityDelayMs: number;
  workflowEndToEndMeanMs: number;
  workerActivityMeanMs: number;
}): BenchmarkDerivedLatencyEstimates {
  const estimatedWorkerOverheadPerActivityMeanMs = Math.max(
    0,
    roundToTwoDecimals(args.workerActivityMeanMs - args.activityDelayMs)
  );
  const estimatedNetworkAndTemporalResidualPerWorkflowMeanMs = Math.max(
    0,
    roundToTwoDecimals(
      args.workflowEndToEndMeanMs -
        args.activityCountPerWorkflow * args.workerActivityMeanMs
    )
  );
  const estimatedNetworkAndTemporalResidualPerActivityMeanMs = Math.max(
    0,
    roundToTwoDecimals(
      estimatedNetworkAndTemporalResidualPerWorkflowMeanMs /
        args.activityCountPerWorkflow
    )
  );

  return {
    activityCountPerWorkflow: args.activityCountPerWorkflow,
    configuredActivityDelayMs: args.activityDelayMs,
    estimatedWorkerOverheadPerActivityMeanMs,
    estimatedNetworkAndTemporalResidualPerWorkflowMeanMs,
    estimatedNetworkAndTemporalResidualPerActivityMeanMs,
  };
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
