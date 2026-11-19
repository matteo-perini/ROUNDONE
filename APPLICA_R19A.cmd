@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (echo Node.js non trovato. Apri PowerShell in LionFit-Modern-Git. & pause & exit /b 1)
node "%~dp0R19A_INSTALLA.cjs" install
if errorlevel 1 (echo Installazione non riuscita: nessun file sorgente dovrebbe essere stato modificato. & pause & exit /b 1)
echo.
echo Esegui npm.cmd run build prima di pubblicare il sito.
pause
