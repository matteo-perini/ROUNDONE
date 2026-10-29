@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo LION FIT - V12 FASE 2 - NOMI ITALIANI
node "prepara_nomi_v12_fase2.cjs"
if errorlevel 1 (echo ATTENZIONE: script interrotto, controlla gli errori.)
pause
