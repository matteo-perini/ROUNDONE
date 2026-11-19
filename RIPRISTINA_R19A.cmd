@echo off
setlocal
cd /d "%~dp0"
node "%~dp0R19A_INSTALLA.cjs" rollback
pause
