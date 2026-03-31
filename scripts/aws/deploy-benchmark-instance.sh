#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_DIR="${DEPLOY_DIR:-$PROJECT_ROOT/deploy}"
STATE_FILE="${STATE_FILE:-$DEPLOY_DIR/aws-benchmark-instance.env}"

source "$SCRIPT_DIR/common.sh"
load_cloudshell_config
prompt_for_secret TEMPORAL_API_KEY "Enter Temporal API key: "
require_config_value TEMPORAL_ADDRESS
require_config_value TEMPORAL_NAMESPACE

REGION="${AWS_REGION:-${REGION:-us-east-1}}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.small}"
TASK_QUEUE="${TASK_QUEUE:-$BENCH_TASK_QUEUE}"
DEPLOYMENT_LABEL="${DEPLOYMENT_LABEL:-$BENCH_DEPLOYMENT_LABEL}"
METRICS_BIND_ADDRESS="${BENCH_METRICS_BIND_ADDRESS:-0.0.0.0:9464}"
LOG_LEVEL="${BENCH_LOG_LEVEL:-INFO}"
SECURITY_GROUP_NAME="${SECURITY_GROUP_NAME:-temporal-bench-$(date +%s)}"
TAG_NAME="${TAG_NAME:-temporal-bench-worker}"
WAIT_AFTER_BOOT_SECONDS="${WAIT_AFTER_BOOT_SECONDS:-180}"
REPO_URL="${REPO_URL:-$(git -C "$PROJECT_ROOT" config --get remote.origin.url 2>/dev/null || true)}"
REPO_BRANCH="${REPO_BRANCH:-$(git -C "$PROJECT_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || true)}"

require_cmd aws

if [[ -z "$REPO_URL" || -z "$REPO_BRANCH" ]]; then
  echo "Unable to determine REPO_URL/REPO_BRANCH from git. Set them explicitly." >&2
  exit 1
fi

mkdir -p "$DEPLOY_DIR"

VPC_ID="$(aws ec2 describe-vpcs \
  --region "$REGION" \
  --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' \
  --output text)"

if [[ "$VPC_ID" == "None" || -z "$VPC_ID" ]]; then
  echo "No default VPC found in region $REGION" >&2
  exit 1
fi

SUBNET_ID="$(aws ec2 describe-subnets \
  --region "$REGION" \
  --filters Name=vpc-id,Values="$VPC_ID" Name=default-for-az,Values=true \
  --query 'Subnets[0].SubnetId' \
  --output text)"

if [[ "$SUBNET_ID" == "None" || -z "$SUBNET_ID" ]]; then
  echo "No default subnet found in VPC $VPC_ID" >&2
  exit 1
fi

AMI_ID="$(aws ssm get-parameter \
  --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64 \
  --region "$REGION" \
  --query 'Parameter.Value' \
  --output text)"

SECURITY_GROUP_ID="$(aws ec2 create-security-group \
  --group-name "$SECURITY_GROUP_NAME" \
  --description "Temporal benchmark worker" \
  --vpc-id "$VPC_ID" \
  --region "$REGION" \
  --query 'GroupId' \
  --output text)"

USER_DATA_PATH="$DEPLOY_DIR/user-data.sh"
cat >"$USER_DATA_PATH" <<EOF
#!/usr/bin/env bash
set -euo pipefail

dnf install -y git nodejs npm
git clone --branch "$REPO_BRANCH" "$REPO_URL" /opt/temporal-poc
cd /opt/temporal-poc
npm ci
npm run build

cat >/etc/temporal-bench.env <<'BENCH_ENV'
TEMPORAL_ADDRESS=${TEMPORAL_ADDRESS}
TEMPORAL_NAMESPACE=${TEMPORAL_NAMESPACE}
TEMPORAL_API_KEY=${TEMPORAL_API_KEY}
BENCH_TASK_QUEUE=${TASK_QUEUE}
BENCH_DEPLOYMENT_LABEL=${DEPLOYMENT_LABEL}
BENCH_METRICS_BIND_ADDRESS=${METRICS_BIND_ADDRESS}
BENCH_LOG_LEVEL=${LOG_LEVEL}
BENCH_ENV

cat >/etc/systemd/system/temporal-bench-worker.service <<'BENCH_UNIT'
[Unit]
Description=Temporal benchmark worker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/temporal-bench.env
WorkingDirectory=/opt/temporal-poc
ExecStart=/usr/bin/env node /opt/temporal-poc/lib/bench/worker.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
BENCH_UNIT

systemctl daemon-reload
systemctl enable --now temporal-bench-worker.service
EOF

INSTANCE_ID="$(aws ec2 run-instances \
  --image-id "$AMI_ID" \
  --instance-type "$INSTANCE_TYPE" \
  --subnet-id "$SUBNET_ID" \
  --security-group-ids "$SECURITY_GROUP_ID" \
  --count 1 \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$TAG_NAME}]" \
  --user-data "file://$USER_DATA_PATH" \
  --region "$REGION" \
  --query 'Instances[0].InstanceId' \
  --output text)"

aws ec2 wait instance-running --instance-ids "$INSTANCE_ID" --region "$REGION"
aws ec2 wait instance-status-ok --instance-ids "$INSTANCE_ID" --region "$REGION"

PUBLIC_IP="$(aws ec2 describe-instances \
  --instance-ids "$INSTANCE_ID" \
  --region "$REGION" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)"

cat >"$STATE_FILE" <<EOF
REGION=$REGION
INSTANCE_ID=$INSTANCE_ID
SECURITY_GROUP_ID=$SECURITY_GROUP_ID
PUBLIC_IP=$PUBLIC_IP
VPC_ID=$VPC_ID
SUBNET_ID=$SUBNET_ID
AMI_ID=$AMI_ID
TASK_QUEUE=$TASK_QUEUE
DEPLOYMENT_LABEL=$DEPLOYMENT_LABEL
REPO_URL=$REPO_URL
REPO_BRANCH=$REPO_BRANCH
EOF

echo "Worker instance created."
echo "  Instance ID:      $INSTANCE_ID"
echo "  Security Group:   $SECURITY_GROUP_ID"
echo "  Public IP:        $PUBLIC_IP"
echo "  State file:       $STATE_FILE"
echo "  Waiting ${WAIT_AFTER_BOOT_SECONDS}s for first-time setup to finish..."

sleep "$WAIT_AFTER_BOOT_SECONDS"

echo
echo "Next step:"
echo "  bash scripts/aws/run-benchmark.sh"
