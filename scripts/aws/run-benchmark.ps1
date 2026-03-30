param(
  [Parameter(Mandatory = $true)]
  [string]$InstanceId,
  [string]$Region = 'us-east-1',
  [int]$TotalWorkflows = 2000,
  [int]$WarmupWorkflows = 100,
  [int]$Concurrency = 10,
  [int]$ActivityDelayMs = 1,
  [int]$PayloadBytes = 64,
  [string]$TaskQueue = 'benchmark-latency',
  [string]$ResultsDir = '/opt/temporal-bench/results'
)

$ErrorActionPreference = 'Stop'

function Invoke-AwsText {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  return (& aws @Arguments).Trim()
}

function Invoke-SsmCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$InstanceId,
    [Parameter(Mandatory = $true)]
    [string[]]$Commands,
    [Parameter(Mandatory = $true)]
    [string]$Comment,
    [Parameter(Mandatory = $true)]
    [string]$Region
  )

  $tempParamsPath = Join-Path ([System.IO.Path]::GetTempPath()) "temporal-bench-ssm-$([System.Guid]::NewGuid()).json"
  @{
    commands = $Commands
  } | ConvertTo-Json -Depth 5 | Set-Content -Path $tempParamsPath -Encoding UTF8

  try {
    $commandId = Invoke-AwsText -Arguments @(
      'ssm', 'send-command',
      '--instance-ids', $InstanceId,
      '--document-name', 'AWS-RunShellScript',
      '--comment', $Comment,
      '--parameters', "file://$tempParamsPath",
      '--query', 'Command.CommandId',
      '--output', 'text',
      '--region', $Region
    )
  }
  finally {
    Remove-Item $tempParamsPath -Force -ErrorAction SilentlyContinue
  }

  for ($attempt = 0; $attempt -lt 180; $attempt++) {
    $status = Invoke-AwsText -Arguments @(
      'ssm', 'get-command-invocation',
      '--command-id', $commandId,
      '--instance-id', $InstanceId,
      '--query', 'Status',
      '--output', 'text',
      '--region', $Region
    )

    if ($status -in @('Success', 'Failed', 'Cancelled', 'TimedOut', 'Cancelling')) {
      $stdout = Invoke-AwsText -Arguments @(
        'ssm', 'get-command-invocation',
        '--command-id', $commandId,
        '--instance-id', $InstanceId,
        '--query', 'StandardOutputContent',
        '--output', 'text',
        '--region', $Region
      )
      $stderr = Invoke-AwsText -Arguments @(
        'ssm', 'get-command-invocation',
        '--command-id', $commandId,
        '--instance-id', $InstanceId,
        '--query', 'StandardErrorContent',
        '--output', 'text',
        '--region', $Region
      )

      return [PSCustomObject]@{
        CommandId = $commandId
        Status    = $status
        Stdout    = $stdout
        Stderr    = $stderr
      }
    }

    Start-Sleep -Seconds 5
  }

  throw "Timed out waiting for SSM command $commandId to finish."
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$localResultsDir = Join-Path $projectRoot 'results\aws'
New-Item -ItemType Directory -Path $localResultsDir -Force | Out-Null

$benchmarkRun = Invoke-SsmCommand -InstanceId $InstanceId -Region $Region -Comment 'Temporal benchmark client run' -Commands @(
  'set -euxo pipefail',
  'source /etc/temporal-bench.env',
  "export BENCH_TOTAL_WORKFLOWS=$TotalWorkflows",
  "export BENCH_WARMUP_WORKFLOWS=$WarmupWorkflows",
  "export BENCH_CONCURRENCY=$Concurrency",
  "export BENCH_ACTIVITY_DELAY_MS=$ActivityDelayMs",
  "export BENCH_PAYLOAD_BYTES=$PayloadBytes",
  "export BENCH_TASK_QUEUE=$TaskQueue",
  "export BENCH_RESULTS_DIR=$ResultsDir",
  'cd /opt/temporal-bench',
  '/usr/bin/node /opt/temporal-bench/lib/bench/client.js'
)

Write-Host ''
Write-Host 'Benchmark client output:'
Write-Host $benchmarkRun.Stdout

if ($benchmarkRun.Status -ne 'Success') {
  Write-Host ''
  Write-Host 'Benchmark client stderr:'
  Write-Host $benchmarkRun.Stderr
  throw "Benchmark run failed with status $($benchmarkRun.Status)."
}

$summaryFetch = Invoke-SsmCommand -InstanceId $InstanceId -Region $Region -Comment 'Fetch latest Temporal benchmark summary' -Commands @(
  'set -euxo pipefail',
  "latest_summary=`$(ls -t $ResultsDir/*.summary.json | sed -n 1p)",
  'cat "$latest_summary"'
)

if ($summaryFetch.Status -ne 'Success') {
  throw "Failed to fetch benchmark summary. Status: $($summaryFetch.Status)"
}

$summaryJson = $summaryFetch.Stdout.Trim()
$summary = $summaryJson | ConvertFrom-Json
$timestamp = Get-Date -Format 'yyyyMMddHHmmss'
$localSummaryPath = Join-Path $localResultsDir "$($summary.benchmarkLabel)-$timestamp.summary.json"
$summaryJson | Set-Content -Path $localSummaryPath -Encoding UTF8

Write-Host ''
Write-Host "Saved summary to $localSummaryPath"
