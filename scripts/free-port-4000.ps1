# Stop other Node processes listening on API_PORT (default 4000) that are not this repo
# (e.g. sportsMatchData also using 4000 causes /stocks 404 in the browser).
param(
  [int]$Port = 0,
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

if ($Port -le 0) {
  $Port = 4000
  $envFile = Join-Path $ProjectRoot ".env"
  if (Test-Path $envFile) {
    Get-Content $envFile -ErrorAction SilentlyContinue | ForEach-Object {
      if ($_ -match '^\s*API_PORT\s*=\s*(\d+)\s*$') { $Port = [int]$Matches[1] }
    }
  }
}

$escProject = [regex]::Escape($ProjectRoot.Replace('\', '/'))
$escProjectWin = [regex]::Escape($ProjectRoot)

$pids = New-Object System.Collections.Generic.HashSet[int]
netstat -ano | ForEach-Object {
  $line = $_.Trim()
  if ($line -notmatch ":$Port\s") { return }
  if ($line -notmatch "LISTENING\s+(\d+)\s*$") { return }
  [void]$pids.Add([int]$Matches[1])
}

foreach ($procId in $pids) {
  $p = Get-CimInstance Win32_Process -Filter "ProcessId=$procId" -ErrorAction SilentlyContinue
  if (-not $p?.CommandLine) { continue }
  $cmd = $p.CommandLine
  if ($cmd -notmatch "node") { continue }
  if ($cmd -match $escProjectWin -or $cmd -match $escProject) { continue }
  if ($cmd -notmatch "sportsMatchData") { continue }
  Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
  Write-Host "[stockMonitoring] Port $Port : stopped other stack (PID $procId)."
}
