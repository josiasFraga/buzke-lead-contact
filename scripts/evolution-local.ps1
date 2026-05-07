param(
  [Parameter(Position = 0)]
  [ValidateSet('help', 'up', 'down', 'reset', 'logs')]
  [string]$Action = 'help'
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $root 'evolution-local'
$targetEnv = Join-Path $targetDir '.env'

function Show-Help {
  Write-Host 'Comandos disponiveis para a Evolution local:' -ForegroundColor Cyan
  Write-Host '  npm run evolution:env:init  -> cria evolution-local/.env a partir do exemplo'
  Write-Host '  npm run evolution:up        -> sobe PostgreSQL, Redis e Evolution API'
  Write-Host '  npm run evolution:down      -> derruba a stack local'
  Write-Host '  npm run evolution:reset     -> derruba a stack e remove os volumes'
  Write-Host '  npm run evolution:logs      -> acompanha os logs da Evolution API'
}

if ($Action -eq 'help') {
  Show-Help
  exit 0
}

if (!(Test-Path $targetDir)) {
  throw "Pasta não encontrada: $targetDir"
}

if (!(Test-Path $targetEnv)) {
  throw "Arquivo não encontrado: $targetEnv. Rode primeiro npm run evolution:env:init"
}

Push-Location $targetDir
try {
  switch ($Action) {
    'up' {
      docker compose up -d
    }
    'down' {
      docker compose down
    }
    'reset' {
      docker compose down -v
    }
    'logs' {
      docker logs -f evolution_api
    }
  }
}
finally {
  Pop-Location
}