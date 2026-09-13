@echo off
title VAYRIS - Full Launch
color 0E
echo.
echo  ╔══════════════════════════════════════╗
echo  ║        VAYRIS - Full Launch          ║
echo  ║   Backend + Frontend in one click    ║
echo  ╚══════════════════════════════════════╝
echo.
cd /d "%~dp0"

:: Launch backend in a new window
start "VAYRIS Backend" cmd /c "%~dp0start-backend.bat"

:: Small delay to let backend initialize first
timeout /t 3 /nobreak >nul

:: Launch frontend in a new window
start "VAYRIS Frontend" cmd /c "%~dp0start-frontend.bat"

:: Wait a moment then open browser
timeout /t 4 /nobreak >nul
start http://localhost:5173

echo.
echo  Both servers launched! Browser opening...
echo  Backend: http://localhost:3000
echo  Frontend: http://localhost:5173
echo.
echo  Close this window anytime. The servers run in their own windows.
timeout /t 5 /nobreak >nul
