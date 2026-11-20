@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
:MENU
cls
echo ========================================================
echo   LIONFIT R20A - PULIZIA CSS SAFE
 echo ========================================================
echo.
echo  1 - Anteprima (nessuna modifica)
echo  2 - Applica pulizia CSS con backup esterno
echo  3 - Ripristina CSS originali dal backup
echo  0 - Esci
echo.
set "op="
set /p "op=Seleziona: "
if "%op%"=="0" goto FINE
if "%op%"=="1" (
 node "%~dp0R20A_CSS.cjs" anteprima
 pause
 goto MENU
)
if "%op%"=="2" (
 echo.
 echo Prima di applicare, assicurati che VS Code non stia modificando i CSS.
 set "conferma="
 set /p "conferma=Digita APPLICA per procedere: "
 if /I not "!conferma!"=="APPLICA" (
  echo Operazione annullata.
 ) else (
  node "%~dp0R20A_CSS.cjs" applica
 )
 pause
 goto MENU
)
if "%op%"=="3" (
 echo.
 set "conferma="
 set /p "conferma=Digita RIPRISTINA per procedere: "
 if /I not "!conferma!"=="RIPRISTINA" (
  echo Operazione annullata.
 ) else (
  node "%~dp0R20A_CSS.cjs" ripristina
 )
 pause
 goto MENU
)
echo Scelta non valida.
pause
goto MENU
:FINE
endlocal
