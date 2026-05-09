# Free TCP port 3000 before `npm run dev` (Next.js default) so EADDRINUSE does not block the web app.
# Stops Node processes that are listening on $Port (default 3000). Use with care if you run unrelated Node servers on 3000.
param(
  [int]$Port = 3000,
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

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
  if (-not $p -or -not $p.CommandLine) { continue }
  $cmd = $p.CommandLine
  if ($cmd -notmatch "node") { continue }
  # Same repo: previous dev server still holding 3000 — stop so this `npm run dev` can bind.
  if ($cmd -match $escProjectWin -or $cmd -match $escProject) {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Write-Host "[stockMonitoring] Port $Port : stopped prior dev (PID $procId)."
    continue
  }
  # Other stacks on 3000 (e.g. another Next app) — stop only if it looks like Next/turbopack.
  if ($cmd -match "next" -or $cmd -match "turbopack") {
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Write-Host "[stockMonitoring] Port $Port : stopped other Node listener (PID $procId)."
  }
}
