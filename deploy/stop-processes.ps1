# Stops any FlexiTrack node processes still running from this folder
# (launcher, backend, web server). Used by the install/restart/remove
# scripts as a safety net so the ports are always free before starting.
param([Parameter(Mandatory = $true)][string]$Root)

$pattern = [Regex]::Escape($Root)
# The launcher matches on its script name alone: started by hand with
# "npm start" its command line holds only the relative "deploy/start-all.js".
# The backend (a generic "src\index.js") must also be under this folder.
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object {
        $_.CommandLine -and (
            $_.CommandLine -match 'deploy[\\/]start-all\.js' -or
            ($_.CommandLine -match $pattern -and $_.CommandLine -match 'web-server\.js|exit-with-parent\.js|src[\\/]index\.js')
        )
    } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
