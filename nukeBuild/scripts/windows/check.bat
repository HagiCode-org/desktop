@echo off
REM PCode Environment Check - Windows Batch Launcher
REM Launches check.ps1 with proper PowerShell arguments

PowerShell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0check.ps1" %*
