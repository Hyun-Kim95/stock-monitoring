@echo off
setlocal
chcp 65001 >nul

set "STARTUP_MODE=0"
if /i "%~1"=="--startup" set "STARTUP_MODE=1"

REM 실행 위치와 무관하게 고정 프로젝트 경로 사용
set "PROJECT_DIR=D:\cursor\stockMonitoring"
if exist "%~dp0package.json" set "PROJECT_DIR=%~dp0"

if not exist "%PROJECT_DIR%\package.json" (
  echo [stockMonitoring] package.json을 찾지 못했습니다.
  echo PROJECT_DIR=%PROJECT_DIR%
  set "EXIT_CODE=1"
  if "%STARTUP_MODE%"=="0" goto :hold
  exit /b 1
)

cd /d "%PROJECT_DIR%"
if errorlevel 1 (
  echo [stockMonitoring] 프로젝트 폴더로 이동 실패: %PROJECT_DIR%
  set "EXIT_CODE=1"
  if "%STARTUP_MODE%"=="0" goto :hold
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [stockMonitoring] npm 명령을 찾지 못했습니다. Node.js 설치를 확인하세요.
  set "EXIT_CODE=1"
  if "%STARTUP_MODE%"=="0" goto :hold
  exit /b 1
)

if "%STARTUP_MODE%"=="0" (
  echo [stockMonitoring] dev 서버를 시작합니다...
  echo 프로젝트 경로: %PROJECT_DIR%
  echo 종료하려면 이 창에서 Ctrl+C
  echo.
)

REM 서버 준비되면 브라우저 자동 열기 (백그라운드)
start "" cmd /c "timeout /t 8 >nul && start http://localhost:3000"

call npm run dev
set "EXIT_CODE=%ERRORLEVEL%"

if "%STARTUP_MODE%"=="0" (
  if not "%EXIT_CODE%"=="0" (
    echo.
    echo [stockMonitoring] 실행 중 오류가 발생했습니다. (exit code: %EXIT_CODE%)
    echo npm/node 설치, 포트 충돌, package.json 경로를 확인하세요.
    goto :hold
  )
  echo.
  echo [stockMonitoring] 실행이 종료되었습니다.
  goto :hold
)

exit /b %EXIT_CODE%

:hold
echo.
echo 아무 키나 누르면 창이 닫힙니다.
pause
exit /b %EXIT_CODE%
