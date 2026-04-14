import fs from 'fs/promises';
import path from 'path';
import {
  buildBenchmarkStepNames,
  normalizeBenchmarkStepName,
  type BenchmarkSummary,
  type PercentileSummary,
} from './types';

async function run(): Promise<void> {
  const [baselinePath, candidatePath] = process.argv.slice(2);

  if (!baselinePath || !candidatePath) {
    throw new Error(
      'Usage: npm run bench:compare -- <baseline-summary.json> <candidate-summary.json>'
    );
  }

  const baseline = await readSummary(baselinePath);
  const candidate = await readSummary(candidatePath);

  console.log(
    `Comparing "${candidate.benchmarkLabel}" against baseline "${baseline.benchmarkLabel}"`
  );
  console.log('');

  printMetricComparison(
    'Activities per workflow',
    getActivityCount(baseline),
    getActivityCount(candidate),
    ''
  );
  console.log(
    `Local activity steps: baseline=${formatLocalActivitySteps(getLocalActivitySteps(baseline))}, candidate=${formatLocalActivitySteps(
      getLocalActivitySteps(candidate)
    )}`
  );
  console.log('');

  printMetricComparison(
    'Workflow p50',
    baseline.workflowEndToEndMs.p50Ms,
    candidate.workflowEndToEndMs.p50Ms
  );
  printMetricComparison(
    'Workflow p95',
    baseline.workflowEndToEndMs.p95Ms,
    candidate.workflowEndToEndMs.p95Ms
  );
  printMetricComparison(
    'Workflow p99',
    baseline.workflowEndToEndMs.p99Ms,
    candidate.workflowEndToEndMs.p99Ms
  );
  printMetricComparison(
    'Workflow mean',
    baseline.workflowEndToEndMs.meanMs,
    candidate.workflowEndToEndMs.meanMs
  );
  console.log('');
  printMetricComparison(
    'Worker activity mean',
    baseline.workerActivityDurationMs.meanMs,
    candidate.workerActivityDurationMs.meanMs
  );
  printMetricComparison(
    'Worker activity p95',
    baseline.workerActivityDurationMs.p95Ms,
    candidate.workerActivityDurationMs.p95Ms
  );
  console.log('');
  console.log('Per-step worker duration p95:');
  const baselineStepDurations = getNormalizedStepDurations(baseline);
  const candidateStepDurations = getNormalizedStepDurations(candidate);
  const comparableSteps = getComparableSteps(baseline, candidate);

  for (const step of comparableSteps) {
    printMetricComparison(
      `  ${step}`,
      baselineStepDurations[step]?.p95Ms ?? 0,
      candidateStepDurations[step]?.p95Ms ?? 0
    );
  }
}

async function readSummary(summaryPath: string): Promise<BenchmarkSummary> {
  const absolutePath = path.resolve(summaryPath);
  const contents = await fs.readFile(absolutePath, 'utf8');
  return JSON.parse(contents) as BenchmarkSummary;
}

function printMetricComparison(
  label: string,
  baselineValue: number,
  candidateValue: number,
  unit = 'ms'
): void {
  const delta = candidateValue - baselineValue;
  const deltaPct = baselineValue === 0 ? 0 : (delta / baselineValue) * 100;
  const sign = delta > 0 ? '+' : '';
  const formattedUnit = unit === '' ? '' : unit;

  console.log(
    `${label}: baseline=${baselineValue.toFixed(2)}${formattedUnit}, candidate=${candidateValue.toFixed(
      2
    )}${formattedUnit}, delta=${sign}${delta.toFixed(2)}${formattedUnit} (${sign}${deltaPct.toFixed(2)}%)`
  );
}

function getActivityCount(summary: BenchmarkSummary): number {
  return (
    summary.activityCount ??
    summary.derivedLatencyEstimatesMs.activityCountPerWorkflow ??
    Object.keys(summary.stepDurationsMs).length
  );
}

function getLocalActivitySteps(summary: BenchmarkSummary): string[] {
  return [...(summary.localActivitySteps ?? [])]
    .map((stepName) => normalizeBenchmarkStepName(stepName))
    .sort(compareStepNames);
}

function getNormalizedStepDurations(
  summary: BenchmarkSummary
): Record<string, PercentileSummary> {
  return Object.entries(summary.stepDurationsMs).reduce<Record<string, PercentileSummary>>(
    (accumulator, [stepName, percentileSummary]) => {
      accumulator[normalizeBenchmarkStepName(stepName)] = percentileSummary;
      return accumulator;
    },
    {}
  );
}

function getComparableSteps(
  baseline: BenchmarkSummary,
  candidate: BenchmarkSummary
): string[] {
  const baselineSteps = Object.keys(getNormalizedStepDurations(baseline));
  const candidateSteps = Object.keys(getNormalizedStepDurations(candidate));
  const expectedBaselineSteps = buildBenchmarkStepNames(getActivityCount(baseline));
  const expectedCandidateSteps = buildBenchmarkStepNames(getActivityCount(candidate));
  const stepNames = new Set<string>([
    ...baselineSteps,
    ...candidateSteps,
    ...expectedBaselineSteps,
    ...expectedCandidateSteps,
  ]);

  return [...stepNames].sort(compareStepNames);
}

function compareStepNames(left: string, right: string): number {
  const leftIndex = Number.parseInt(normalizeBenchmarkStepName(left).replace('step', ''), 10);
  const rightIndex = Number.parseInt(normalizeBenchmarkStepName(right).replace('step', ''), 10);
  return leftIndex - rightIndex;
}

function formatLocalActivitySteps(localActivitySteps: string[]): string {
  return localActivitySteps.length === 0 ? 'none' : localActivitySteps.join(', ');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
