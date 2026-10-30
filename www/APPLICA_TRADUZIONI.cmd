@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo =============================================================
echo  LION FIT - TRADUZIONI E SINONIMI - RICERCA PLUS 0.26.1
echo =============================================================
where node >nul 2>&1
if errorlevel 1 (
  echo ERRORE: Node.js non trovato. Installa Node.js.
  pause
  exit /b 1
)
node "%~dp0APPLICA_TRADUZIONI.cjs"
if errorlevel 1 (
  echo.
  echo Operazione NON completata. Controlla gli errori sopra.
  pause
  exit /b 1
)
echo.
echo FINE - controlla i numeri sopra e manda una foto.
pause
