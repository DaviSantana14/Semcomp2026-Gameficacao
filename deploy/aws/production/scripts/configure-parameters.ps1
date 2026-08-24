[CmdletBinding()]
param(
    [string]$ExpectedAccountId,
    [string]$Region,
    [string]$StackName
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$requiredRegion = 'sa-east-1'
$parameterPath = '/semcomp/production/'

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

function Get-RequiredEnvironmentValue {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "$Name must be provided through the operator environment."
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

    return (($output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine).Trim()
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

    if (
        [string]::IsNullOrWhiteSpace($Value) -or
        $Value.Contains([char]10) -or
        $Value.Contains([char]13)
    ) {
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

    $temporaryJson = Join-Path ([IO.Path]::GetTempPath()) "semcomp-production-parameter-$([Guid]::NewGuid().ToString('N')).json"
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

        $awsArguments = @(
            'ssm', 'put-parameter',
            '--cli-input-json', "file://$temporaryJson",
            '--region', $TargetRegion,
            '--output', 'json'
        )
        $null = & aws @awsArguments 2>$null

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
        $StackName = Get-EnvironmentValue -Name 'STACK_NAME' -DefaultValue 'semcomp-production'
    }
    if ([string]::IsNullOrWhiteSpace($StackName)) {
        throw 'StackName must be provided.'
    }

    Assert-ExecutionContext -ExpectedAccount $ExpectedAccountId -TargetRegion $Region

    $parameters = [ordered]@{
        POSTGRES_DB          = 'semcomp_production'
        POSTGRES_USER        = 'semcomp_production'
        POSTGRES_SCHEMA      = 'public'
        FRONTEND_URL         = 'https://gameficacao.semcomp.com.br'
        COOKIE_SAME_SITE     = 'lax'
        COOKIE_SECURE        = 'true'
        NODE_ENV             = 'production'
        SWAGGER_ENABLED      = 'false'
        SEED_MODE            = 'admin-only'
        SEED_ADMIN_NAME      = Get-RequiredEnvironmentValue -Name 'SEED_ADMIN_NAME'
        SEED_ADMIN_CPF       = Get-RequiredEnvironmentValue -Name 'SEED_ADMIN_CPF'
        SEED_ADMIN_EMAIL     = Get-RequiredEnvironmentValue -Name 'SEED_ADMIN_EMAIL'
        COMPOSE_PROJECT_NAME = 'semcomp-production'
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
        POSTGRES_PASSWORD     = $postgresPassword
        JWT_SECRET            = $jwtSecret
        RATE_LIMIT_KEY_SECRET = $rateLimitKeySecret
    }

    foreach ($entry in $parameters.GetEnumerator()) {
        Set-SsmParameter -Name "$parameterPath$($entry.Key)" -Value ([string]$entry.Value) -Type 'String' -TargetRegion $Region
    }

    foreach ($entry in $secureParameters.GetEnumerator()) {
        Set-SsmParameter -Name "$parameterPath$($entry.Key)" -Value ([string]$entry.Value) -Type 'SecureString' -TargetRegion $Region
    }

    Write-Output "Production parameters configured under $parameterPath."
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
