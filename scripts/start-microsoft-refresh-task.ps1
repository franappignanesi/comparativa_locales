$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$generatedPath = Join-Path $root "data\generated"
$logPath = Join-Path $generatedPath "microsoft-refresh.log"
$errPath = Join-Path $generatedPath "microsoft-refresh.err.log"
$taskScriptPath = "C:\tmp"
$cmdPath = Join-Path $taskScriptPath "glitchprice-microsoft-refresh.cmd"
$tsxPath = Join-Path $root "node_modules\.bin\tsx.cmd"
$scriptPath = Join-Path $root "scripts\run-microsoft-refresh.ts"
$taskName = if ($env:MICROSOFT_REFRESH_TASK_NAME) { $env:MICROSOFT_REFRESH_TASK_NAME } else { "GlitchPriceMicrosoftRefresh" }

if (-not (Test-Path $tsxPath)) {
  throw "No se encontro tsx en node_modules. Ejecuta npm install antes de lanzar el refresh."
}

New-Item -ItemType Directory -Force -Path $generatedPath | Out-Null
New-Item -ItemType Directory -Force -Path $taskScriptPath | Out-Null

$regions = if ($env:PRICE_REGIONS) { $env:PRICE_REGIONS } else { "AR,MX,ES,PE,CL" }
$batchSize = if ($env:PRICE_REFRESH_BATCH_SIZE) { $env:PRICE_REFRESH_BATCH_SIZE } else { "10" }
$sleepMs = if ($env:PRICE_REFRESH_SLEEP_MS) { $env:PRICE_REFRESH_SLEEP_MS } else { "500" }
$maxBatches = if ($env:PRICE_REFRESH_MAX_BATCHES) { $env:PRICE_REFRESH_MAX_BATCHES } else { "4" }
$concurrency = if ($env:PRICE_REFRESH_CONCURRENCY) { $env:PRICE_REFRESH_CONCURRENCY } else { "1" }

$cmd = @"
@echo off
cd /d "$root"
set PRICE_REGIONS=$regions
set PRICE_REFRESH_BATCH_SIZE=$batchSize
set PRICE_REFRESH_SLEEP_MS=$sleepMs
set PRICE_REFRESH_MAX_BATCHES=$maxBatches
set PRICE_REFRESH_CONCURRENCY=$concurrency
set MICROSOFT_REFRESH_RESUME=1
"$tsxPath" "$scriptPath" >> "$logPath" 2>> "$errPath"
"@
$cmd | Set-Content -Encoding ASCII $cmdPath
$taskRun = "`"$cmdPath`""

cmd.exe /d /s /c "schtasks.exe /Delete /TN `"$taskName`" /F 2>nul" | Out-Null
schtasks.exe /Create /SC MINUTE /MO 1 /TN $taskName /TR $taskRun /F | Out-Null
schtasks.exe /Run /TN $taskName | Out-Null

Write-Output "Scheduled Microsoft refresh task started: $taskName"
Write-Output "Status: $generatedPath\microsoft-refresh-runner-status.json"
Write-Output "Cursor: $generatedPath\microsoft-refresh-cursor.json"
Write-Output "Logs: $logPath / $errPath"
