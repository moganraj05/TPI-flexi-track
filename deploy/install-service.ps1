# Makes FlexiTrack start automatically with Windows and keep running with
# nobody logged in (Task Scheduler task "FlexiTrack", runs as SYSTEM), and
# opens the Windows Firewall for the backend and web ports.
# Run from the project folder in an Administrator terminal:
#   npm run service:install
$ErrorActionPreference = 'Stop'
$TaskName = 'FlexiTrack'
$Root = Split-Path -Parent $PSScriptRoot
$WebPort = if ($env:WEB_PORT) { [int]$env:WEB_PORT } else { 8080 }

function Fail($msg) { Write-Host "`nFAILED: $msg`n" -ForegroundColor Red; exit 1 }

# --- checks ---------------------------------------------------------------
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Fail 'Run this in an Administrator terminal (right-click Command Prompt or PowerShell > Run as administrator).' }

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Fail 'Node.js not found. Install Node.js 22 LTS from https://nodejs.org and reopen the terminal.' }

if (-not (Test-Path "$Root\backend\.env")) { Fail 'backend\.env is missing. Copy it into the backend folder first.' }
if (-not (Test-Path "$Root\webfrontend\dist\index.html")) { Fail 'The web console is not built. Run "npm install" (or "npm run setup") first.' }
if (-not (Test-Path "$Root\backend\node_modules")) { Fail 'Backend packages are not installed. Run "npm install" first.' }

$BackendPort = 5000
$portLine = Select-String -Path "$Root\backend\.env" -Pattern '^\s*PORT\s*=\s*"?(\d+)' | Select-Object -First 1
if ($portLine) { $BackendPort = [int]$portLine.Matches[0].Groups[1].Value }

# --- scheduled task ---------------------------------------------------------
Write-Host "Registering startup task '$TaskName'..."
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$Root\deploy\start-all.js`"" -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
# No time limit; if the launcher itself ever dies, Task Scheduler restarts it every minute.
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
    -Description 'FlexiTrack backend API + HR web console' | Out-Null

# --- firewall ---------------------------------------------------------------
foreach ($rule in @(@{ Name = 'FlexiTrack Backend'; Port = $BackendPort }, @{ Name = 'FlexiTrack Web'; Port = $WebPort })) {
    Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $rule.Port -Profile Any | Out-Null
    Write-Host "Firewall: allowed inbound TCP $($rule.Port) ($($rule.Name))"
}

# --- start and verify -------------------------------------------------------
& "$PSScriptRoot\stop-processes.ps1" -Root $Root
Start-ScheduledTask -TaskName $TaskName
Write-Host 'Starting... (waiting up to 40 seconds)'

$ok = $false
for ($i = 0; $i -lt 20 -and -not $ok; $i++) {
    Start-Sleep -Seconds 2
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$BackendPort/api/health" -UseBasicParsing -TimeoutSec 3
        $w = Invoke-WebRequest -Uri "http://localhost:$WebPort/" -UseBasicParsing -TimeoutSec 3
        $ok = ($r.StatusCode -eq 200 -and $w.StatusCode -eq 200)
    } catch { }
}

if (-not $ok) { Fail "Started, but did not answer yet. Check the logs in $Root\logs (backend.log, web.log)." }

$ips = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } | Select-Object -ExpandProperty IPAddress
Write-Host "`nFlexiTrack is running and will start automatically with Windows." -ForegroundColor Green
foreach ($ip in $ips) {
    Write-Host "  HR website:   http://${ip}:$WebPort"
    Write-Host "  Backend test: http://${ip}:$BackendPort/api/health"
}
Write-Host "  Logs:         $Root\logs`n"
