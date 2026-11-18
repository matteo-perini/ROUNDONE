@echo off
setlocal
cd /d "%~dp0"
echo.
echo  LIONFIT PATCH 30 R18A - CHECK INVITI GARE
 echo  Nessun deploy, nessuna modifica ai file applicativi.
echo.
where node >nul 2>nul
if errorlevel 1 (
 echo ERRORE: Node.js non trovato. Apri da terminale VS Code o installa Node.
 pause
 exit /b 1
)
node "%~dp0R18A_CONTROLLO.cjs" "%~dp0"
set "RESULT=%ERRORLEVEL%"
echo.
if not "%RESULT%"=="0" echo Controllo concluso con segnalazioni. NON fare deploy.
if "%RESULT%"=="0" echo Preflight concluso: verifica il rapporto. NON fare ancora deploy.
pause
exit /b %RESULT%
