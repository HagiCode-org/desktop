#Requires -Version 5.1
# PCode Windows Dependency Installation Script (PowerShell)
# Automatically installs missing dependencies based on version requirements
# Compatible with PowerShell 5.1+ (Windows 10+) and PowerShell 7+ (Windows 11)

param(
    [string]$Region = "global",
    [string]$Arch = (Get-WmiObject -Class Win32_Processor).Architecture,
    [switch]$DryRun,
    [switch]$Verbose,
    [switch]$Help
)

# Show help
if ($Help) {
    Write-Host "Usage: .\install.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Region cn|global    Region selection (default: global)"
    Write-Host "  -Arch x64|arm64     Architecture (default: auto-detected)"
    Write-Host "  -DryRun             Show commands without executing"
    Write-Host "  -Verbose             Enable detailed output"
    Write-Host "  -Help               Show this help message"
    exit 0
}

try {
    # Determine script directory
    $ScriptDir = if ($psise) { Split-Path $psise.CurrentFile.FullPath }
                 elseif ($PSScriptRoot) { $PSScriptRoot }
                 else { Get-Location }

    # Import shared utilities
    $SharedLibPath = Join-Path $ScriptDir "lib\shared.psm1"
    if (Test-Path $SharedLibPath) {
        Import-Module $SharedLibPath -Force
    }
    else {
        throw "Required shared library not found at: $SharedLibPath"
    }

    # Locate dependencies.env file
    $EnvFile = Join-Path $ScriptDir "dependencies.env"

    if (-not (Test-Path $EnvFile)) {
        Write-ColorOutput "dependencies.env file not found at $EnvFile" "error"
        Write-Host "This file is auto-generated during build. Please ensure you have a complete package."
        exit 1
    }

    # Load and parse dependencies.env file
    $EnvVars = Import-DependenciesEnv -EnvFilePath $EnvFile

    # Set default values in case env file is missing some variables
    $DotNetMinVersion = if ($EnvVars.DOTNET_MIN_VERSION) { $EnvVars.DOTNET_MIN_VERSION } else { "10.0" }
    $DotNetRecommendedVersion = if ($EnvVars.DOTNET_RECOMMENDED_VERSION) { $EnvVars.DOTNET_RECOMMENDED_VERSION } else { "10.0" }
    $NodeMinVersion = if ($EnvVars.NODE_MIN_VERSION) { $EnvVars.NODE_MIN_VERSION } else { "18.0.0" }
    $NodeRecommendedVersion = if ($EnvVars.NODE_RECOMMENDED_VERSION) { $EnvVars.NODE_RECOMMENDED_VERSION } else { "24.12.0" }
    $NpmMinVersion = if ($EnvVars.NPM_MIN_VERSION) { $EnvVars.NPM_MIN_VERSION } else { "9.0.0" }
    $NpmRecommendedVersion = if ($EnvVars.NPM_RECOMMENDED_VERSION) { $EnvVars.NPM_RECOMMENDED_VERSION } else { "10.9.0" }
    $ClaudeCodeMinVersion = if ($EnvVars.CLAUDE_CODE_MIN_VERSION) { $EnvVars.CLAUDE_CODE_MIN_VERSION } else { "1.0.0" }
    $OpenspecMinVersion = if ($EnvVars.OPENSPEC_MIN_VERSION) { $EnvVars.OPENSPEC_MIN_VERSION } else { "0.23.0" }

    # Normalize architecture names
    switch -Wildcard ($Arch) {
        "*AMD64*" { $Arch = "x64" }
        "*x86*" { $Arch = "x64" }
        "*ARM64*" { $Arch = "arm64" }
        default { $Arch = "x64" }
    }

    # Initialize counters
    $InstalledCount = 0
    $FailedCount = 0

    Write-Host "=== PCode Dependency Installation ==="
    Write-Host "Platform: Windows ($Arch)"
    Write-Host "Region: $Region"
    Write-Host ""

    # Helper function to execute or dry-run
    function Invoke-InstallCommand {
        param(
            [string]$Command,
            [string]$Arguments
        )

        if ($DryRun) {
            Write-Host "[DRY RUN] $Command $Arguments" -ForegroundColor Yellow
            return $true
        }
        else {
            if ($Verbose) {
                Write-Host "Executing: $Command $Arguments" -ForegroundColor Cyan
            }

            try {
                $process = Start-Process -FilePath $Command -ArgumentList $Arguments -NoNewWindow -Wait -PassThru
                return ($process.ExitCode -eq 0)
            }
            catch {
                Write-ColorOutput "Failed to execute: $($_.Exception.Message)" "error"
                return $false
            }
        }
    }

    # Check and install .NET
    Write-Host "Checking .NET runtime..."
    $DotNetInfo = Get-DependencyStatus -CommandName "dotnet" -VersionArgument "--version"
    if ($DotNetInfo.status -eq "installed") {
        Write-ColorOutput ".NET runtime already installed: $($DotNetInfo.version)" "ok"
    }
    else {
        Write-Host ".NET runtime not found, installing..."
        $success = Invoke-InstallCommand -Command "winget" -Arguments "install Microsoft.DotNet.SDK.10 --silent --accept-source-agreements --accept-package-agreements"

        if ($success) {
            Write-ColorOutput ".NET runtime installed" "ok"
            $InstalledCount++
        }
        else {
            Write-ColorOutput "Failed to install .NET runtime" "error"
            $FailedCount++
        }
    }

    # Check and install Node.js
    Write-Host ""
    Write-Host "Checking Node.js..."
    $NodeInfo = Get-DependencyStatus -CommandName "node" -VersionArgument "--version"
    if ($NodeInfo.status -eq "installed") {
        Write-ColorOutput "Node.js already installed: $($NodeInfo.version)" "ok"
    }
    else {
        Write-Host "Node.js not found, installing..."
        $success = Invoke-InstallCommand -Command "winget" -Arguments "install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements"

        if ($success) {
            Write-ColorOutput "Node.js installed" "ok"
            $InstalledCount++
        }
        else {
            Write-ColorOutput "Failed to install Node.js" "error"
            $FailedCount++
        }
    }

    # Check and install NPM
    Write-Host ""
    Write-Host "Checking NPM..."
    $NpmInfo = Get-DependencyStatus -CommandName "npm" -VersionArgument "--version"
    if ($NpmInfo.status -eq "installed") {
        Write-ColorOutput "NPM already installed: v$($NpmInfo.version)" "ok"
    }
    else {
        Write-Host "NPM not found, installing..."

        # Ensure Node.js is available
        $NodeCheck = Get-DependencyStatus -CommandName "node" -VersionArgument "--version"
        if ($NodeCheck.status -ne "installed") {
            Write-ColorOutput "Node.js not available. Please install Node.js first." "error"
            $FailedCount++
        }
        else {
            # Region-aware npm registry selection
            $NpmRegistryArgs = if ($Region -eq "china") { "--registry=https://registry.npmmirror.com" } else { "" }

            # Use recommended version for installation
            $NpmInstallVersion = $NpmRecommendedVersion

            if (-not $DryRun) {
                if ($Verbose) {
                    Write-Host "Executing: npm install npm@$NpmInstallVersion -g $NpmRegistryArgs --silent --quiet" -ForegroundColor Cyan
                }

                $process = Start-Process -FilePath "npm" -ArgumentList "install", "npm@$NpmInstallVersion", "-g", $NpmRegistryArgs, "--silent", "--quiet" -NoNewWindow -Wait -PassThru
                $success = ($process.ExitCode -eq 0)
            }
            else {
                Write-Host "[DRY RUN] npm install npm@$NpmInstallVersion -g $NpmRegistryArgs --silent --quiet" -ForegroundColor Yellow
                $success = $true
            }

            $NpmCheck = Get-DependencyStatus -CommandName "npm" -VersionArgument "--version"
            if ($NpmCheck.status -eq "installed") {
                Write-ColorOutput "NPM installed" "ok"
                $InstalledCount++
            }
            else {
                Write-ColorOutput "Failed to install NPM" "error"
                $FailedCount++
            }
        }
    }

    # Check and install Claude Code
    Write-Host ""
    Write-Host "Checking Claude Code..."
    $ClaudeInfo = Get-DependencyStatus -CommandName "claude" -VersionArgument "--version"
    if ($ClaudeInfo.status -eq "installed") {
        Write-ColorOutput "Claude Code already installed: $($ClaudeInfo.version)" "ok"
    }
    else {
        Write-Host "Claude Code not found, installing..."

        # Check if npm is available
        $NpmCheck = Get-DependencyStatus -CommandName "npm" -VersionArgument "--version"
        if ($NpmCheck.status -ne "installed") {
            Write-ColorOutput "NPM not available, cannot install Claude Code" "error"
            $FailedCount++
        }
        else {
            # Region-aware npm registry selection
            $NpmRegistryArgs = if ($Region -eq "china") { "--registry=https://registry.npmmirror.com" } else { "" }

            if (-not $DryRun) {
                if ($Verbose) {
                    Write-Host "Executing: npm install @anthropic-ai/claude-code@latest -g $NpmRegistryArgs --silent --quiet" -ForegroundColor Cyan
                }

                $process = Start-Process -FilePath "npm" -ArgumentList "install", "@anthropic-ai/claude-code@latest", "-g", $NpmRegistryArgs, "--silent", "--quiet" -NoNewWindow -Wait -PassThru
                $success = ($process.ExitCode -eq 0)
            }
            else {
                Write-Host "[DRY RUN] npm install @anthropic-ai/claude-code@latest -g $NpmRegistryArgs --silent --quiet" -ForegroundColor Yellow
                $success = $true
            }

            $ClaudeCheck = Get-DependencyStatus -CommandName "claude" -VersionArgument "--version"
            if ($ClaudeCheck.status -eq "installed") {
                Write-ColorOutput "Claude Code installed" "ok"
                $InstalledCount++
            }
            else {
                Write-ColorOutput "Failed to install Claude Code" "error"
                $FailedCount++
            }
        }
    }

    # Check and install OpenSpec
    Write-Host ""
    Write-Host "Checking OpenSpec..."
    $OpenspecInfo = Get-DependencyStatus -CommandName "openspec" -VersionArgument "--version"
    if ($OpenspecInfo.status -eq "installed") {
        Write-ColorOutput "OpenSpec already installed: $($OpenspecInfo.version)" "ok"
    }
    else {
        Write-Host "OpenSpec not found, installing..."

        # Check if npm is available
        $NpmCheck = Get-DependencyStatus -CommandName "npm" -VersionArgument "--version"
        if ($NpmCheck.status -ne "installed") {
            Write-ColorOutput "NPM not available, cannot install OpenSpec" "error"
            $FailedCount++
        }
        else {
            # Region-aware npm registry selection
            $NpmRegistryArgs = if ($Region -eq "china") { "--registry=https://registry.npmmirror.com" } else { "" }

            if (-not $DryRun) {
                if ($Verbose) {
                    Write-Host "Executing: npm install @fission-ai/openspec@$OpenspecMinVersion -g $NpmRegistryArgs --silent --quiet" -ForegroundColor Cyan
                }

                $process = Start-Process -FilePath "npm" -ArgumentList "install", "@fission-ai/openspec@$OpenspecMinVersion", "-g", $NpmRegistryArgs, "--silent", "--quiet" -NoNewWindow -Wait -PassThru
                $success = ($process.ExitCode -eq 0)
            }
            else {
                Write-Host "[DRY RUN] npm install @fission-ai/openspec@$OpenspecMinVersion -g $NpmRegistryArgs --silent --quiet" -ForegroundColor Yellow
                $success = $true
            }

            $OpenspecCheck = Get-DependencyStatus -CommandName "openspec" -VersionArgument "--version"
            if ($OpenspecCheck.status -eq "installed") {
                Write-ColorOutput "OpenSpec installed" "ok"
                $InstalledCount++
            }
            else {
                Write-ColorOutput "Failed to install OpenSpec" "error"
                $FailedCount++
            }
        }
    }

    # Summary
    Write-Host ""
    Write-Host "=== Installation Summary ==="
    Write-Host "Components installed/updated: $InstalledCount"
    Write-Host "Components failed: $FailedCount"

    if ($DryRun) {
        Write-Host "[DRY RUN] No actual changes made"
    }
    else {
        Write-ColorOutput "Installation completed" "info"
    }

    exit 0
}
catch {
    Write-ColorOutput "An error occurred: $($_.Exception.Message)" "error"
    if ($Verbose) {
        Write-Host $_.ScriptStackTrace
    }
    exit 1
}
