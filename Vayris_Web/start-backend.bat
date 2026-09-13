@echo off
title VAYRIS - Backend Server
color 0D
echo.
echo  ╔══════════════════════════════════════╗
echo  ║       VAYRIS Backend Server          ║
echo  ╚══════════════════════════════════════╝
echo.
cd /d "%~dp0"

:: Check if node is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js is not installed or not in PATH.
    echo  Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

:: Check if node_modules exist
if not exist "node_modules" (
    echo  [SETUP] Installing dependencies...
    npm install
    echo.
)

:: Check if dist folder exists (compiled code)
if not exist "dist" (
    echo  [SETUP] Building project...
    npx tsc
    echo.
)

echo  Starting VAYRIS Backend on http://localhost:3000 ...
echo.
node dist/index.js
pause
