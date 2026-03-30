import {
  DefaultLogger,
  LogLevel,
  Runtime,
  makeTelemetryFilterString,
} from '@temporalio/worker';

let runtimeInstalled = false;

export function installRuntime(options: {
  logLevel: LogLevel;
  metricsBindAddress?: string;
}): void {
  if (runtimeInstalled) {
    return;
  }

  const logger = new DefaultLogger(options.logLevel, (entry) => {
    const payload = {
      timestamp: new Date().toISOString(),
      level: entry.level,
      message: entry.message,
      meta: entry.meta ?? {},
    };

    process.stdout.write(`${JSON.stringify(payload)}\n`);
  });

  Runtime.install({
    logger,
    telemetryOptions: {
      ...(options.metricsBindAddress
        ? {
            metrics: {
              prometheus: {
                bindAddress: options.metricsBindAddress,
              },
            },
          }
        : {}),
      logging: {
        filter: makeTelemetryFilterString({
          core: options.logLevel,
          other: 'WARN',
        }),
        forward: {},
      },
    },
  });

  runtimeInstalled = true;
}
