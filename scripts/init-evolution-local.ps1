param()

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $root 'evolution-local'
$sourceEnv = Join-Path $targetDir '.env.example'
$targetEnv = Join-Path $targetDir '.env'

if (!(Test-Path $sourceEnv)) {
  throw "Arquivo não encontrado: $sourceEnv"
}

if (Test-Path $targetEnv) {
  Write-Host ".env da Evolution ja existe em $targetEnv" -ForegroundColor Yellow
  exit 0
}

Copy-Item $sourceEnv $targetEnv
Write-Host ".env da Evolution criado em $targetEnv" -ForegroundColor Green
Write-Host "Proximo passo: edite AUTHENTICATION_API_KEY em evolution-local/.env e rode npm run evolution:up" -ForegroundColor Cyan