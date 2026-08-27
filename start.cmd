@echo off
setlocal
cd /d "%~dp0"
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" server.js
  pause
  exit /b %errorlevel%
)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 18+ or place a portable runtime at runtime\node.exe.
  pause
  exit /b 1
)
node server.js
pause
