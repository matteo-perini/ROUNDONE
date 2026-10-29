@echo off
chcp 65001 >nul
cd /d "%~dp0"
node "APPLICA_PULIZIA.cjs"
echo.
pause
