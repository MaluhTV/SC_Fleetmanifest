@echo off
rem Fleet Manifest - download ship images and rebuild dist\flottenmanifest.html (Windows, double-click)
rem Needs Node.js 18 or newer: https://nodejs.org
cd /d "%~dp0.."
where node >nul 2>nul || (echo Node.js not found. Please install it from https://nodejs.org & pause & exit /b 1)
node tools\fetch-ship-images.mjs %* || goto :fail
node tools\validate-ships.mjs --format || goto :fail
node tools\build-standalone.mjs || goto :fail
echo.
echo Done. Open dist\flottenmanifest.html
pause
exit /b 0
:fail
echo.
echo Something went wrong, see the messages above.
pause
exit /b 1
