$ErrorActionPreference = "Continue"

$taskName = if ($env:MICROSOFT_REFRESH_TASK_NAME) { $env:MICROSOFT_REFRESH_TASK_NAME } else { "GlitchPriceMicrosoftRefresh" }

schtasks.exe /End /TN $taskName 2>$null | Out-Null
schtasks.exe /Delete /TN $taskName /F 2>$null | Out-Null

Write-Output "Scheduled Microsoft refresh task stopped: $taskName"
