@echo off
setlocal
cd /d "%~dp0"
node "R18B_INSTALLA.cjs" install
if errorlevel 1 (
 echo.
 echo R18B NON INSTALLATA: leggi l'errore, nessun deploy.
) else (
 echo.
 echo R18B INSTALLATA O GIA PRESENTE.
)
pause
