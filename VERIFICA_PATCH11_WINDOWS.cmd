@echo off
setlocal
cd /d "%~dp0"
echo === LIONFIT - PATCH 11 - VERIFICA WINDOWS ===
if not exist "package.json" (
 echo ERRORE: lancia questo file dalla cartella principale LionFit-Modern-Git.
 exit /b 1
)
where node >nul 2>&1
if errorlevel 1 (
 echo ERRORE: Node.js non trovato.
 exit /b 1
)
if not exist "node_modules\vue-tsc\bin\vue-tsc.js" (
 echo ERRORE: dipendenze non presenti. Da questa cartella esegui npm ci.
 exit /b 1
)
echo.
echo [1/3] Controllo TypeScript e template Vue...
call npm run typecheck
if errorlevel 1 exit /b 1
echo.
echo [2/3] Test PATCH 11, richiede Node 22 o superiore...
node --experimental-strip-types --test "tests\patch11-programs.unit.mjs"
if errorlevel 1 (
 echo ERRORE: controlla che Node sia aggiornato e riprova.
 exit /b 1
)
echo.
echo [3/3] Build Vite...
call npm run build
if errorlevel 1 exit /b 1
echo.
echo Verifica locale completata. Nessuna pubblicazione e' stata eseguita.
exit /b 0
