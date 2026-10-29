@echo off
chcp 65001 >nul
cd /d "%~dp0"
node APPLICA_REVISIONE.cjs
echo.
pause
