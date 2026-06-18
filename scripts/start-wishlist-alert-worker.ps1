$root = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $root "data\generated\wishlist-alert-worker.log"
$errPath = Join-Path $root "data\generated\wishlist-alert-worker.err.log"
$tsxPath = Join-Path $root "node_modules\.bin\tsx.cmd"
$scriptPath = Join-Path $root "scripts\evaluate-wishlist-alerts.ts"

if (!(Test-Path $tsxPath)) {
  throw "No se encontro tsx en node_modules. Ejecuta npm install antes de lanzar el worker."
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $logPath) | Out-Null

if (!$env:WISHLIST_ALERTS_INTERVAL_MINUTES) {
  $env:WISHLIST_ALERTS_INTERVAL_MINUTES = "60"
}

$command = "set WISHLIST_ALERTS_WATCH=1&& set WISHLIST_ALERTS_INTERVAL_MINUTES=$($env:WISHLIST_ALERTS_INTERVAL_MINUTES)&& `"$tsxPath`" `"$scriptPath`""
Start-Process -FilePath "cmd.exe" -ArgumentList "/d", "/s", "/c", $command -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $logPath -RedirectStandardError $errPath
Write-Output "Wishlist alert worker started. Logs: $logPath / $errPath"
