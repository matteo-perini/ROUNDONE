@echo off
setlocal EnableExtensions DisableDelayedExpansion
title LionFit Modern - prepara sito web LIVE
cd /d "%~dp0"

echo ==========================================================
echo   LIONFIT MODERN - PREPARAZIONE WEB PER GITHUB PAGES
echo ==========================================================
echo.
echo Questa operazione NON pubblica e NON esegue git push.
echo.

if not exist "package.json" (
  echo ERRORE: file nella cartella sbagliata. Manca package.json.
  goto :failed
)
if not exist ".env.production.local" (
  echo BLOCCATO: manca .env.production.local nella radice del progetto.
  echo Ripristina SOLO questo file dalla tua copia privata, non dallo stash completo.
  goto :failed
)
if not exist "scripts\prepara-pubblicazione-docs.mjs" (
  echo ERRORE: manca lo script di preparazione.
  goto :failed
)
where git.exe >nul 2>nul
if errorlevel 1 (
  echo ERRORE: Git non disponibile.
  goto :failed
)
where node.exe >nul 2>nul
if errorlevel 1 (
  echo ERRORE: Node.js non disponibile.
  goto :failed
)
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo ERRORE: npm non disponibile.
  goto :failed
)

set "LF_BRANCH="
for /f "delims=" %%B in ('git branch --show-current 2^>nul') do set "LF_BRANCH=%%B"
if /I not "%LF_BRANCH%"=="main" (
  echo BLOCCATO: sei sul ramo "%LF_BRANCH%", non su main.
  echo Il rilascio web con un solo ramo sara' abilitato dopo il passaggio a main.
  goto :failed
)

echo [1/2] Compilazione LIVE con controlli Firebase, build e STAGING...
call npm.cmd run release:build
if errorlevel 1 (
  echo BLOCCATO: release:build non ha superato i controlli.
  echo La cartella docs NON viene aggiornata.
  goto :failed
)

echo.
echo [2/2] Preparazione cartella docs per GitHub Pages...
node "scripts\prepara-pubblicazione-docs.mjs"
if errorlevel 1 (
  echo BLOCCATO: docs non preparata correttamente.
  goto :failed
)

echo.
echo ==========================================================
echo   PRONTO: apri GitHub Desktop su main.
echo   Controlla le modifiche a docs, poi Commit e Push origin.
echo   GitHub Pages deve essere impostato su main /docs.
echo ==========================================================
echo.
pause
exit /b 0

:failed
echo.
echo NESSUN PUSH, NESSUN CAMBIO DI GITHUB PAGES.
echo Controlla il messaggio di errore prima di riprovare.
echo.
pause
exit /b 1
