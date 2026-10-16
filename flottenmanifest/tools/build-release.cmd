@echo off
rem Fleet Manifest - build a release file that shows the ship images straight from RSI (Windows, double-click)
rem No image files are embedded or stored, only links. Needs Node.js 18 or newer: https://nodejs.org
cd /d "%~dp0.."
where node >nul 2>nul || (echo Node.js not found. Please install it from https://nodejs.org & pause & exit /b 1)
node tools\fetch-ship-images.mjs --urls-only %* || goto :fail
node tools\build-standalone.mjs --remote-images || goto :fail
echo.
echo Done. dist\flottenmanifest.html is ready to attach to a GitHub release.
pause
exit /b 0
:fail
echo.
echo Something went wrong, see the messages above.
pause
exit /b 1
