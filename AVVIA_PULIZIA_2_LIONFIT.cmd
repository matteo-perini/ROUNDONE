@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo ERRORE: Node.js non trovato. Non e' stato modificato nulla.
  pause
  exit /b 1
)
:MENU
cls
echo ========================================================
echo      LIONFIT - PULIZIA 2 - ARCHIVIO STORICO SAFE
echo ========================================================
echo.
echo  1 - Anteprima vecchie patch, README e installer
 echo  2 - Archivia vecchie patch e relativi file
 echo  3 - Anteprima test storici / emulatori isolati
 echo  4 - Archivia test storici / emulatori isolati
 echo  5 - Ripristina l'ultimo archivio disponibile
 echo  0 - Esci
 echo.
set /p SCELTA="Scegli un'opzione: "
if "%SCELTA%"=="1" (node "%~dp0R20_PULIZIA_STORICA_SAFE.cjs" preview & goto FINE)
if "%SCELTA%"=="2" (node "%~dp0R20_PULIZIA_STORICA_SAFE.cjs" archive & goto FINE)
if "%SCELTA%"=="3" (node "%~dp0R20_PULIZIA_STORICA_SAFE.cjs" preview --tests & goto FINE)
if "%SCELTA%"=="4" (node "%~dp0R20_PULIZIA_STORICA_SAFE.cjs" archive --tests & goto FINE)
if "%SCELTA%"=="5" (node "%~dp0R20_PULIZIA_STORICA_SAFE.cjs" restore & goto FINE)
if "%SCELTA%"=="0" exit /b 0
echo Scelta non valida.
pause
goto MENU
:FINE
echo.
pause
goto MENU
