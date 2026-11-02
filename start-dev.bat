@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js is not installed.
  echo     Install the LTS version from https://nodejs.org and run this file again.
  pause
  exit /b
)
if not exist node_modules (
  echo Installing packages... ^(first time only, 1-2 minutes^)
  call npm install
  if errorlevel 1 ( pause & exit /b )
)
echo.
echo Starting dev server. Keep this window open - close it to stop the server.
echo.
call npm run dev
pause
