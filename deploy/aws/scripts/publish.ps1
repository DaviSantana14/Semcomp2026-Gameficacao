[CmdletBinding()]
param(
    [string]$ExpectedAccountId,
    [string]$Region,
    [string]$StackName,
    [string]$RepositoryPath = '.'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$requiredRegion = 'sa-east-1'
$archivePath = $null
$ssmInputPath = $null

function Invoke-AwsText {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $output = & aws @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw 'AWS CLI command failed.'
    }

    return (($output | ForEach-Object { [string]$_ }) -join "`n").Trim()
}

function Assert-ExecutionContext {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ExpectedAccount,
        [Parameter(Mandatory = $true)]
        [string]$TargetRegion
    )

    if ($TargetRegion -ne $requiredRegion) {
        throw "AWS region must be $requiredRegion."
    }

    if ($ExpectedAccount -notmatch '^\d{12}$') {
        throw 'ExpectedAccountId must be a 12-digit AWS account id.'
    }

    $configuredRegion = Invoke-AwsText -Arguments @('configure', 'get', 'region')
    if ($configuredRegion -and $configuredRegion -ne $requiredRegion) {
        throw "Configured AWS region must be $requiredRegion."
    }

    $actualAccount = Invoke-AwsText -Arguments @(
        'sts', 'get-caller-identity',
        '--query', 'Account',
        '--output', 'text',
        '--region', $TargetRegion
    )

    if ($actualAccount -ne $ExpectedAccount) {
        throw 'AWS account validation failed.'
    }
}

function Get-ConfiguredValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$DefaultValue
    )

    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $DefaultValue
    }

    return $value.Trim()
}

function Get-StackOutput {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$TargetStack,
        [Parameter(Mandatory = $true)]
        [string]$TargetRegion
    )

    $query = "Stacks[0].Outputs[?OutputKey=='$Name'].OutputValue | [0]"
    $value = Invoke-AwsText -Arguments @(
        'cloudformation', 'describe-stacks',
        '--stack-name', $TargetStack,
        '--query', $query,
        '--output', 'text',
        '--region', $TargetRegion
    )

    if ([string]::IsNullOrWhiteSpace($value) -or $value -eq 'None') {
        throw "CloudFormation output $Name was not found."
    }

    return $value
}

function Write-TemporaryJson {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Value
    )

    $path = Join-Path ([IO.Path]::GetTempPath()) "semcomp-ssm-$([Guid]::NewGuid().ToString('N')).json"
    $json = $Value | ConvertTo-Json -Depth 8 -Compress
    [IO.File]::WriteAllText($path, $json, [Text.UTF8Encoding]::new($false))
    return $path
}

function Resolve-Repository {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    try {
        return (Resolve-Path -LiteralPath $Path).Path
    }
    catch {
        throw 'RepositoryPath does not exist.'
    }
}

try {
    $repoPath = Resolve-Repository -Path $RepositoryPath

    if ([string]::IsNullOrWhiteSpace($ExpectedAccountId)) {
        $ExpectedAccountId = [Environment]::GetEnvironmentVariable('EXPECTED_AWS_ACCOUNT_ID')
    }
    if ([string]::IsNullOrWhiteSpace($Region)) {
        $Region = [Environment]::GetEnvironmentVariable('AWS_REGION')
    }
    if ([string]::IsNullOrWhiteSpace($Region)) {
        $Region = [Environment]::GetEnvironmentVariable('AWS_DEFAULT_REGION')
    }
    if ([string]::IsNullOrWhiteSpace($Region)) {
        $Region = $requiredRegion
    }
    if ([string]::IsNullOrWhiteSpace($StackName)) {
        $StackName = Get-ConfiguredValue -Name 'STACK_NAME' -DefaultValue 'semcomp-rehearsal'
    }

    if ($Region -ne $requiredRegion) {
        throw "AWS region must be $requiredRegion."
    }

    $gitStatus = & git -C $repoPath status --porcelain --untracked-files=all 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to inspect the Git worktree.'
    }
    if (-not [string]::IsNullOrWhiteSpace(($gitStatus -join "`n"))) {
        throw 'Publishing requires a clean Git worktree.'
    }

    $commitSha = (& git -C $repoPath rev-parse --verify HEAD 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or $commitSha -notmatch '^[0-9a-f]{40}$') {
        throw 'Unable to identify the release commit SHA.'
    }

    Assert-ExecutionContext -ExpectedAccount $ExpectedAccountId -TargetRegion $Region

    $bucketName = Get-StackOutput -Name 'BackupBucketName' -TargetStack $StackName -TargetRegion $Region
    $instanceId = Get-StackOutput -Name 'InstanceId' -TargetStack $StackName -TargetRegion $Region

    if ($bucketName -notmatch '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$') {
        throw 'CloudFormation returned an invalid rehearsal bucket name.'
    }
    if ($instanceId -notmatch '^i-[0-9a-f]+$') {
        throw 'CloudFormation returned an invalid rehearsal instance id.'
    }

    $archivePath = Join-Path ([IO.Path]::GetTempPath()) "semcomp-release-$commitSha.zip"
    $null = & git -C $repoPath archive --format=zip "--output=$archivePath" $commitSha 2>$null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $archivePath)) {
        throw 'Unable to create the release archive.'
    }

    $releaseKey = "releases/$commitSha.zip"
    $null = & aws s3 cp $archivePath "s3://$bucketName/$releaseKey" `
        --region $Region `
        --only-show-errors 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw 'Release archive upload failed.'
    }

    $remoteCommand = @'
exec bash <<'SEMCOMP_REMOTE_BASH'
set -euo pipefail

release_sha='__COMMIT_SHA__'
release_bucket='__BUCKET_NAME__'
release_dir="/opt/semcomp/releases/$release_sha"
staging_dir="$(mktemp -d /tmp/semcomp-release.XXXXXX)"

cleanup() {
  status=$?
  rm -rf -- "$staging_dir"
  exit "$status"
}
trap cleanup EXIT

install -d -m 0750 /opt/semcomp /opt/semcomp/releases /opt/semcomp/shared
if [[ -e "$release_dir" || -L "$release_dir" ]]; then
  printf 'release directory already exists\n' >&2
  exit 64
fi

if ! command -v unzip >/dev/null 2>&1; then
  apt-get update -qq
  apt-get install -y -qq unzip
fi
export PATH="/snap/bin:$PATH"
if ! command -v aws >/dev/null 2>&1; then
  if ! command -v snap >/dev/null 2>&1; then
    printf 'snap is required to install AWS CLI on Ubuntu 24.04\n' >&2
    exit 69
  fi
  snap install aws-cli --classic
fi

aws s3 cp "s3://$release_bucket/releases/$release_sha.zip" "$staging_dir/release.zip" \
  --region '__REGION__' --only-show-errors
install -d -m 0750 "$staging_dir/release"
unzip -q "$staging_dir/release.zip" -d "$staging_dir/release"
mv -- "$staging_dir/release" "$release_dir"
chmod 0750 "$release_dir/deploy/aws/scripts/deploy-release.sh"

DEPLOY_ENV=rehearsal \
EXPECTED_AWS_ACCOUNT_ID='__ACCOUNT_ID__' \
AWS_REGION='__REGION__' \
RELEASE_SHA="$release_sha" \
RELEASE_BUCKET="$release_bucket" \
bash "$release_dir/deploy/aws/scripts/deploy-release.sh"
SEMCOMP_REMOTE_BASH
'@
    $remoteCommand = $remoteCommand.Replace('__COMMIT_SHA__', $commitSha)
    $remoteCommand = $remoteCommand.Replace('__BUCKET_NAME__', $bucketName)
    $remoteCommand = $remoteCommand.Replace('__REGION__', $Region)
    $remoteCommand = $remoteCommand.Replace('__ACCOUNT_ID__', $ExpectedAccountId)

    $ssmPayload = [ordered]@{
        DocumentName   = 'AWS-RunShellScript'
        InstanceIds    = @($instanceId)
        Comment        = "semcomp release $commitSha"
        TimeoutSeconds = 900
        Parameters     = [ordered]@{
            commands = @($remoteCommand)
        }
    }
    $ssmInputPath = Write-TemporaryJson -Value $ssmPayload

    # AWS CLI documents send-command, command-executed, and get-command-invocation
    # as the Run Command lifecycle for a single managed instance.
    $commandIdOutput = & aws ssm send-command `
        --cli-input-json "file://$ssmInputPath" `
        --region $Region `
        --query 'Command.CommandId' `
        --output text 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw 'SSM release command could not be sent.'
    }
    $commandId = (($commandIdOutput | ForEach-Object { [string]$_ }) -join "`n").Trim()
    if ($commandId -notmatch '^[0-9a-f-]{20,}$') {
        throw 'SSM did not return a valid command id.'
    }

    $null = & aws ssm wait command-executed `
        --command-id $commandId `
        --instance-id $instanceId `
        --region $Region `
        --delay 5 `
        --max-attempts 36 2>$null
    $waitExitCode = $LASTEXITCODE

    $responseCode = Invoke-AwsText -Arguments @(
        'ssm', 'get-command-invocation',
        '--command-id', $commandId,
        '--instance-id', $instanceId,
        '--query', 'ResponseCode',
        '--output', 'text',
        '--region', $Region
    )

    if ($waitExitCode -ne 0 -or $responseCode -ne '0') {
        throw 'Remote release deployment failed; inspect the SSM invocation.'
    }

    Write-Output "Release $commitSha published and deployed through SSM."
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
finally {
    if ($archivePath -and (Test-Path -LiteralPath $archivePath)) {
        Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue
    }
    if ($ssmInputPath -and (Test-Path -LiteralPath $ssmInputPath)) {
        Remove-Item -LiteralPath $ssmInputPath -Force -ErrorAction SilentlyContinue
    }
}
