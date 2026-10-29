@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==============================
echo LION FIT - ITALIANO OFFLINE
 echo ==============================
node tools\prepara-italiano.cjs
echo.
if errorlevel 1 (
  echo IMPORTAZIONE NON COMPLETATA. NON SINCRONIZZARE ANCORA.
) else (
  echo IMPORTAZIONE COMPLETATA. ESEGUI: npx cap sync
)
pause
