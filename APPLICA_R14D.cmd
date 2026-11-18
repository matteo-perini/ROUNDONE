@echo off
setlocal
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (echo Node.js non trovato. & pause & exit /b 1)
node "%~dp0LionFit_R14D_APPLICA.cjs"
if errorlevel 1 (pause & exit /b 1)
echo.
echo Poi avvia i controlli e la build nel progetto.
pause
