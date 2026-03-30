#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
STATE_FILE="${STATE_FILE:-$PROJECT_ROOT/deploy/aws-benchmark-instance.env}"

source "$SCRIPT_DIR/common.sh"
load_cloudshell_config
prompt_for_secret TEMPORAL_API_KEY "Enter Temporal API key: "
require_config_value TEMPORAL_ADDRESS
require_config_value TEMPORAL_NAMESPACE

BENCH_TOTAL_WORKFLOWS="${BENCH_TOTAL_WORKFLOWS:-1000}"
BENCH_WARMUP_WORKFLOWS="${BENCH_WARMUP_WORKFLOWS:-100}"
BENCH_CONCURRENCY="${BENCH_CONCURRENCY:-10}"
BENCH_ACTIVITY_DELAY_MS="${BENCH_ACTIVITY_DELAY_MS:-1}"
BENCH_PAYLOAD_BYTES="${BENCH_PAYLOAD_BYTES:-64}"
BENCH_TASK_QUEUE="${BENCH_TASK_QUEUE:-benchmark-latency}"
BENCH_DEPLOYMENT_LABEL="${BENCH_DEPLOYMENT_LABEL:-aws-ec2}"
BENCH_RESULTS_DIR="${BENCH_RESULTS_DIR:-$PROJECT_ROOT/results/aws}"

maybe_install_node() {
  if command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
    return 0
  fi

  if command -v sudo >/dev/null 2>&1 && command -v dnf >/dev/null 2>&1; then
    echo "Installing nodejs and npm..."
    sudo dnf install -y nodejs npm
    return 0
  fi

  echo "Missing node/npm and automatic installation is unavailable." >&2
  exit 1
}

maybe_install_node
require_cmd mkdir

cd "$PROJECT_ROOT"

if [[ ! -d node_modules ]]; then
  echo "Installing project dependencies..."
  npm ci
fi

echo "Building benchmark client..."
npm run build

mkdir -p "$BENCH_RESULTS_DIR"

if [[ -f "$STATE_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$STATE_FILE"
  echo "Using worker instance: ${INSTANCE_ID:-unknown}"
fi

export BENCH_TOTAL_WORKFLOWS
export BENCH_WARMUP_WORKFLOWS
export BENCH_CONCURRENCY
export BENCH_ACTIVITY_DELAY_MS
export BENCH_PAYLOAD_BYTES
export BENCH_TASK_QUEUE
export BENCH_DEPLOYMENT_LABEL
export BENCH_RESULTS_DIR

echo "Running benchmark client..."
node lib/bench/client.js

LATEST_SUMMARY="$(ls -t "$BENCH_RESULTS_DIR"/*.summary.json | head -n 1)"

echo
echo "Latest summary:"
echo "  $LATEST_SUMMARY"
