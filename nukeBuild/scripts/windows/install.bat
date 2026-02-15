@echo off
REM PCode Dependency Installer - Windows Batch Launcher
REM Launches install.ps1 with proper PowerShell arguments

PowerShell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0install.ps1" %*
