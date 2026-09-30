# Restarts FlexiTrack after an update (new code, rebuilt website, changed .env).
# Run from the project folder in an Administrator terminal:
#   npm run service:restart
$ErrorActionPreference = 'Stop'
$TaskName = 'FlexiTrack'
$Root = Split-Path -Parent $PSScriptRoot

if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
    Write-Host "`nThe FlexiTrack task is not installed. Run: npm run service:install`n" -ForegroundColor Red
    exit 1
}

Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
& "$PSScriptRoot\stop-processes.ps1" -Root $Root
Start-ScheduledTask -TaskName $TaskName
Write-Host "FlexiTrack restarted. Logs: $Root\logs" -ForegroundColor Green
