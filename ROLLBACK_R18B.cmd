@echo off
setlocal
cd /d "%~dp0"
node "R18B_INSTALLA.cjs" rollback
if errorlevel 1 echo Ripristino fermato per sicurezza: controlla i file.
pause
