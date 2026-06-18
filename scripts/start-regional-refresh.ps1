$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $root "data\generated\regional-refresh.log"
$errPath = Join-Path $root "data\generated\regional-refresh.err.log"
$scriptPath = Join-Path $root "scripts\refresh-regional-prices.ts"
$relativeScriptPath = "scripts\refresh-regional-prices.ts"

if (-not (Test-Path (Join-Path $root "node_modules\.bin\tsx.cmd"))) {
  throw "No se encontro tsx en node_modules. Ejecuta npm install antes de lanzar el refresh."
}

$regions = if ($env:PRICE_REGIONS) { $env:PRICE_REGIONS } else { "" }
$batchSize = if ($env:PRICE_REFRESH_BATCH_SIZE) { $env:PRICE_REFRESH_BATCH_SIZE } else { "" }
$sleepMs = if ($env:PRICE_REFRESH_SLEEP_MS) { $env:PRICE_REFRESH_SLEEP_MS } else { "" }
$maxBatches = if ($env:PRICE_REFRESH_MAX_BATCHES) { $env:PRICE_REFRESH_MAX_BATCHES } else { "" }
$offset = if ($env:PRICE_REFRESH_OFFSET) { $env:PRICE_REFRESH_OFFSET } else { "" }

$command = "set PRICE_REGIONS=$regions&& set PRICE_REFRESH_BATCH_SIZE=$batchSize&& set PRICE_REFRESH_SLEEP_MS=$sleepMs&& set PRICE_REFRESH_MAX_BATCHES=$maxBatches&& set PRICE_REFRESH_OFFSET=$offset&& node_modules\.bin\tsx.cmd $relativeScriptPath > `"$logPath`" 2> `"$errPath`""

Start-Process `
  -FilePath "cmd.exe" `
  -ArgumentList "/d", "/s", "/c", $command `
  -WorkingDirectory $root `
  -WindowStyle Hidden

Write-Output "Regional refresh started. Logs: $logPath / $errPath"
