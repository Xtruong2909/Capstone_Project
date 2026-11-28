param([string]$DatasetDir = (Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Desktop/pNEUMA_dataset'))
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if (-not (Test-Path -LiteralPath $DatasetDir -PathType Container)) {
    throw 'pNEUMA directory not found. Pass -DatasetDir with the original CSV folder.'
}
$env:PNEUMA_DATASET_DIR = [IO.Path]::GetFullPath($DatasetDir)
$composeArgs = @('-f', 'docker-compose.yml', '-f', 'compose.dataset.yml')
$profileDir = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.aws'
if (Test-Path -LiteralPath $profileDir -PathType Container) {
    $env:AWS_PROFILE_DIR = $profileDir
    $composeArgs += @('-f', 'compose.s3.yml')
}
Push-Location -LiteralPath $projectRoot
try {
    & docker compose @composeArgs up -d --build
    if ($LASTEXITCODE -ne 0) { throw 'Could not start the local test environment.' }
} finally {
    Pop-Location
}
