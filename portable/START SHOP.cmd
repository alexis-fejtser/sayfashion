@echo off
chcp 65001 >nul
title SAY Fashion Preview
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-preview.ps1"
pause
