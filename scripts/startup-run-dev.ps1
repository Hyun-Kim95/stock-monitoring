param(
  [switch]$StartupMode
)

$ErrorActionPreference = "Stop"
$projectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$log = Join-Path $env:TEMP "stockMonitoring-run-dev.log"

function Resolve-Npm {
  $cmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($cmd?.Path) { return $cmd.Path }
  $cmd2 = Get-Command npm -ErrorAction SilentlyContinue
  if ($cmd2?.Path) { return $cmd2.Path }
  $candidates = @(
    "$env:ProgramFiles\nodejs\npm.cmd",
    "$env:ProgramFiles(x86)\nodejs\npm.cmd",
    "$env:LocalAppData\Programs\node\npm.cmd",
    "$env:NVM_SYMLINK\npm.cmd",
    "$env:NVM_HOME\npm.cmd"
  ) | Where-Object { $_ -and (Test-Path $_) }
  return $candidates | Select-Object -First 1
}

try {
  $npm = Resolve-Npm
  if (-not $npm) {
    Add-Content -Path $log -Value "[$(Get-Date -Format s)] startup-run-dev: npm not found"
    exit 1
  }

  Set-Location $projectDir
  & (Join-Path $PSScriptRoot "free-port-4000.ps1") -ProjectRoot $projectDir

  if ($StartupMode -and (Test-NetConnection -ComputerName 127.0.0.1 -Port 3000 -WarningAction SilentlyContinue).TcpTestSucceeded) {
    Add-Content -Path $log -Value "[$(Get-Date -Format s)] startup-run-dev: port 3000 already in use, skip"
    exit 0
  }
  Start-Sleep -Seconds 8
  Start-Process "http://localhost:3000"
  & $npm run dev
} catch {
  Add-Content -Path $log -Value "[$(Get-Date -Format s)] startup-run-dev: failed - $($_.Exception.Message)"
  exit 1
}
