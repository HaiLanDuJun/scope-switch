@echo off
title ScopeSwitch Proxy Console
setlocal
cd /d "%~dp0"

echo =======================================================
echo          ScopeSwitch - Windows Proxy Console          
echo =======================================================
echo.
echo [INFO] 正在启动本地代理路由与管理服务...
echo [INFO] 本地访问地址: http://127.0.0.1:17787/
echo [INFO] 正在唤起客户端窗口，您也可以直接在浏览器中打开上方网址。
echo.

if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" server.js
  pause
  exit /b %errorlevel%
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] 未检测到 Node.js 运行环境。
  echo 请安装 Node.js 18+ 或将便携版 node.exe 放置在 runtime\node.exe
  pause
  exit /b 1
)

node server.js
pause
