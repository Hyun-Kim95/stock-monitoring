# run-dev.bat과 동일하게 동작하는 바로가기를 바탕화면·시작 프로그램에 맞춥니다.
# (바로가기 대상 = 저장소의 run-dev.bat 한 곳만 유지)
param(
  [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"
$bat = Join-Path $ProjectDir "run-dev.bat"
if (-not (Test-Path -LiteralPath $bat)) {
  Write-Error "run-dev.bat을 찾을 수 없습니다: $bat"
}

$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath("Desktop")
$startup = [Environment]::GetFolderPath("Startup")

function Set-DevShortcut {
  param(
    [string]$LinkPath,
    [string]$Arguments,
    [int]$WindowStyle,
    [string]$Comment
  )
  $sc = $shell.CreateShortcut($LinkPath)
  $sc.TargetPath = $bat
  $sc.Arguments = $Arguments
  $sc.WorkingDirectory = $ProjectDir
  $sc.WindowStyle = $WindowStyle
  $sc.Description = $Comment
  $sc.Save()
}

$deskLink = Join-Path $desktop "stockMonitoring dev.lnk"
Set-DevShortcut -LinkPath $deskLink -Arguments "" -WindowStyle 1 -Comment "stockMonitoring npm run dev (브라우저 자동 열기)"
Write-Host "바탕화면: $deskLink"

$startLink = Join-Path $startup "stockMonitoring dev.lnk"
Set-DevShortcut -LinkPath $startLink -Arguments "--startup" -WindowStyle 7 -Comment "stockMonitoring dev (Windows 시작 시, 최소화)"
Write-Host "시작 프로그램: $startLink"

# 예전에 .vbs로 run-dev를 띄우던 경우, 시작 프로그램에 lnk+vbs가 같이 있으면 서버가 두 번 실행됨
$vbsMaybeDup = Get-ChildItem -LiteralPath $startup -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Extension -ieq ".vbs" -and ($_.Name -match "stock|monitor|run-dev") }
if ($vbsMaybeDup) {
  Write-Host ""
  Write-Warning "시작 프로그램에 아래 .vbs가 있으면 'stockMonitoring dev.lnk'와 중복입니다. .vbs는 삭제하고 .lnk만 두세요."
  $vbsMaybeDup | ForEach-Object { Write-Host "    $($_.FullName)" }
}

Write-Host "완료."
