#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
STATE_FILE="${STATE_FILE:-$PROJECT_ROOT/deploy/aws-benchmark-instance.env}"

INPUT_REGION="${AWS_REGION:-${REGION:-}}"
INPUT_INSTANCE_ID="${INSTANCE_ID:-}"
INPUT_SECURITY_GROUP_ID="${SECURITY_GROUP_ID:-}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd aws

if [[ -f "$STATE_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$STATE_FILE"
fi

REGION="${INPUT_REGION:-${REGION:-us-east-1}}"
INSTANCE_ID="${INPUT_INSTANCE_ID:-${INSTANCE_ID:-}}"
SECURITY_GROUP_ID="${INPUT_SECURITY_GROUP_ID:-${SECURITY_GROUP_ID:-}}"

if [[ -z "${INSTANCE_ID:-}" ]]; then
  echo "INSTANCE_ID is not set and no state file was found at $STATE_FILE" >&2
  exit 1
fi

echo "Terminating instance $INSTANCE_ID in $REGION..."
aws ec2 terminate-instances --instance-ids "$INSTANCE_ID" --region "$REGION" >/dev/null
aws ec2 wait instance-terminated --instance-ids "$INSTANCE_ID" --region "$REGION"

if [[ -n "${SECURITY_GROUP_ID:-}" ]]; then
  echo "Deleting security group $SECURITY_GROUP_ID..."
  aws ec2 delete-security-group --group-id "$SECURITY_GROUP_ID" --region "$REGION"
fi

rm -f "$STATE_FILE"

echo "Benchmark instance cleanup finished."
