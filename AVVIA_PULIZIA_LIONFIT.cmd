@echo off
setlocal
cd /d "%~dp0"
title LIONFIT - PRIMA PULIZIA SAFE
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0LIONFIT_PULIZIA_SAFE.ps1"
set "RESULT=%ERRORLEVEL%"
echo.
echo Premi un tasto per chiudere la finestra...
pause >nul
exit /b %RESULT%
