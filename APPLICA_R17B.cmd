@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0R17B_INSTALL.ps1" -ProjectRoot "%CD%"
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" echo Operazione NON completata. Leggi il messaggio di errore sopra.
pause
exit /b %RC%
