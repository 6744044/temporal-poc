import os from 'os';
import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities';
import { loadBenchmarkConfig, toWorkerConnectionOptions } from './config';
import { installRuntime } from './runtime';

async function run(): Promise<void> {
  const config = await loadBenchmarkConfig();

  installRuntime({
    logLevel: config.logLevel,
    metricsBindAddress: config.metricsBindAddress,
  });

  const connection = await NativeConnection.connect(
    toWorkerConnectionOptions(config.temporal)
  );

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Starting benchmark worker',
      config: {
        address: config.temporal.address,
        namespace: config.temporal.namespace,
        taskQueue: config.taskQueue,
        deploymentLabel: config.deploymentLabel,
        metricsBindAddress: config.metricsBindAddress,
        workflowTaskExecutions: config.workflowTaskExecutions,
        workflowTaskPolls: config.workflowTaskPolls,
        activityTaskExecutions: config.activityTaskExecutions,
        activityTaskPolls: config.activityTaskPolls,
      },
    })
  );

  const worker = await Worker.create({
    connection,
    namespace: config.temporal.namespace,
    taskQueue: config.taskQueue,
    workflowsPath: require.resolve('./workflows'),
    activities,
    identity: `${config.deploymentLabel}-${os.hostname()}-${process.pid}`,
    reuseV8Context: true,
    maxConcurrentWorkflowTaskExecutions: config.workflowTaskExecutions,
    maxConcurrentWorkflowTaskPolls: config.workflowTaskPolls,
    maxConcurrentActivityTaskExecutions: config.activityTaskExecutions,
    maxConcurrentActivityTaskPolls: config.activityTaskPolls,
  });

  await worker.run();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
