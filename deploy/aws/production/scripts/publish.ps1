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
$manifestPath = $null
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

    return (($output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine).Trim()
}

function Get-EnvironmentValue {
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

function Resolve-RepositoryPath {
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

function Write-JsonFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [object]$Value
    )

    $json = $Value | ConvertTo-Json -Depth 8 -Compress
    [IO.File]::WriteAllText($Path, $json, [Text.UTF8Encoding]::new($false))
}

function Assert-RepositoryUri {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri,
        [Parameter(Mandatory = $true)]
        [string]$ExpectedRepository
    )

    if ($Uri -notmatch "^[0-9]{12}\.dkr\.ecr\.sa-east-1\.amazonaws\.com/$ExpectedRepository$") {
        throw "CloudFormation returned an invalid ECR repository URI for $ExpectedRepository."
    }
}

function Invoke-DockerOrThrow {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [Parameter(Mandatory = $true)]
        [string]$Message
    )

    $null = & docker @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw $Message
    }
}

try {
    $repoPath = Resolve-RepositoryPath -Path $RepositoryPath

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
        $StackName = Get-EnvironmentValue -Name 'STACK_NAME' -DefaultValue 'semcomp-production'
    }

    $gitStatus = & git -C $repoPath status --porcelain --untracked-files=all 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to inspect the Git worktree.'
    }
    if (-not [string]::IsNullOrWhiteSpace(($gitStatus -join [Environment]::NewLine))) {
        throw 'Publishing requires a clean Git worktree.'
    }

    $commitSha = (& git -C $repoPath rev-parse --verify HEAD 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or $commitSha -notmatch '^[0-9a-f]{40}$') {
        throw 'Publishing requires a full 40-character commit SHA.'
    }

    Assert-ExecutionContext -ExpectedAccount $ExpectedAccountId -TargetRegion $Region

    $apiRepositoryUri = Get-StackOutput -Name 'ApiRepositoryUri' -TargetStack $StackName -TargetRegion $Region
    $webRepositoryUri = Get-StackOutput -Name 'WebRepositoryUri' -TargetStack $StackName -TargetRegion $Region
    $bucketName = Get-StackOutput -Name 'BackupBucketName' -TargetStack $StackName -TargetRegion $Region
    $instanceId = Get-StackOutput -Name 'InstanceId' -TargetStack $StackName -TargetRegion $Region

    Assert-RepositoryUri -Uri $apiRepositoryUri -ExpectedRepository "$StackName/api"
    Assert-RepositoryUri -Uri $webRepositoryUri -ExpectedRepository "$StackName/web"
    if ($bucketName -notmatch '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$') {
        throw 'CloudFormation returned an invalid production bucket name.'
    }
    if ($instanceId -notmatch '^i-[0-9a-f]+$') {
        throw 'CloudFormation returned an invalid production instance id.'
    }

    $registry = $apiRepositoryUri.Substring(0, $apiRepositoryUri.IndexOf('/'))
    & aws ecr get-login-password --region $Region |
        & docker login --username AWS --password-stdin $registry | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker ECR authentication failed.'
    }

    $apiTag = "${apiRepositoryUri}:$commitSha"
    $webTag = "${webRepositoryUri}:$commitSha"
    $apiDockerfile = Join-Path $repoPath 'apps/api/Dockerfile'
    $webDockerfile = Join-Path $repoPath 'apps/web/Dockerfile'

    Invoke-DockerOrThrow -Arguments @(
        'build', '--file', $apiDockerfile, '--tag', $apiTag, $repoPath
    ) -Message 'API image build failed.'

    Invoke-DockerOrThrow -Arguments @(
        'build', '--file', $webDockerfile,
        '--build-arg', 'NEXT_PUBLIC_API_URL=/api',
        '--tag', $webTag, $repoPath
    ) -Message 'Web image build failed.'

    Invoke-DockerOrThrow -Arguments @(
        'run', '--rm', $apiTag, 'node', '-e', 'require("bcrypt")'
    ) -Message 'API container smoke test failed.'

    $webContainerId = (& docker run --detach --rm --publish 127.0.0.1:43100:3000 $webTag 2>$null).Trim()
    if ($LASTEXITCODE -ne 0 -or $webContainerId -notmatch '^[A-Za-z0-9_.-]+$') {
        throw 'Web container could not be started for its health test.'
    }
    try {
        $curlArguments = @(
            '--fail', '--silent', '--show-error',
            '--connect-timeout', '3', '--max-time', '10',
            'http://127.0.0.1:43100/login'
        )
        $null = & curl @curlArguments 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw 'Web image health test failed.'
        }
    }
    finally {
        $null = & docker rm --force $webContainerId 2>$null
    }

    Invoke-DockerOrThrow -Arguments @('push', $apiTag) -Message 'API image push failed.'
    Invoke-DockerOrThrow -Arguments @('push', $webTag) -Message 'Web image push failed.'

    $apiRepository = $apiRepositoryUri.Substring($apiRepositoryUri.IndexOf('/') + 1)
    $webRepository = $webRepositoryUri.Substring($webRepositoryUri.IndexOf('/') + 1)
    $apiDigest = Invoke-AwsText -Arguments @(
        'ecr', 'describe-images',
        '--repository-name', $apiRepository,
        '--image-ids', "imageTag=$commitSha",
        '--query', 'imageDetails[0].imageDigest',
        '--output', 'text',
        '--region', $Region
    )
    $webDigest = Invoke-AwsText -Arguments @(
        'ecr', 'describe-images',
        '--repository-name', $webRepository,
        '--image-ids', "imageTag=$commitSha",
        '--query', 'imageDetails[0].imageDigest',
        '--output', 'text',
        '--region', $Region
    )

    if ($apiDigest -notmatch '^sha256:[0-9a-f]{64}$' -or $webDigest -notmatch '^sha256:[0-9a-f]{64}$') {
        throw 'ECR did not return immutable image digests.'
    }

    $archivePath = Join-Path ([IO.Path]::GetTempPath()) "semcomp-production-release-$commitSha.tar.gz"
    $manifestPath = Join-Path ([IO.Path]::GetTempPath()) "semcomp-production-manifest-$commitSha.json"
    $null = & git -C $repoPath archive --format=tar.gz "--output=$archivePath" $commitSha 2>$null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $archivePath)) {
        throw 'Unable to create the release archive.'
    }

    $archiveKey = "releases/$commitSha/release.tar.gz"
    $manifestKey = "releases/$commitSha/manifest.json"
    $manifest = [ordered]@{
        releaseSha = $commitSha
        bucket     = $bucketName
        archiveKey = $archiveKey
        apiImage   = "${apiRepositoryUri}@$apiDigest"
        webImage   = "${webRepositoryUri}@$webDigest"
    }
    Write-JsonFile -Path $manifestPath -Value $manifest

    $archiveUploadArguments = @(
        's3', 'cp', $archivePath, "s3://$bucketName/$archiveKey",
        '--region', $Region, '--only-show-errors'
    )
    $null = & aws @archiveUploadArguments 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw 'Release archive upload failed.'
    }

    $manifestUploadArguments = @(
        's3', 'cp', $manifestPath, "s3://$bucketName/$manifestKey",
        '--region', $Region, '--only-show-errors'
    )
    $null = & aws @manifestUploadArguments 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw 'Release manifest upload failed.'
    }

    $remoteCommand = @'
set -euo pipefail

release_sha='__RELEASE_SHA__'
release_bucket='__BUCKET_NAME__'
archive_key='__ARCHIVE_KEY__'
manifest_key='__MANIFEST_KEY__'
release_dir="/opt/semcomp/releases/$release_sha"
staging_dir="$(mktemp -d /tmp/semcomp-production-release.XXXXXX)"

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

aws s3 cp "s3://$release_bucket/$archive_key" "$staging_dir/release.tar.gz" \
  --region '__REGION__' --only-show-errors
mkdir -p "$staging_dir/release"
tar -xzf "$staging_dir/release.tar.gz" -C "$staging_dir/release"
mv -- "$staging_dir/release" "$release_dir"

aws s3 cp "s3://$release_bucket/$manifest_key" "$release_dir/manifest.json" \
  --region '__REGION__' --only-show-errors
chmod 0750 "$release_dir/deploy/aws/production/scripts/deploy-release.sh"
chmod 0750 "$release_dir/deploy/aws/production/scripts/"*.sh

DEPLOY_ENV=production \
AWS_REGION='__REGION__' \
EXPECTED_AWS_ACCOUNT_ID='__ACCOUNT_ID__' \
RELEASE_SHA="$release_sha" \
RELEASE_BUCKET="$release_bucket" \
RELEASES_DIR=/opt/semcomp/releases \
CURRENT_LINK=/opt/semcomp/current \
SHARED_DIR=/opt/semcomp/shared \
MANIFEST_FILE="$release_dir/manifest.json" \
bash "$release_dir/deploy/aws/production/scripts/deploy-release.sh"
'@

    $remoteCommand = $remoteCommand.Replace('__RELEASE_SHA__', $commitSha)
    $remoteCommand = $remoteCommand.Replace('__BUCKET_NAME__', $bucketName)
    $remoteCommand = $remoteCommand.Replace('__ARCHIVE_KEY__', $archiveKey)
    $remoteCommand = $remoteCommand.Replace('__MANIFEST_KEY__', $manifestKey)
    $remoteCommand = $remoteCommand.Replace('__REGION__', $Region)
    $remoteCommand = $remoteCommand.Replace('__ACCOUNT_ID__', $ExpectedAccountId)

    $ssmPayload = [ordered]@{
        DocumentName   = 'AWS-RunShellScript'
        InstanceIds    = @($instanceId)
        Comment        = "semcomp production release $commitSha"
        TimeoutSeconds = 900
        Parameters     = [ordered]@{
            commands = @($remoteCommand)
        }
    }
    $ssmInputPath = Join-Path ([IO.Path]::GetTempPath()) "semcomp-production-ssm-$commitSha.json"
    Write-JsonFile -Path $ssmInputPath -Value $ssmPayload

    $sendCommandArguments = @(
        'ssm', 'send-command',
        '--cli-input-json', "file://$ssmInputPath",
        '--region', $Region,
        '--query', 'Command.CommandId',
        '--output', 'text'
    )
    $commandId = (Invoke-AwsText -Arguments $sendCommandArguments).Trim()
    if ($commandId -notmatch '^[0-9a-f-]{20,}$') {
        throw 'SSM did not return a valid command id.'
    }

    $commandDeadline = [DateTimeOffset]::UtcNow.AddSeconds(900)
    $commandStatus = ''
    $responseCode = ''
    $terminalStatuses = @('Success', 'Cancelled', 'TimedOut', 'Failed', 'Cancelling')

    while ([DateTimeOffset]::UtcNow -lt $commandDeadline) {
        $invocationOutput = Invoke-AwsText -Arguments @(
            'ssm', 'get-command-invocation',
            '--command-id', $commandId,
            '--instance-id', $instanceId,
            '--query', '[Status,ResponseCode]',
            '--output', 'text',
            '--region', $Region
        )
        $invocationFields = $invocationOutput -split '\s+'
        if ($invocationFields.Count -ge 2) {
            $commandStatus = $invocationFields[0]
            $responseCode = $invocationFields[1]
            if ($terminalStatuses -contains $commandStatus) {
                break
            }
        }

        Start-Sleep -Seconds 5
    }

    if (-not ($terminalStatuses -contains $commandStatus)) {
        throw 'Remote production release deployment timed out.'
    }
    if ($commandStatus -ne 'Success' -or $responseCode -ne '0') {
        throw 'Remote production release deployment failed; inspect the SSM invocation.'
    }

    Write-Output "Production release $commitSha published by digest and dispatched through SSM."
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
finally {
    if ($archivePath -and (Test-Path -LiteralPath $archivePath)) {
        Remove-Item -LiteralPath $archivePath -Force -ErrorAction SilentlyContinue
    }
    if ($manifestPath -and (Test-Path -LiteralPath $manifestPath)) {
        Remove-Item -LiteralPath $manifestPath -Force -ErrorAction SilentlyContinue
    }
    if ($ssmInputPath -and (Test-Path -LiteralPath $ssmInputPath)) {
        Remove-Item -LiteralPath $ssmInputPath -Force -ErrorAction SilentlyContinue
    }
}
