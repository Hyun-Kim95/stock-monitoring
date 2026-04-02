@echo off
REM Shortcuts: run scripts\sync-run-dev-shortcuts.bat
setlocal
chcp 65001 >nul

set "STARTUP_MODE=0"
if /i "%~1"=="--startup" set "STARTUP_MODE=1"

set "PROJECT_DIR=D:\cursor\stockMonitoring"
if exist "%~dp0package.json" set "PROJECT_DIR=%~dp0"

if not exist "%PROJECT_DIR%\package.json" (
  echo [stockMonitoring] package.json not found.
  echo PROJECT_DIR=%PROJECT_DIR%
  set "EXIT_CODE=1"
  if "%STARTUP_MODE%"=="0" goto :hold
  call :startup_fail
  exit /b 1
)

cd /d "%PROJECT_DIR%"
if errorlevel 1 (
  echo [stockMonitoring] cd failed: %PROJECT_DIR%
  set "EXIT_CODE=1"
  if "%STARTUP_MODE%"=="0" goto :hold
  call :startup_fail
  exit /b 1
)

REM Startup folder often has a minimal PATH; prepend common Node locations.
if defined NVM_SYMLINK if exist "%NVM_SYMLINK%\npm.cmd" set "PATH=%NVM_SYMLINK%;%PATH%"
if defined NVM_HOME if exist "%NVM_HOME%\npm.cmd" set "PATH=%NVM_HOME%;%PATH%"
if exist "%ProgramFiles%\nodejs\npm.cmd" set "PATH=%ProgramFiles%\nodejs;%PATH%"
if exist "%ProgramFiles(x86)%\nodejs\npm.cmd" set "PATH=%ProgramFiles(x86)%\nodejs;%PATH%"
if exist "%LocalAppData%\Programs\node\npm.cmd" set "PATH=%LocalAppData%\Programs\node;%PATH%"

where npm >nul 2>nul
if errorlevel 1 (
  echo [stockMonitoring] npm not found. Install Node.js or fix PATH.
  set "EXIT_CODE=1"
  if "%STARTUP_MODE%"=="0" goto :hold
  call :startup_fail
  exit /b 1
)

netstat -ano 2>nul | findstr /C:":3000 " >nul
if errorlevel 1 goto :after_busy3000
if not "%STARTUP_MODE%"=="1" goto :after_busy3000
echo [%date% %time%] port 3000 in use, skip duplicate startup.>>"%TEMP%\stockMonitoring-run-dev.log"
exit /b 0
:after_busy3000

if "%STARTUP_MODE%"=="0" (
  echo [stockMonitoring] starting dev servers...
  echo PROJECT_DIR=%PROJECT_DIR%
  echo Press Ctrl+C in this window to stop.
  echo.
)

REM Extra cmd window would look like a second screen at login — use hidden PowerShell for delay + browser.
start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Sleep -Seconds 8; Start-Process 'http://localhost:3000'"

REM Another project (e.g. sportsMatchData) on the same API port makes /stocks 404 — free it for this repo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%\scripts\free-port-4000.ps1"

call npm run dev
set "EXIT_CODE=%ERRORLEVEL%"

if "%STARTUP_MODE%"=="0" (
  if not "%EXIT_CODE%"=="0" (
    echo.
    echo [stockMonitoring] error, exit code: %EXIT_CODE%
    echo Check npm/node, port conflict, and PROJECT_DIR.
    goto :hold
  )
  echo.
  echo [stockMonitoring] dev stopped.
  goto :hold
)

if not "%EXIT_CODE%"=="0" call :startup_fail
exit /b %EXIT_CODE%

:startup_fail
echo [%date% %time%] fail exit=%EXIT_CODE% PROJECT_DIR=%PROJECT_DIR%>>"%TEMP%\stockMonitoring-run-dev.log"
powershell -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_DIR%\scripts\notify-run-dev-fail.ps1" -LogPath "%TEMP%\stockMonitoring-run-dev.log" 2>nul
goto :eof

:hold
echo.
echo Press any key to close.
pause
exit /b %EXIT_CODE%
