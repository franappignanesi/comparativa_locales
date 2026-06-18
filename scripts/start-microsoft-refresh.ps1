$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$generatedPath = Join-Path $root "data\generated"
$logPath = Join-Path $generatedPath "microsoft-refresh.log"
$errPath = Join-Path $generatedPath "microsoft-refresh.err.log"
$tsxPath = Join-Path $root "node_modules\.bin\tsx.cmd"
$scriptPath = Join-Path $root "scripts\run-microsoft-refresh.ts"

if (-not (Test-Path $tsxPath)) {
  throw "No se encontro tsx en node_modules. Ejecuta npm install antes de lanzar el refresh."
}

New-Item -ItemType Directory -Force -Path $generatedPath | Out-Null

$regions = if ($env:PRICE_REGIONS) { $env:PRICE_REGIONS } else { "AR,MX,ES,PE,CL" }
$batchSize = if ($env:PRICE_REFRESH_BATCH_SIZE) { $env:PRICE_REFRESH_BATCH_SIZE } else { "25" }
$sleepMs = if ($env:PRICE_REFRESH_SLEEP_MS) { $env:PRICE_REFRESH_SLEEP_MS } else { "2500" }
$maxBatches = if ($env:PRICE_REFRESH_MAX_BATCHES) { $env:PRICE_REFRESH_MAX_BATCHES } else { "12" }
$concurrency = if ($env:PRICE_REFRESH_CONCURRENCY) { $env:PRICE_REFRESH_CONCURRENCY } else { "3" }

$command = "set PRICE_REGIONS=$regions&& set PRICE_REFRESH_BATCH_SIZE=$batchSize&& set PRICE_REFRESH_SLEEP_MS=$sleepMs&& set PRICE_REFRESH_MAX_BATCHES=$maxBatches&& set PRICE_REFRESH_CONCURRENCY=$concurrency&& `"$tsxPath`" `"$scriptPath`" > `"$logPath`" 2> `"$errPath`""

Start-Process `
  -FilePath "cmd.exe" `
  -ArgumentList "/d", "/s", "/c", $command `
  -WorkingDirectory $root `
  -WindowStyle Hidden

Write-Output "Microsoft refresh started. Status: $generatedPath\microsoft-refresh-runner-status.json"
Write-Output "Logs: $logPath / $errPath"
