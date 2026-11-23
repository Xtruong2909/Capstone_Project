# Run from any directory. Credentials stay in the caller's AWS profile directory.
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if (-not $env:AWS_PROFILE_DIR) {
    $env:AWS_PROFILE_DIR = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.aws'
}
if (-not (Test-Path -LiteralPath $env:AWS_PROFILE_DIR -PathType Container)) {
    throw 'AWS profile directory not found. Configure your AWS profile first.'
}
Push-Location -LiteralPath $projectRoot
try {
    & docker compose -f docker-compose.yml -f compose.s3.yml up -d --build backend
    if ($LASTEXITCODE -ne 0) { throw 'Could not start S3-enabled backend.' }
} finally {
    Pop-Location
}
