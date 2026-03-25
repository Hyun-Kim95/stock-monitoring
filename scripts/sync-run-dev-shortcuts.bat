@echo off
chcp 65001 >nul
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync-run-dev-shortcuts.ps1"
if errorlevel 1 (
  echo 바로가기 동기화에 실패했습니다.
  pause
  exit /b 1
)
pause
