# Temporal Money Transfer example in TypeScript

This is the companion code for the tutorial [Run your first Temporal Application with TypeScript](https://learn.temporal.io/getting_started/typescript/first_program_in_typescript).

### Running this sample:

1. Make sure Temporal Server is running locally (see the [quick install guide](https://docs.temporal.io/server/quick-install/)).
1. `npm install` to install dependencies.
1. `npm run worker` to start the Worker.
1. In another shell, `npm run client` to run the Workflow Client.

The Workflow will return:

```bash
Started Workflow workflow-OyIhuWr6X4opgqtYnhxuX with RunID a85055c8-3fce-466e-b4f6-8f66c16614e6
Transfer complete (transaction IDs: w1328871163, d0590412617)
```

### Running the latency benchmark

This project also contains a deterministic benchmark path under `src/bench` for
comparing Temporal latency across environments.

#### Local smoke test

1. Start a local Temporal dev server: `temporal server start-dev`
1. Start the benchmark worker: `npm run bench:worker`
1. Run the benchmark client:

```powershell
$env:BENCH_TOTAL_WORKFLOWS='200'
$env:BENCH_WARMUP_WORKFLOWS='20'
$env:BENCH_CONCURRENCY='10'
$env:BENCH_ACTIVITY_COUNT='5'
$env:BENCH_LOCAL_ACTIVITY_STEPS='3'
$env:BENCH_ACTIVITY_DELAY_MS='1'
npm run bench:client
```

The client writes JSONL records and a summary JSON file under `results/`.
The summary also includes mean-based derived estimates for:

1. Worker overhead per activity
1. Network + Temporal residual per workflow
1. Network + Temporal residual per activity

The residual values are not pure network timings. They are the portion left after
subtracting measured activity runtime from workflow end-to-end latency, so they
still include transport, polling, scheduling, workflow execution, and
serialization overhead.

Use `BENCH_ACTIVITY_COUNT` to repeat the same benchmark activity multiple times
per workflow without changing code. The default is `5`.

Use `BENCH_LOCAL_ACTIVITY_STEPS` to make only selected steps local activities,
for example `3` or `3,4`. Leave it empty to keep all activities normal.

#### Comparing two runs

```powershell
npm run bench:compare -- .\results\onprem.summary.json .\results\aws.summary.json
```

#### Deploying the worker to AWS EC2

The PowerShell scripts under `scripts/aws` expect:

1. AWS CLI installed and authenticated on the machine running the script.
1. A Temporal Cloud namespace endpoint and API key.

Deploy the worker host:

```powershell
.\scripts\aws\deploy-benchmark-instance.ps1 `
  -Region us-east-1 `
  -TemporalAddress '<namespace>.<account>.tmprl.cloud:7233' `
  -TemporalNamespace '<namespace>.<account>' `
  -TemporalApiKey '<api-key>' `
  -DeploymentLabel 'aws-ec2'
```

Run the benchmark remotely through SSM:

```powershell
.\scripts\aws\run-benchmark.ps1 `
  -Region us-east-1 `
  -InstanceId '<ec2-instance-id>' `
  -TotalWorkflows 2000 `
  -WarmupWorkflows 100 `
  -Concurrency 10 `
  -LocalActivitySteps '3,4' `
  -ActivityDelayMs 1
```

Terminate the instance when done:

```powershell
.\scripts\aws\terminate-benchmark-instance.ps1 `
  -Region us-east-1 `
  -InstanceId '<ec2-instance-id>'
```

#### Reusing from AWS CloudShell

The repo also includes Linux-friendly `bash` scripts for CloudShell:

1. Edit the checked-in non-secret config once:

```bash
nano scripts/aws/cloudshell-config.env
```

Set:

1. `TEMPORAL_ADDRESS`
1. `TEMPORAL_NAMESPACE`
1. Optional benchmark defaults such as concurrency, activity count, local activity steps, and workflow count

1. Run the deploy script. If `TEMPORAL_API_KEY` is not already set in the
   session, the script will prompt you to enter it securely and continue:

```bash
bash scripts/aws/deploy-benchmark-instance.sh
```

1. Run the benchmark client from CloudShell:

```bash
bash scripts/aws/run-benchmark.sh
```

To switch selected steps to local activities, set for example
`export BENCH_LOCAL_ACTIVITY_STEPS=3,4` before running the client.

1. Clean up the worker instance:

```bash
bash scripts/aws/terminate-benchmark-instance.sh
```

The deploy script stores the created EC2 instance ID and security group ID in
`deploy/aws-benchmark-instance.env` so the terminate script can reuse them.
