@echo off
setlocal
cd /d "%~dp0"
echo [LionFit] Installazione plugin stampa PDF per Capacitor 8...
call npm install --save-exact @capgo/capacitor-printer@8.1.8
if errorlevel 1 (
  echo ERRORE: installazione fallita. Controlla Internet e npm prima della build.
  pause
  exit /b 1
)
echo OK. Ora esegui LIONFIT_PREPARA_WEB_E_DOCS.cmd poi npx cap sync android
pause
endlocal
