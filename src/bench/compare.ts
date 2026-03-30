import fs from 'fs/promises';
import path from 'path';
import { benchmarkSteps, type BenchmarkSummary } from './types';

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
  for (const step of benchmarkSteps) {
    printMetricComparison(
      `  ${step}`,
      baseline.stepDurationsMs[step].p95Ms,
      candidate.stepDurationsMs[step].p95Ms
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
  candidateValue: number
): void {
  const delta = candidateValue - baselineValue;
  const deltaPct = baselineValue === 0 ? 0 : (delta / baselineValue) * 100;
  const sign = delta > 0 ? '+' : '';

  console.log(
    `${label}: baseline=${baselineValue.toFixed(2)}ms, candidate=${candidateValue.toFixed(
      2
    )}ms, delta=${sign}${delta.toFixed(2)}ms (${sign}${deltaPct.toFixed(2)}%)`
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
