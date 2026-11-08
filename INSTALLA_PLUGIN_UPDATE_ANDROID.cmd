@echo off
setlocal
cd /d "%~dp0"
echo.
echo LIONFIT - Installazione dipendenza ufficiale per browser esterno Android
where npm >nul 2>&1
if errorlevel 1 (
 echo ERRORE: npm non trovato. Apri il progetto da VS Code con Node.js installato.
 pause
 exit /b 1
)
call npm install --save-exact @capacitor/app-launcher@8.0.1
if errorlevel 1 (
 echo ERRORE: installazione non riuscita. Controlla Internet e riprova.
 pause
 exit /b 1
)
echo.
echo Dipendenza pronta. Ora puoi eseguire LIONFIT_PREPARA_WEB_E_DOCS.cmd
pause
