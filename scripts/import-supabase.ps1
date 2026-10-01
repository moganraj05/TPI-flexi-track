# Copies ALL current FlexiTrack data from Supabase into the Docker Postgres.
#
# Run from the project folder (Docker Desktop must be running):
#   powershell -ExecutionPolicy Bypass -File scripts\import-supabase.ps1
# Non-interactive (e.g. from an automation/agent shell), taking the Supabase
# URL from DIRECT_URL in backend\.env:
#   powershell -ExecutionPolicy Bypass -File scripts\import-supabase.ps1 -Yes
#
# What it does:
#   1. Dumps the Supabase data to a temporary file (Supabase is only ever
#      READ, never changed)
#   2. Wipes the Docker FlexiTrack database (only after the dump succeeded)
#   3. Starts just the database container
#   4. Loads that file into the Docker database
#   5. Clears phone push tokens, so this copy never notifies real workers
#   6. Shows row counts, deletes the temp file, starts the full app

param(
  # Supabase DIRECT_URL (port 5432). If omitted: DIRECT_URL from
  # backend\.env when it points at Supabase, otherwise asked for.
  [string]$DirectUrl,
  # Skip the "Type YES" confirmation.
  [switch]$Yes
)

# Native commands (docker) report failure via exit codes, checked after each
# step with Check; 'Stop' would also abort on harmless stderr output in PS 5.1.
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host ""; Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }
function Check($what) { if ($LASTEXITCODE -ne 0) { Fail "$what failed (exit code $LASTEXITCODE). See the messages above." } }

# Database name/user from .env (same defaults as docker-compose.yml).
$dbName = 'flexitrack'
$dbUser = 'flexitrack'
if (-not (Test-Path '.env')) { Fail ".env not found in $root. Copy .env.example to .env and set POSTGRES_PASSWORD first." }
foreach ($line in Get-Content '.env') {
  if ($line -match '^\s*POSTGRES_DB\s*=\s*(.+?)\s*$') { $dbName = $Matches[1] }
  if ($line -match '^\s*POSTGRES_USER\s*=\s*(.+?)\s*$') { $dbUser = $Matches[1] }
}

docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail "Docker is not running. Open Docker Desktop, wait for 'Engine running', then run this again." }

# Docker overrides backend\.env's database settings with its own Postgres,
# so a Supabase DIRECT_URL left there is unused by the app and safe to read.
if (-not $DirectUrl -and (Test-Path 'backend\.env')) {
  foreach ($line in Get-Content 'backend\.env') {
    if ($line -match '^\s*DIRECT_URL\s*=\s*"?([^"]+?)"?\s*$') {
      # Copy the capture first: the -match below overwrites $Matches.
      $candidate = $Matches[1]
      if ($candidate -match 'supabase') {
        $DirectUrl = $candidate
        Write-Host "Using DIRECT_URL from backend\.env"
      }
    }
  }
}
if (-not $DirectUrl) {
  if ($Yes) { Fail "No Supabase URL found. Put the Supabase DIRECT_URL (port 5432) in backend\.env, or pass -DirectUrl." }
  Write-Host "Paste the Supabase DIRECT_URL (the one with port 5432), then press Enter:" -ForegroundColor Yellow
  $DirectUrl = (Read-Host).Trim().Trim('"')
}
if ($DirectUrl -notmatch '^postgres(ql)?://') { Fail "That doesn't look like a database URL (it must start with postgresql://)." }
if ($DirectUrl -match ':6543/') { Fail "That is the pooled URL (port 6543). Use the DIRECT_URL with port 5432." }
# Show where we're reading from, never the password.
Write-Host ("Source: " + ($DirectUrl -replace '//([^:/@]+):[^@]*@', '//$1:****@'))

Write-Host ""
Write-Host "This REPLACES everything in the Docker FlexiTrack database with the Supabase data." -ForegroundColor Yellow
Write-Host "Supabase itself is only read, not changed." -ForegroundColor Yellow
if (-not $Yes) {
  $answer = Read-Host "Type YES to continue"
  if ($answer -ne 'YES') { Write-Host "Cancelled."; exit 0 }
}

$backupDir = Join-Path $root 'backups'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$dumpFile = Join-Path $backupDir 'supabase.sql'
if (Test-Path $dumpFile) { Remove-Item $dumpFile -Force }

Step "1/6  Downloading data from Supabase (read-only)..."
docker run --rm -v "${backupDir}:/backup" postgres:17-alpine `
  pg_dump $DirectUrl --schema=public --no-owner --no-privileges -f /backup/supabase.sql
Check "Downloading from Supabase"
if (-not (Test-Path $dumpFile) -or (Get-Item $dumpFile).Length -eq 0) { Fail "The downloaded file is empty." }
Write-Host ("     Downloaded {0:N0} KB" -f ((Get-Item $dumpFile).Length / 1KB))

Step "2/6  Stopping FlexiTrack and wiping the Docker database..."
docker compose down -v
Check "Stopping containers"

Step "3/6  Starting a fresh, empty database..."
docker compose up -d db
Check "Starting the database"
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  docker compose exec -T db pg_isready -U $dbUser -d $dbName *> $null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ready) { Fail "The database did not become ready within 60 seconds. Check: docker compose logs db" }

Step "4/6  Loading the data into the Docker database..."
docker compose cp $dumpFile db:/tmp/supabase.sql
Check "Copying the file into the container"
docker compose exec -T db psql -q -U $dbUser -d $dbName -f /tmp/supabase.sql
Check "Loading the data"

Step "5/6  Clearing phone push tokens (so this copy never notifies real workers)..."
docker compose exec -T db psql -q -U $dbUser -d $dbName -c "UPDATE users SET push_token = NULL;"
Check "Clearing push tokens"

Write-Host ""
Write-Host "Imported data:" -ForegroundColor Green
docker compose exec -T db psql -U $dbUser -d $dbName -c "SELECT 'users' AS table_name, COUNT(*) FROM users UNION ALL SELECT 'departments', COUNT(*) FROM departments UNION ALL SELECT 'polls', COUNT(*) FROM polls UNION ALL SELECT 'responses', COUNT(*) FROM responses UNION ALL SELECT 'followups', COUNT(*) FROM followups;"

# The dump holds every worker's personal data; don't leave it lying around.
docker compose exec -T db rm -f /tmp/supabase.sql
Remove-Item $dumpFile -Force

Step "6/6  Starting the full FlexiTrack app..."
docker compose up -d --build
Check "Starting the app"

Write-Host ""
Write-Host "Done. Open http://localhost:8080 and log in with your normal FlexiTrack email and password." -ForegroundColor Green
