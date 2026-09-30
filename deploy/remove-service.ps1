# Stops FlexiTrack and removes the startup task and firewall rules.
# Run from the project folder in an Administrator terminal:
#   npm run service:remove
$ErrorActionPreference = 'Stop'
$TaskName = 'FlexiTrack'
$Root = Split-Path -Parent $PSScriptRoot

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
& "$PSScriptRoot\stop-processes.ps1" -Root $Root

foreach ($name in @('FlexiTrack Backend', 'FlexiTrack Web')) {
    Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
}
Write-Host 'FlexiTrack stopped; startup task and firewall rules removed.' -ForegroundColor Green
