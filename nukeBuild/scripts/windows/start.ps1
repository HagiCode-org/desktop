#Requires -Version 5.1
<#
.SYNOPSIS
    PCode Startup Script for Windows (Framework-Dependent)
.DESCRIPTION
    This script will be copied to the package root as start.ps1
    It checks for .NET runtime and starts the PCode.Web application
#>

$ErrorActionPreference = "Stop"

# Hide console window if running in a console host
try {
    $consolePtr = [Console.Window]::GetConsoleWindow()
    if ($consolePtr -ne [IntPtr]::Zero) {
        # ShowWindowAsync: 0 = Hide, 3 = Maximize, 5 = Show
        Add-Type -Name User32 -Namespace Win32 -MemberDefinition @"
[DllImport("user32.dll")]
public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
"@
        [Win32.User32]::ShowWindowAsync($consolePtr, 0) | Out-Null
    }
} catch {
    # Silently ignore window hiding failures
}

# Change to lib directory
$libPath = Join-Path $PSScriptRoot "lib"
Set-Location $libPath

# Check if .NET runtime is available
$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $dotnet) {
    $message = ".NET runtime not found. Please install .NET 10.0 runtime.`n`nVisit: https://dotnet.microsoft.com/download/dotnet/10.0"

    # Show console if hidden (for error display)
    try {
        $consolePtr = [Console.Window]::GetConsoleWindow()
        if ($consolePtr -ne [IntPtr]::Zero) {
            [Win32.User32]::ShowWindowAsync($consolePtr, 5) | Out-Null
        }
    } catch {}

    # Try to show message box, fallback to console
    try {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show(
            $message,
            "Error - .NET Runtime Required",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        )
    } catch {
        Write-Host $message -ForegroundColor Red
        Read-Host "Press Enter to exit"
    }
    exit 1
}

# Check if PCode.Web.dll exists
if (-not (Test-Path "PCode.Web.dll")) {
    $message = "PCode.Web.dll not found in lib directory.`n`nPlease ensure the package is correctly extracted."

    # Show console if hidden (for error display)
    try {
        $consolePtr = [Console.Window]::GetConsoleWindow()
        if ($consolePtr -ne [IntPtr]::Zero) {
            [Win32.User32]::ShowWindowAsync($consolePtr, 5) | Out-Null
        }
    } catch {}

    try {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show(
            $message,
            "Error - File Not Found",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        )
    } catch {
        Write-Host $message -ForegroundColor Red
        Read-Host "Press Enter to exit"
    }
    exit 1
}

# Start application directly (no new window)
try {
    & dotnet PCode.Web.dll
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
        throw "Application exited with code: $exitCode"
    }
} catch {
    $errorMessage = $_.Exception.Message

    # Show console if hidden (for error display)
    try {
        $consolePtr = [Console.Window]::GetConsoleWindow()
        if ($consolePtr -ne [IntPtr]::Zero) {
            [Win32.User32]::ShowWindowAsync($consolePtr, 5) | Out-Null
        }
    } catch {}

    try {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.MessageBox]::Show(
            "Application failed to start.`n`nError: $errorMessage",
            "Error - Application Startup Failed",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        )
    } catch {
        Write-Host "Application failed to start." -ForegroundColor Red
        Write-Host "Error: $errorMessage" -ForegroundColor Red
        Read-Host "Press Enter to exit"
    }
    exit 1
}
