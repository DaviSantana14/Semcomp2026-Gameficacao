[CmdletBinding()]
# Set EXPECTED_AWS_ACCOUNT_ID, SEED_ADMIN_NAME, SEED_ADMIN_CPF, and
# SEED_ADMIN_EMAIL in the operator environment. No administrative password is
# accepted by this script or written to Parameter Store.
param(
    [string]$ExpectedAccountId,
    [string]$Region,
    [string]$StackName
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$requiredRegion = 'sa-east-1'
$parameterPath = '/semcomp/rehearsal/'

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

function Get-RequiredConfiguredValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "$Name must be provided through the environment."
    }

    return $value.Trim()
}

function Invoke-AwsText {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    $output = & aws @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw 'AWS CLI read command failed.'
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

function New-SecretValue {
    $bytes = New-Object byte[] 32
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $random.GetBytes($bytes)
    }
    finally {
        $random.Dispose()
    }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Assert-ParameterValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value) -or $Value.Contains("`n") -or $Value.Contains("`r")) {
        throw "Parameter $Name must be a non-empty single-line value."
    }
}

function Set-SsmParameter {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [string]$Value,
        [Parameter(Mandatory = $true)]
        [ValidateSet('String', 'SecureString')]
        [string]$Type,
        [Parameter(Mandatory = $true)]
        [string]$TargetRegion
    )

    $temporaryJson = Join-Path ([IO.Path]::GetTempPath()) "semcomp-parameter-$([Guid]::NewGuid().ToString('N')).json"
    $payload = [ordered]@{
        Name      = $Name
        Value     = $Value
        Type      = $Type
        Overwrite = $true
    }

    try {
        $json = $payload | ConvertTo-Json -Compress
        [IO.File]::WriteAllText(
            $temporaryJson,
            $json,
            [Text.UTF8Encoding]::new($false)
        )

        $null = & aws ssm put-parameter `
            --cli-input-json "file://$temporaryJson" `
            --region $TargetRegion `
            --output json 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw 'AWS SSM parameter mutation failed.'
        }
    }
    finally {
        if (Test-Path -LiteralPath $temporaryJson) {
            Remove-Item -LiteralPath $temporaryJson -Force -ErrorAction SilentlyContinue
        }
    }
}

try {
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

    Assert-ExecutionContext -ExpectedAccount $ExpectedAccountId -TargetRegion $Region

    $frontendUrl = [Environment]::GetEnvironmentVariable('FRONTEND_URL')
    if ([string]::IsNullOrWhiteSpace($frontendUrl)) {
        $publicDnsName = Get-StackOutput -Name 'PublicDnsName' -TargetStack $StackName -TargetRegion $Region
        $frontendUrl = "http://$publicDnsName"
    }

    $parameters = [ordered]@{
        POSTGRES_DB        = Get-ConfiguredValue -Name 'POSTGRES_DB' -DefaultValue 'semcomp_rehearsal'
        POSTGRES_USER      = Get-ConfiguredValue -Name 'POSTGRES_USER' -DefaultValue 'semcomp_rehearsal'
        POSTGRES_SCHEMA    = Get-ConfiguredValue -Name 'POSTGRES_SCHEMA' -DefaultValue 'public'
        FRONTEND_URL       = $frontendUrl.TrimEnd('/')
        COOKIE_SAME_SITE   = Get-ConfiguredValue -Name 'COOKIE_SAME_SITE' -DefaultValue 'lax'
        COOKIE_SECURE      = Get-ConfiguredValue -Name 'COOKIE_SECURE' -DefaultValue 'false'
        NODE_ENV           = Get-ConfiguredValue -Name 'NODE_ENV' -DefaultValue 'production'
        SWAGGER_ENABLED    = Get-ConfiguredValue -Name 'SWAGGER_ENABLED' -DefaultValue 'false'
        SEED_MODE          = Get-ConfiguredValue -Name 'SEED_MODE' -DefaultValue 'admin-only'
        SEED_ADMIN_NAME    = Get-RequiredConfiguredValue -Name 'SEED_ADMIN_NAME'
        SEED_ADMIN_CPF     = Get-RequiredConfiguredValue -Name 'SEED_ADMIN_CPF'
        SEED_ADMIN_EMAIL   = Get-RequiredConfiguredValue -Name 'SEED_ADMIN_EMAIL'
        COMPOSE_PROJECT_NAME = Get-ConfiguredValue -Name 'COMPOSE_PROJECT_NAME' -DefaultValue 'semcomp-rehearsal'
    }

    if ($parameters.SEED_MODE -ne 'admin-only') {
        throw 'SEED_MODE must be admin-only for a release deployment.'
    }

    foreach ($entry in $parameters.GetEnumerator()) {
        Assert-ParameterValue -Name $entry.Key -Value ([string]$entry.Value)
    }

    $postgresPassword = New-SecretValue
    do {
        $jwtSecret = New-SecretValue
    } while ($jwtSecret -eq $postgresPassword)
    do {
        $rateLimitKeySecret = New-SecretValue
    } while ($rateLimitKeySecret -eq $postgresPassword -or $rateLimitKeySecret -eq $jwtSecret)

    $secureParameters = [ordered]@{
        POSTGRES_PASSWORD    = $postgresPassword
        JWT_SECRET           = $jwtSecret
        RATE_LIMIT_KEY_SECRET = $rateLimitKeySecret
    }

    foreach ($entry in $parameters.GetEnumerator()) {
        Set-SsmParameter `
            -Name "$parameterPath$($entry.Key)" `
            -Value ([string]$entry.Value) `
            -Type 'String' `
            -TargetRegion $Region
    }

    foreach ($entry in $secureParameters.GetEnumerator()) {
        Set-SsmParameter `
            -Name "$parameterPath$($entry.Key)" `
            -Value ([string]$entry.Value) `
            -Type 'SecureString' `
            -TargetRegion $Region
    }

    Write-Output "Rehearsal parameters configured under $parameterPath."
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
