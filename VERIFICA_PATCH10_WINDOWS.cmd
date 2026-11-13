@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo ===============================================
echo  LIONFIT - PATCH 10 / VERIFICA WINDOWS
 echo ===============================================
if not exist package.json (echo ERRORE: ZIP estratto nella cartella errata, package.json assente. & pause & exit /b 1)
where node >nul 2>&1
if errorlevel 1 (echo ERRORE: Node.js non trovato. & pause & exit /b 1)
echo.
echo [1/2] Controllo TypeScript...
call npm run typecheck
if errorlevel 1 (echo TYPECHECK NON PASSATO. Non pubblicare. & pause & exit /b 1)
echo.
echo [2/2] Regressioni e test Dashboard...
node --experimental-strip-types --test tests/patch04-regression.mjs tests/patch05-regression.mjs tests/patch09-legacy-creator.unit.mjs tests/patch10-dashboard.unit.mjs tests/progress07.static.unit.mjs tests/progress08.static.unit.mjs tests/progress360.goals.unit.mjs tests/progress360.unit.mjs
if errorlevel 1 (echo TEST NON PASSATI. Non pubblicare. & pause & exit /b 1)
echo.
echo VERIFICHE PASSATE. Effettua il test manuale con il tuo account di prova.
echo Ricorda: per la build pubblica usa il tuo script LIVE Web/Docs.
pause
exit /b 0
