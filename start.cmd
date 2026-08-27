@echo off
setlocal
cd /d "%~dp0"

echo =======================================================
echo          ScopeSwitch - Windows Proxy Console          
echo =======================================================
echo [INFO] ScopeSwitch Service Starting...
echo [INFO] Web UI Address: http://127.0.0.1:17787/
echo =======================================================

if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" server.js
  pause
  exit /b %errorlevel%
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js runtime not found.
  echo Please install Node.js 18+ or place node.exe in runtime\node.exe
  pause
  exit /b 1
)

node server.js
pause
