@echo off
setlocal
cd /d "%~dp0"
echo LIONFIT - FIRMA APK / PACKAGE / VERSIONCODE - SOLO LETTURA
echo Usare un APK VECCHIO EFFETTIVAMENTE DISTRIBUITO agli utenti (per esempio asset della vecchia GitHub Release).
echo Non usare automaticamente il file app-debug.apk dentro la vecchia cartella: potrebbe non essere quello distribuito.
echo.
set /p OLD_APK=Percorso completo del VECCHIO LionFit.apk: 
if "%OLD_APK%"=="" goto nofile
echo.
echo Se non hai ancora il nuovo APK, premi INVIO e verra controllato soltanto il vecchio.
set /p NEW_APK=Percorso completo NUOVO APK [facoltativo]: 
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\verify-apk-signatures.ps1" -OldApk "%OLD_APK%" -NewApk "%NEW_APK%"
set "result=%errorlevel%"
pause
exit /b %result%
:nofile
echo Nessun file specificato; nulla da verificare.
pause
exit /b 1
