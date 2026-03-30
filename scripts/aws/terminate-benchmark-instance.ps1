param(
  [Parameter(Mandatory = $true)]
  [string]$InstanceId,
  [string]$Region = 'us-east-1'
)

$ErrorActionPreference = 'Stop'

& aws ec2 terminate-instances --instance-ids $InstanceId --region $Region | Out-Null
& aws ec2 wait instance-terminated --instance-ids $InstanceId --region $Region

Write-Host "Terminated benchmark instance $InstanceId in region $Region."
