@echo off
setlocal
cd /d "%~dp0"
node "%~dp0R18D_INSTALLA.cjs"
if errorlevel 1 (echo. & echo R18D FALLITA: NON ESEGUIRE DEPLOY & pause & exit /b 1)
echo.
pause
