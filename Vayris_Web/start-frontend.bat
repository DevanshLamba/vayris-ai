@echo off
title VAYRIS - Frontend UI
color 0B
echo.
echo  ╔══════════════════════════════════════╗
echo  ║         VAYRIS Frontend UI           ║
echo  ╚══════════════════════════════════════╝
echo.
cd /d "%~dp0\ui"

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
    echo  [SETUP] Installing UI dependencies...
    npm install
    echo.
)

echo  Starting VAYRIS UI on http://localhost:5173 ...
echo  Open your browser and go to http://localhost:5173
echo.
npx vite
pause
