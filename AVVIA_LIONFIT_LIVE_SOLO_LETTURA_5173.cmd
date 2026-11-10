@echo off
setlocal
cd /d "%~dp0"
if not exist "package.json" (
 echo ERRORE: estrai la patch nella cartella che contiene package.json.
 pause
 exit /b 1
)
if not exist ".env.production.local" (
 echo ERRORE: manca .env.production.local. Recuperala dalla tua cartella privata originale.
 echo Non pubblicare credenziali o variabili locali su GitHub.
 pause
 exit /b 1
)
where npm >nul 2>nul || (echo ERRORE: npm non trovato. & pause & exit /b 1)
rem L'anteprima LIVE puo' autenticare account reali, ma blocca esplicitamente le scritture dell'app.
set "VITE_LIONFIT_LIVE_WRITES=DISABLED_LOCAL_PREVIEW"
set "VITE_LIONFIT_UPDATE_CHECK=DISABLED_LOCAL_PREVIEW"
echo.
echo [LIONFIT] ANTEPRIMA LIVE - autenticazione ai profili reali. SCRITTURE APP DISABILITATE.
echo NOTA: aprirai dati REALI in sola lettura applicativa. Preferisci STAGING per test che scrivono.
echo.
call npm run build -- --mode production
if errorlevel 1 (echo BUILD FALLITA. Non aprire dist vecchie. & pause & exit /b 1)
echo.
echo [LIONFIT] LIVE SOLO LETTURA - apri http://localhost:5173/
echo Premi CTRL+C per fermare il server.
call npx --no-install vite preview --host 127.0.0.1 --port 5173 --strictPort
if errorlevel 1 (echo Preview non avviata. Chiudi eventuali server sulla porta 5173. & pause & exit /b 1)
