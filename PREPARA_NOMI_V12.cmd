@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo ERRORE: Node.js non trovato. Installa Node.js o apri il terminale con Node disponibile.
 pause
 exit /b 1
)
node prepara_nomi_v12.cjs
pause
