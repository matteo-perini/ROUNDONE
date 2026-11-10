@echo off
setlocal
cd /d "%~dp0"
if not exist "package.json" (
 echo ERRORE: estrai la patch nella cartella di LionFit che contiene package.json.
 pause
 exit /b 1
)
if not exist ".env.staging.local" (
 echo ERRORE: manca .env.staging.local. Recuperala dalla tua cartella privata originale.
 echo Non copiare le credenziali nei file della patch o su GitHub.
 pause
 exit /b 1
)
where npm >nul 2>nul || (echo ERRORE: npm non trovato. & pause & exit /b 1)
echo.
echo [LIONFIT] BUILD STAGING - account e dati di test, mai produzione.
echo.
call npm run build -- --mode staging
if errorlevel 1 (echo BUILD FALLITA. Non aprire dist vecchie. & pause & exit /b 1)
echo.
echo [LIONFIT] STAGING - apri http://localhost:5173/
echo Premi CTRL+C per fermare il server.
call npx --no-install vite preview --host 127.0.0.1 --port 5173 --strictPort
if errorlevel 1 (echo Preview non avviata. Chiudi eventuali server sulla porta 5173. & pause & exit /b 1)
