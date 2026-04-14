import fs from 'fs/promises';
import path from 'path';
import type { ConnectionOptions } from '@temporalio/client';
import type { NativeConnectionOptions } from '@temporalio/worker';
import { buildBenchmarkStepName, type BenchmarkStepName } from './types';

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
  activityCount: number;
  localActivitySteps: BenchmarkStepName[];
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
  const activityCount = getEnvPositiveInt('BENCH_ACTIVITY_COUNT', 5);

  return {
    temporal,
    taskQueue: getEnvString('BENCH_TASK_QUEUE', 'benchmark-latency'),
    deploymentLabel: getEnvString('BENCH_DEPLOYMENT_LABEL', 'local'),
    totalWorkflows: getEnvInt('BENCH_TOTAL_WORKFLOWS', 2000),
    warmupWorkflows: getEnvInt('BENCH_WARMUP_WORKFLOWS', 100),
    concurrency: getEnvInt('BENCH_CONCURRENCY', 10),
    activityCount,
    localActivitySteps: parseLocalActivitySteps(
      process.env.BENCH_LOCAL_ACTIVITY_STEPS,
      activityCount
    ),
    activityDelayMs: getEnvInt('BENCH_ACTIVITY_DELAY_MS', 1),
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

function getEnvPositiveInt(key: string, defaultValue: number): number {
  const parsed = getEnvInt(key, defaultValue);
  if (parsed <= 0) {
    throw new Error(`${key} must be greater than zero. Received: ${parsed}`);
  }

  return parsed;
}

export function parseLocalActivitySteps(
  rawValue: string | undefined,
  activityCount: number
): BenchmarkStepName[] {
  if (rawValue === undefined || rawValue.trim() === '') {
    return [];
  }

  const uniqueStepIndexes = new Set<number>();
  for (const token of rawValue.split(',')) {
    const normalizedToken = token.trim();
    if (normalizedToken === '') {
      continue;
    }

    const index = parseLocalActivityStepIndex(normalizedToken);
    if (index <= 0 || index > activityCount) {
      throw new Error(
        `BENCH_LOCAL_ACTIVITY_STEPS must reference steps between 1 and ${activityCount}. Received: ${normalizedToken}`
      );
    }

    uniqueStepIndexes.add(index);
  }

  return [...uniqueStepIndexes]
    .sort((left, right) => left - right)
    .map((index) => buildBenchmarkStepName(index));
}

function parseLocalActivityStepIndex(token: string): number {
  const stepMatch = /^step(\d+)$/i.exec(token);
  const numericText = stepMatch?.[1] ?? token;
  if (!/^[1-9]\d*$/.test(numericText)) {
    throw new Error(
      `BENCH_LOCAL_ACTIVITY_STEPS must be a comma-separated list of positive step numbers. Received: ${token}`
    );
  }

  return Number.parseInt(numericText, 10);
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
