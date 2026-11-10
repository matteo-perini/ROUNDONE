@echo off
setlocal
cd /d "%~dp0"
echo ==== LION FIT - PATCH 05 CORRETTA - CONTROLLI LOCALI ====
echo.
node VERIFICA_PATCH05_CORRETTA.cjs
if errorlevel 1 goto fail
call npm run typecheck
if errorlevel 1 goto fail
node --experimental-strip-types tests/patch05-regression.mjs
if errorlevel 1 goto fail
echo.
echo TEST STATICI SUPERATI. Per provare login LIVE/STAGING usare i nuovi avviatori CMD.
echo Il normale npm run dev non usa Firebase LIVE/STAGING: non e' un problema di account.
pause
exit /b 0
:fail
echo.
echo ERRORE: uno dei controlli non e' passato. NON pubblicare l'app.
pause
exit /b 1
