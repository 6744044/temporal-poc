#!/usr/bin/env bash

COMMON_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$COMMON_DIR/../.." && pwd)"
CLOUDSHELL_CONFIG_FILE_DEFAULT="${CLOUDSHELL_CONFIG_FILE_DEFAULT:-$PROJECT_ROOT/scripts/aws/cloudshell-config.env}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

log() {
  printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

sleep_with_progress() {
  local total_seconds="$1"
  local label="${2:-Waiting}"
  local step="${3:-15}"
  local remaining="$total_seconds"

  while (( remaining > 0 )); do
    local current_step="$step"
    if (( remaining < current_step )); then
      current_step="$remaining"
    fi

    log "$label (${remaining}s remaining)"
    sleep "$current_step"
    remaining=$((remaining - current_step))
  done
}

load_cloudshell_config() {
  local config_file="${CLOUDSHELL_CONFIG_FILE:-$CLOUDSHELL_CONFIG_FILE_DEFAULT}"

  if [[ -f "$config_file" ]]; then
    # shellcheck disable=SC1090
    source "$config_file"
  fi

  export AWS_REGION="${AWS_REGION:-${REGION:-us-east-1}}"
  export REGION="${REGION:-$AWS_REGION}"

  export BENCH_TASK_QUEUE="${BENCH_TASK_QUEUE:-benchmark-latency}"
  export BENCH_DEPLOYMENT_LABEL="${BENCH_DEPLOYMENT_LABEL:-aws-ec2}"
  export BENCH_ACTIVITY_COUNT="${BENCH_ACTIVITY_COUNT:-5}"
  export BENCH_LOCAL_ACTIVITY_STEPS="${BENCH_LOCAL_ACTIVITY_STEPS:-}"
  export BENCH_ACTIVITY_DELAY_MS="${BENCH_ACTIVITY_DELAY_MS:-1}"
  export BENCH_TOTAL_WORKFLOWS="${BENCH_TOTAL_WORKFLOWS:-1000}"
  export BENCH_WARMUP_WORKFLOWS="${BENCH_WARMUP_WORKFLOWS:-100}"
  export BENCH_CONCURRENCY="${BENCH_CONCURRENCY:-10}"
  export BENCH_PAYLOAD_BYTES="${BENCH_PAYLOAD_BYTES:-1024}"
}

require_config_value() {
  local name="$1"
  local value="${!name:-}"

  if [[ -z "$value" || "$value" == "__REQUIRED__" ]]; then
    echo "Required config value is missing: $name" >&2
    echo "Update scripts/aws/cloudshell-config.env or export $name before running." >&2
    exit 1
  fi
}

prompt_for_secret() {
  local name="$1"
  local prompt="${2:-Enter $name: }"

  if [[ -n "${!name:-}" ]]; then
    return 0
  fi

  if [[ ! -t 0 ]]; then
    echo "Required secret is not set and no interactive terminal is available: $name" >&2
    exit 1
  fi

  read -r -s -p "$prompt" "$name"
  echo
  export "$name"

  if [[ -z "${!name:-}" ]]; then
    echo "Secret value cannot be empty: $name" >&2
    exit 1
  fi
}
