@echo off
setlocal
cd /d "%~dp0"
echo.
echo ===============================================
echo   LionFit R22B.1 - SOLO Firebase Emulator
 echo ===============================================
where node >nul 2>nul
if errorlevel 1 (echo ERRORE: Node.js non trovato.& exit /b 1)
where firebase.cmd >nul 2>nul
if errorlevel 1 (echo ERRORE: Firebase CLI non trovata. Installa firebase-tools dalla fonte ufficiale.& exit /b 1)
if not exist "chat-backend\functions\node_modules\firebase-admin" (
  echo ERRORE: mancano dipendenze backend.
  echo Esegui: cd chat-backend\functions ^&^& npm.cmd install
  exit /b 1
)
if not exist "chat-backend\functions\node_modules\firebase" (
  echo ERRORE: manca la dipendenza firebase per test client.
  echo Esegui: cd chat-backend\functions ^&^& npm.cmd install
  exit /b 1
)
set "LF_CHAT_ENABLED=true"
set "LF_CHAT_PILOT_GYM_ID=gym_pilotTest"
set "LF_CHAT_PRODUCTION_ACK="
set "LF_CHAT_PILOT_COACH_UID="
set "LF_CHAT_PILOT_ATHLETE_UID="
set "GOOGLE_APPLICATION_CREDENTIALS="
echo TEST ESCLUSIVAMENTE LOCALE: progetto demo-lionfit-chat.
pushd chat-backend
call firebase.cmd --config firebase.emulator.json emulators:exec --project demo-lionfit-chat --only auth,firestore,functions "node functions/tests/emulator.e2e.mjs"
set "RC=%ERRORLEVEL%"
popd
if not "%RC%"=="0" echo Test non superato: nessun deploy autorizzato.
exit /b %RC%
