@echo off
setlocal EnableExtensions DisableDelayedExpansion
title LionFit Modern - Solo Build e Preparazione WEB
cd /d "%~dp0"

echo ======================================================
echo  LIONFIT MODERN - SOLO PREPARAZIONE WEB
 echo  Controlli LIVE + Build + aggiornamento docs
 echo  Commit e Push origin da GitHub Desktop, MANUALI
 echo ======================================================
echo.
if not exist "%~dp0PREPARA_LIONFIT_WEB.cmd" (
  echo ERRORE: manca PREPARA_LIONFIT_WEB.cmd.
  echo Metti questo file nella cartella principale LionFit-Modern-Git.
  echo Nessuna build eseguita, nessun commit/push.
  pause
  exit /b 1
)
call "%~dp0PREPARA_LIONFIT_WEB.cmd"
exit /b %errorlevel%
