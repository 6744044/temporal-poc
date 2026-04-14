export type BenchmarkStepName = `step${number}`;

export type BenchmarkPhase = 'warmup' | 'measure';

export interface BenchmarkWorkflowInput {
  benchmarkLabel: string;
  iteration: number;
  activityCount: number;
  localActivitySteps: BenchmarkStepName[];
  activityDelayMs: number;
  payload: string;
}

export interface BenchmarkActivityInput extends BenchmarkWorkflowInput {
  step: BenchmarkStepName;
}

export interface BenchmarkActivityResult {
  step: BenchmarkStepName;
  workerDurationMs: number;
  payloadBytes: number;
  workerHost: string;
  deploymentLabel: string;
}

export interface BenchmarkWorkflowResult {
  benchmarkLabel: string;
  iteration: number;
  activityResults: BenchmarkActivityResult[];
}

export interface BenchmarkRecord {
  phase: BenchmarkPhase;
  workflowId: string;
  runId?: string;
  iteration: number;
  startedAtEpochMs: number;
  completedAtEpochMs?: number;
  latencyMs?: number;
  status: 'success' | 'failure';
  error?: string;
  activityResults?: BenchmarkActivityResult[];
}

export interface PercentileSummary {
  count: number;
  minMs: number;
  maxMs: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

export interface BenchmarkDerivedLatencyEstimates {
  activityCountPerWorkflow: number;
  configuredActivityDelayMs: number;
  estimatedWorkerOverheadPerActivityMeanMs: number;
  estimatedNetworkAndTemporalResidualPerWorkflowMeanMs: number;
  estimatedNetworkAndTemporalResidualPerActivityMeanMs: number;
}

export interface BenchmarkSummary {
  benchmarkLabel: string;
  generatedAt: string;
  totalRequested: number;
  warmupWorkflows: number;
  concurrency: number;
  activityCount: number;
  localActivitySteps: BenchmarkStepName[];
  activityDelayMs: number;
  payloadBytes: number;
  completed: number;
  failed: number;
  workflowEndToEndMs: PercentileSummary;
  workerActivityDurationMs: PercentileSummary;
  derivedLatencyEstimatesMs: BenchmarkDerivedLatencyEstimates;
  stepDurationsMs: Record<string, PercentileSummary>;
  sampleFailures: string[];
}

export function buildBenchmarkStepName(stepIndex: number): BenchmarkStepName {
  if (!Number.isInteger(stepIndex) || stepIndex <= 0) {
    throw new Error(
      `Benchmark step index must be a positive integer. Received: ${stepIndex}`
    );
  }

  return `step${stepIndex}`;
}

export function buildBenchmarkStepNames(
  activityCount: number
): BenchmarkStepName[] {
  if (!Number.isInteger(activityCount) || activityCount <= 0) {
    throw new Error(
      `Benchmark activity count must be a positive integer. Received: ${activityCount}`
    );
  }

  return Array.from({ length: activityCount }, (_unused, index) =>
    buildBenchmarkStepName(index + 1)
  );
}

export function normalizeBenchmarkStepName(step: string): BenchmarkStepName {
  const legacyStepMap: Record<string, BenchmarkStepName> = {
    stepOne: 'step1',
    stepTwo: 'step2',
    stepThree: 'step3',
    stepFour: 'step4',
    stepFive: 'step5',
  };

  const normalized = legacyStepMap[step] ?? step;
  if (/^step[1-9]\d*$/.test(normalized)) {
    return normalized;
  }

  throw new Error(`Invalid benchmark step name: ${step}`);
}
