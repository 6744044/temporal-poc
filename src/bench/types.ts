export const benchmarkSteps = [
  'stepOne',
  'stepTwo',
  'stepThree',
  'stepFour',
  'stepFive',
] as const;

export type BenchmarkStepName = (typeof benchmarkSteps)[number];

export type BenchmarkPhase = 'warmup' | 'measure';

export interface BenchmarkWorkflowInput {
  benchmarkLabel: string;
  iteration: number;
  activityDelayMs: number;
  payload: string;
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

export interface BenchmarkSummary {
  benchmarkLabel: string;
  generatedAt: string;
  totalRequested: number;
  warmupWorkflows: number;
  concurrency: number;
  activityDelayMs: number;
  payloadBytes: number;
  completed: number;
  failed: number;
  workflowEndToEndMs: PercentileSummary;
  workerActivityDurationMs: PercentileSummary;
  stepDurationsMs: Record<BenchmarkStepName, PercentileSummary>;
  sampleFailures: string[];
}
