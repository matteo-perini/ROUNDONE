@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo ERRORE: Node.js non trovato. Installa Node e riprova.
 pause
 exit /b 1
)
node "%~dp0LionFit_R15_APPLICA.cjs"
if errorlevel 1 (
 echo.
 echo PATCH NON APPLICATA. Controlla il messaggio qui sopra.
 pause
 exit /b 1
)
echo.
echo Segui LEGGIMI_R15.txt per i test e la pubblicazione.
pause
