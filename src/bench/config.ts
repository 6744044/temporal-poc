import fs from 'fs/promises';
import path from 'path';
import type { ConnectionOptions } from '@temporalio/client';
import type { NativeConnectionOptions } from '@temporalio/worker';

export interface TemporalConnectionConfig {
  address: string;
  namespace: string;
  clientCert?: Buffer;
  clientKey?: Buffer;
  apiKey?: string;
}

export interface BenchmarkConfig {
  temporal: TemporalConnectionConfig;
  taskQueue: string;
  deploymentLabel: string;
  totalWorkflows: number;
  warmupWorkflows: number;
  concurrency: number;
  activityDelayMs: number;
  payloadBytes: number;
  resultsDir: string;
  metricsBindAddress: string;
  logLevel: 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  workflowTaskExecutions: number;
  workflowTaskPolls: number;
  activityTaskExecutions: number;
  activityTaskPolls: number;
}

export async function loadBenchmarkConfig(): Promise<BenchmarkConfig> {
  const temporal = await loadTemporalConnectionConfig();

  return {
    temporal,
    taskQueue: getEnvString('BENCH_TASK_QUEUE', 'benchmark-latency'),
    deploymentLabel: getEnvString('BENCH_DEPLOYMENT_LABEL', 'local'),
    totalWorkflows: getEnvInt('BENCH_TOTAL_WORKFLOWS', 2000),
    warmupWorkflows: getEnvInt('BENCH_WARMUP_WORKFLOWS', 100),
    concurrency: getEnvInt('BENCH_CONCURRENCY', 10),
    activityDelayMs: getEnvInt('BENCH_ACTIVITY_DELAY_MS', 5),
    payloadBytes: getEnvInt('BENCH_PAYLOAD_BYTES', 64),
    resultsDir: path.resolve(getEnvString('BENCH_RESULTS_DIR', './results')),
    metricsBindAddress: getEnvString('BENCH_METRICS_BIND_ADDRESS', '0.0.0.0:9464'),
    logLevel: getEnvLogLevel('BENCH_LOG_LEVEL', 'INFO'),
    workflowTaskExecutions: getEnvInt('BENCH_WORKFLOW_TASK_EXECUTIONS', 20),
    workflowTaskPolls: getEnvInt('BENCH_WORKFLOW_TASK_POLLS', 10),
    activityTaskExecutions: getEnvInt('BENCH_ACTIVITY_TASK_EXECUTIONS', 20),
    activityTaskPolls: getEnvInt('BENCH_ACTIVITY_TASK_POLLS', 10),
  };
}

export async function loadTemporalConnectionConfig(): Promise<TemporalConnectionConfig> {
  return {
    address: getEnvString('TEMPORAL_ADDRESS', 'localhost:7233'),
    namespace: getEnvString('TEMPORAL_NAMESPACE', 'default'),
    clientCert: await maybeReadFileAsBuffer(process.env.TEMPORAL_TLS_CERT),
    clientKey: await maybeReadFileAsBuffer(process.env.TEMPORAL_TLS_KEY),
    apiKey: process.env.TEMPORAL_API_KEY,
  };
}

export function toClientConnectionOptions(
  config: TemporalConnectionConfig
): ConnectionOptions {
  return buildConnectionOptions(config);
}

export function toWorkerConnectionOptions(
  config: TemporalConnectionConfig
): NativeConnectionOptions {
  return buildConnectionOptions(config);
}

function buildConnectionOptions(
  config: TemporalConnectionConfig
): ConnectionOptions & NativeConnectionOptions {
  const connectionOptions: ConnectionOptions & NativeConnectionOptions = {
    address: config.address,
    connectTimeout: '30s',
  };

  if (config.clientCert && config.clientKey) {
    connectionOptions.tls = {
      clientCertPair: {
        crt: config.clientCert,
        key: config.clientKey,
      },
    };
  } else if (config.apiKey) {
    connectionOptions.tls = true;
    connectionOptions.apiKey = config.apiKey;
    connectionOptions.metadata = {
      'temporal-namespace': config.namespace,
    };
  } else {
    connectionOptions.tls = false;
  }

  return connectionOptions;
}

function getEnvString(key: string, defaultValue: string): string {
  const value = process.env[key];
  return value === undefined || value.trim() === '' ? defaultValue : value.trim();
}

function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value.trim() === '') return defaultValue;

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`${key} must be a non-negative integer. Received: ${value}`);
  }

  return parsed;
}

function getEnvLogLevel(
  key: string,
  defaultValue: BenchmarkConfig['logLevel']
): BenchmarkConfig['logLevel'] {
  const value = process.env[key];
  if (value === undefined || value.trim() === '') return defaultValue;

  const normalized = value.trim().toUpperCase();
  switch (normalized) {
    case 'TRACE':
    case 'DEBUG':
    case 'INFO':
    case 'WARN':
    case 'ERROR':
      return normalized;
    default:
      throw new Error(
        `${key} must be one of TRACE, DEBUG, INFO, WARN, ERROR. Received: ${value}`
      );
  }
}

async function maybeReadFileAsBuffer(pathValue?: string): Promise<Buffer | undefined> {
  if (pathValue === undefined || pathValue.trim() === '') return undefined;
  return await fs.readFile(pathValue);
}
