param(
  [string]$Region = 'us-east-1',
  [Parameter(Mandatory = $true)]
  [string]$TemporalAddress,
  [Parameter(Mandatory = $true)]
  [string]$TemporalNamespace,
  [Parameter(Mandatory = $true)]
  [string]$TemporalApiKey,
  [string]$InstanceType = 't3.small',
  [string]$DeploymentLabel = 'aws-ec2',
  [string]$TaskQueue = 'benchmark-latency',
  [string]$ArtifactBucket = '',
  [string]$RoleName = 'temporal-benchmark-ssm-role',
  [string]$InstanceProfileName = 'temporal-benchmark-ssm-profile',
  [string]$SecurityGroupName = 'temporal-benchmark-sg',
  [string]$TagName = 'temporal-benchmark-worker'
)

$ErrorActionPreference = 'Stop'

function Invoke-AwsText {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments
  )

  return (& aws @Arguments).Trim()
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$deployDir = Join-Path $projectRoot 'deploy'
New-Item -ItemType Directory -Path $deployDir -Force | Out-Null

Push-Location $projectRoot
try {
  npm run build

  $accountId = Invoke-AwsText -Arguments @(
    'sts', 'get-caller-identity',
    '--query', 'Account',
    '--output', 'text',
    '--region', $Region
  )

  if ([string]::IsNullOrWhiteSpace($ArtifactBucket)) {
    $ArtifactBucket = "temporal-bench-$accountId-$Region"
  }

  $bucketExists = $true
  try {
    & aws s3api head-bucket --bucket $ArtifactBucket --region $Region | Out-Null
  }
  catch {
    $bucketExists = $false
  }

  if (-not $bucketExists) {
    if ($Region -eq 'us-east-1') {
      & aws s3api create-bucket --bucket $ArtifactBucket --region $Region | Out-Null
    }
    else {
      & aws s3api create-bucket --bucket $ArtifactBucket --region $Region --create-bucket-configuration "LocationConstraint=$Region" | Out-Null
    }
  }

  $artifactName = "temporal-benchmark-$((Get-Date).ToString('yyyyMMddHHmmss')).zip"
  $artifactPath = Join-Path $deployDir $artifactName
  if (Test-Path $artifactPath) {
    Remove-Item $artifactPath -Force
  }

  Compress-Archive -Path @(
    (Join-Path $projectRoot 'lib'),
    (Join-Path $projectRoot 'package.json'),
    (Join-Path $projectRoot 'package-lock.json')
  ) -DestinationPath $artifactPath -Force

  $artifactKey = "artifacts/$artifactName"
  & aws s3 cp $artifactPath "s3://$ArtifactBucket/$artifactKey" --region $Region | Out-Host
  $artifactUrl = Invoke-AwsText -Arguments @(
    's3', 'presign',
    "s3://$ArtifactBucket/$artifactKey",
    '--expires-in', '43200',
    '--region', $Region
  )

  $trustPolicyPath = Join-Path $deployDir 'ec2-trust-policy.json'
  @'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ec2.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
'@ | Set-Content -Path $trustPolicyPath -Encoding UTF8

  $roleExists = $true
  try {
    & aws iam get-role --role-name $RoleName | Out-Null
  }
  catch {
    $roleExists = $false
  }

  if (-not $roleExists) {
    & aws iam create-role --role-name $RoleName --assume-role-policy-document "file://$trustPolicyPath" | Out-Null
  }

  & aws iam attach-role-policy --role-name $RoleName --policy-arn 'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore' | Out-Null

  $profileExists = $true
  try {
    & aws iam get-instance-profile --instance-profile-name $InstanceProfileName | Out-Null
  }
  catch {
    $profileExists = $false
  }

  if (-not $profileExists) {
    & aws iam create-instance-profile --instance-profile-name $InstanceProfileName | Out-Null
    Start-Sleep -Seconds 5
  }

  try {
    & aws iam add-role-to-instance-profile --instance-profile-name $InstanceProfileName --role-name $RoleName | Out-Null
  }
  catch {
    # Ignore "already exists" style errors.
  }

  Start-Sleep -Seconds 10

  $vpcId = Invoke-AwsText -Arguments @(
    'ec2', 'describe-vpcs',
    '--filters', 'Name=isDefault,Values=true',
    '--query', 'Vpcs[0].VpcId',
    '--output', 'text',
    '--region', $Region
  )

  if ($vpcId -eq 'None' -or [string]::IsNullOrWhiteSpace($vpcId)) {
    throw "No default VPC found in region $Region. Adjust the script to target a specific VPC/subnet."
  }

  $subnetId = Invoke-AwsText -Arguments @(
    'ec2', 'describe-subnets',
    '--filters', "Name=vpc-id,Values=$vpcId", 'Name=default-for-az,Values=true',
    '--query', 'Subnets[0].SubnetId',
    '--output', 'text',
    '--region', $Region
  )

  if ($subnetId -eq 'None' -or [string]::IsNullOrWhiteSpace($subnetId)) {
    throw "No default subnet found in VPC $vpcId."
  }

  $securityGroupId = Invoke-AwsText -Arguments @(
    'ec2', 'describe-security-groups',
    '--filters', "Name=vpc-id,Values=$vpcId", "Name=group-name,Values=$SecurityGroupName",
    '--query', 'SecurityGroups[0].GroupId',
    '--output', 'text',
    '--region', $Region
  )

  if ($securityGroupId -eq 'None' -or [string]::IsNullOrWhiteSpace($securityGroupId)) {
    $securityGroupId = Invoke-AwsText -Arguments @(
      'ec2', 'create-security-group',
      '--group-name', $SecurityGroupName,
      '--description', 'Security group for Temporal benchmark worker',
      '--vpc-id', $vpcId,
      '--query', 'GroupId',
      '--output', 'text',
      '--region', $Region
    )
  }

  $amiId = Invoke-AwsText -Arguments @(
    'ssm', 'get-parameter',
    '--name', '/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64',
    '--query', 'Parameter.Value',
    '--output', 'text',
    '--region', $Region
  )

  $userDataPath = Join-Path $deployDir 'benchmark-user-data.sh'
  @"
#!/bin/bash
set -euxo pipefail

dnf install -y nodejs npm unzip curl
mkdir -p /opt/temporal-bench
cd /opt/temporal-bench
curl -L '$artifactUrl' -o /tmp/temporal-bench.zip
unzip -o /tmp/temporal-bench.zip -d /opt/temporal-bench
npm ci --omit=dev

cat >/etc/temporal-bench.env <<'EOF'
TEMPORAL_ADDRESS=$TemporalAddress
TEMPORAL_NAMESPACE=$TemporalNamespace
TEMPORAL_API_KEY=$TemporalApiKey
BENCH_TASK_QUEUE=$TaskQueue
BENCH_DEPLOYMENT_LABEL=$DeploymentLabel
BENCH_METRICS_BIND_ADDRESS=0.0.0.0:9464
BENCH_LOG_LEVEL=INFO
EOF

cat >/etc/systemd/system/temporal-bench-worker.service <<'EOF'
[Unit]
Description=Temporal benchmark worker
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=/etc/temporal-bench.env
WorkingDirectory=/opt/temporal-bench
ExecStart=/usr/bin/node /opt/temporal-bench/lib/bench/worker.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now temporal-bench-worker.service
"@ | Set-Content -Path $userDataPath -Encoding Ascii

  $instanceId = Invoke-AwsText -Arguments @(
    'ec2', 'run-instances',
    '--image-id', $amiId,
    '--instance-type', $InstanceType,
    '--iam-instance-profile', "Name=$InstanceProfileName",
    '--security-group-ids', $securityGroupId,
    '--subnet-id', $subnetId,
    '--tag-specifications', "ResourceType=instance,Tags=[{Key=Name,Value=$TagName}]",
    '--user-data', "file://$userDataPath",
    '--query', 'Instances[0].InstanceId',
    '--output', 'text',
    '--region', $Region
  )

  & aws ec2 wait instance-running --instance-ids $instanceId --region $Region

  $ssmReady = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    $pingStatus = Invoke-AwsText -Arguments @(
      'ssm', 'describe-instance-information',
      '--filters', "Key=InstanceIds,Values=$instanceId",
      '--query', 'InstanceInformationList[0].PingStatus',
      '--output', 'text',
      '--region', $Region
    )

    if ($pingStatus -eq 'Online') {
      $ssmReady = $true
      break
    }

    Start-Sleep -Seconds 10
  }

  if (-not $ssmReady) {
    throw "Instance $instanceId is running, but SSM did not become ready within the expected time."
  }

  $publicIp = Invoke-AwsText -Arguments @(
    'ec2', 'describe-instances',
    '--instance-ids', $instanceId,
    '--query', 'Reservations[0].Instances[0].PublicIpAddress',
    '--output', 'text',
    '--region', $Region
  )

  Write-Host ''
  Write-Host 'Benchmark worker instance is ready.'
  Write-Host "  InstanceId: $instanceId"
  Write-Host "  PublicIp:   $publicIp"
  Write-Host "  Region:     $Region"
  Write-Host "  TaskQueue:  $TaskQueue"
  Write-Host ''
  Write-Host 'Next step: run scripts\aws\run-benchmark.ps1 against this instance.'
}
finally {
  Pop-Location
}
