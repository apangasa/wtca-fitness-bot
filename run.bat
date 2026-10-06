@echo off
REM Double-click launcher. Keeps the window open on crash so the error is readable.
cd /d "%~dp0"

if not exist ".env" (
  echo No .env file found. Copy .env.example to .env and fill in your Discord token.
  pause
  exit /b 1
)

echo Starting WTCA fitness bot. Close this window to stop it.
call npm run serve

echo.
echo Bot stopped.
pause
