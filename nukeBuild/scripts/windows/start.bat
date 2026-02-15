@echo off
REM PCode Startup Script for Windows (Framework-Dependent)
REM This is a template that will be copied to the package root as start.bat

cd /d "%~dp0lib"

REM Check if .NET runtime is available
where dotnet >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: .NET runtime not found. Please install .NET 10.0 runtime.
    echo Visit: https://dotnet.microsoft.com/download/dotnet/10.0
    pause
    exit /b 1
)

if not exist "PCode.Web.dll" (
    echo Error: PCode.Web.dll not found in lib directory
    echo Please ensure the package is correctly extracted
    pause
    exit /b 1
)

REM Start application
echo Starting PCode...
dotnet PCode.Web.dll

REM If application crashes, pause to see error
if errorlevel 1 (
    echo.
    echo Application exited with error code: %errorlevel%
    pause
)
