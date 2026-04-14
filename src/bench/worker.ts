import os from 'os';
import { inspect } from 'node:util';
import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities';
import type { TemporalConnectionConfig } from './config';
import { loadBenchmarkConfig, toWorkerConnectionOptions } from './config';
import { installRuntime } from './runtime';

async function run(): Promise<void> {
  const config = await loadBenchmarkConfig();

  installRuntime({
    logLevel: config.logLevel,
    metricsBindAddress: config.metricsBindAddress,
  });

  const connectionTarget = {
    address: config.temporal.address,
    namespace: config.temporal.namespace,
    tlsMode: getTlsMode(config.temporal),
    taskQueue: config.taskQueue,
    deploymentLabel: config.deploymentLabel,
    metricsBindAddress: config.metricsBindAddress,
  };

  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Connecting benchmark worker to Temporal',
      target: connectionTarget,
    })
  );

  let connection: NativeConnection;
  try {
    connection = await NativeConnection.connect(
      toWorkerConnectionOptions(config.temporal)
    );
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          message: 'Failed to connect benchmark worker to Temporal',
          target: connectionTarget,
          error: serializeError(error),
        },
        null,
        2
      )
    );
    throw error;
  }

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

function getTlsMode(config: TemporalConnectionConfig): 'apiKey' | 'mTLS' | 'none' {
  if (config.clientCert && config.clientKey) {
    return 'mTLS';
  }

  if (config.apiKey) {
    return 'apiKey';
  }

  return 'none';
}

function serializeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return {
      value: inspect(error, { depth: 5, breakLength: Infinity }),
    };
  }

  const serialized: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  };

  if (error.stack) {
    serialized.stack = error.stack;
  }

  const extraProperties = getExtraErrorProperties(error);
  if (Object.keys(extraProperties).length > 0) {
    serialized.properties = extraProperties;
  }

  const cause = getErrorCause(error);
  if (cause !== undefined) {
    serialized.cause = serializeError(cause);
  }

  return serialized;
}

function getExtraErrorProperties(error: Error): Record<string, string> {
  const extraProperties: Record<string, string> = {};

  for (const propertyName of Object.getOwnPropertyNames(error)) {
    if (
      propertyName === 'name' ||
      propertyName === 'message' ||
      propertyName === 'stack' ||
      propertyName === 'cause'
    ) {
      continue;
    }

    const value = (error as Error & Record<string, unknown>)[propertyName];
    extraProperties[propertyName] = inspect(value, {
      depth: 5,
      breakLength: Infinity,
    });
  }

  return extraProperties;
}

function getErrorCause(error: Error): unknown {
  return (error as Error & { cause?: unknown }).cause;
}
