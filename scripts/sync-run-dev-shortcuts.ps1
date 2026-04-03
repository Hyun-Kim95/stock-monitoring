# PowerShell 시작 스크립트를 바로가기에 연결해, 부팅/로그온 시 배치 파싱 이슈를 피합니다.
param(
  [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"
$startupPs1 = Join-Path $ProjectDir "scripts\startup-run-dev.ps1"
if (-not (Test-Path -LiteralPath $startupPs1)) {
  Write-Error "startup-run-dev.ps1을 찾을 수 없습니다: $startupPs1"
}
# 시작 프로그램은 보통 Windows PowerShell 5.1 — 스크립트는 5.1 문법만 사용. pwsh(7+)가 있으면 우선 사용.
$pwshCandidates = @(
  "$env:ProgramFiles\PowerShell\7\pwsh.exe",
  "$env:LocalAppData\Programs\PowerShell\pwsh.exe"
)
$pf86 = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
if ($pf86) {
  $pwshCandidates += (Join-Path $pf86 "PowerShell\7\pwsh.exe")
}
$foundPwsh = $pwshCandidates | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
$pwsh = if ($foundPwsh) { $foundPwsh } else { Join-Path $PSHOME "powershell.exe" }

$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")
$startup = [Environment]::GetFolderPath("Startup")

function Set-DevShortcut {
  param(
    [string]$LinkPath,
    [switch]$StartupMode,
    [int]$WindowStyle,
    [string]$Comment
  )
  $sc = $shell.CreateShortcut($LinkPath)
  $sc.TargetPath = $pwsh
  $arg = "-NoProfile -ExecutionPolicy Bypass -File `"$startupPs1`""
  if ($StartupMode) { $arg += " -StartupMode" }
  $sc.Arguments = $arg
  $sc.WorkingDirectory = $ProjectDir
  $sc.WindowStyle = $WindowStyle
  $sc.Description = $Comment
  $sc.Save()
}

$deskLink = Join-Path $desktop "stockMonitoring dev.lnk"
Set-DevShortcut -LinkPath $deskLink -WindowStyle 1 -Comment "stockMonitoring npm run dev (브라우저 자동 열기)"
Write-Host "바탕화면: $deskLink"

$startLink = Join-Path $startup "stockMonitoring dev.lnk"
Set-DevShortcut -LinkPath $startLink -StartupMode -WindowStyle 7 -Comment "stockMonitoring dev (Windows 시작 시, 최소화)"
Write-Host "시작 프로그램: $startLink"

$vbsLegacy = Join-Path $startup "stockMonitoring-dev.vbs"
if (Test-Path -LiteralPath $vbsLegacy) {
  Remove-Item -LiteralPath $vbsLegacy -Force -ErrorAction SilentlyContinue
  Write-Host "기존 VBS 자동실행 항목 제거: $vbsLegacy"
}

Write-Host "완료."
