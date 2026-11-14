@echo off
cd /d "%~dp0"
setlocal
call npm run typecheck
if errorlevel 1 goto fail
node --test notifications-backend/functions/model.test.mjs
if errorlevel 1 goto fail
node --check notifications-backend/functions/index.mjs
if errorlevel 1 goto fail
node --check public/lf-push-worker.js
if errorlevel 1 goto fail
call npm run build -- --mode production
if errorlevel 1 goto fail
echo Verifiche locali superate. Nessun deploy. Restano collaudo backend e FCM.
pause
exit /b 0
:fail
echo Verifica non riuscita. Non fare deploy.
pause
exit /b 1
