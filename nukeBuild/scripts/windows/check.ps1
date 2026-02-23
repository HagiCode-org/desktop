#Requires -Version 5.1
# PCode Windows Dependency Verification Script (PowerShell)
# Checks all dependencies and generates JSON result file
# Compatible with PowerShell 5.1+ (Windows 10+) and PowerShell 7+ (Windows 11)

param(
    [switch]$Verbose,
    [switch]$Help
)

# Show help
if ($Help) {
    Write-Host "Usage: .\check.ps1 [options]"
    Write-Host ""
    Write-Host "Options:"
    Write-Host "  -Verbose     Enable detailed output"
    Write-Host "  -Help        Show this help message"
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
    $OpenspecMaxVersion = if ($EnvVars.OPENSPEC_MAX_VERSION) { $EnvVars.OPENSPEC_MAX_VERSION } else { "1.0.0" }

    Write-Host "=== PCode Dependency Check ==="
    Write-Host ""

    # Initialize dependency status objects
    $DotNetStatus = [ordered]@{
        status = "not_installed"
        version = $null
        path = $null
    }

    $NodeStatus = [ordered]@{
        status = "not_installed"
        version = $null
        path = $null
    }

    $NpmStatus = [ordered]@{
        status = "not_installed"
        version = $null
        path = $null
    }

    $ClaudeStatus = [ordered]@{
        status = "not_installed"
        version = $null
        path = $null
    }

    $OpenspecStatus = [ordered]@{
        status = "not_installed"
        version = $null
        path = $null
    }

    # Check .NET
    Write-Host "Checking .NET runtime..."
    $DotNetInfo = Get-DependencyStatus -CommandName "dotnet" -VersionArgument "--version"
    if ($DotNetInfo.status -eq "installed") {
        Write-ColorOutput ".NET runtime found: $($DotNetInfo.version)" "ok"
        $DotNetStatus.status = "installed"
        $DotNetStatus.version = $DotNetInfo.version
        $DotNetStatus.path = $DotNetInfo.path

        if ($Verbose) {
            Write-Host "  Path: $($DotNetInfo.path)"
        }
    }
    else {
        Write-ColorOutput ".NET runtime not found (min: $DotNetMinVersion)" "error"
    }

    # Check Node.js
    Write-Host "Checking Node.js..."
    $NodeInfo = Get-DependencyStatus -CommandName "node" -VersionArgument "--version"
    if ($NodeInfo.status -eq "installed") {
        Write-ColorOutput "Node.js found: $($NodeInfo.version)" "ok"
        $NodeStatus.status = "installed"
        $NodeStatus.version = $NodeInfo.version
        $NodeStatus.path = $NodeInfo.path

        if ($Verbose) {
            Write-Host "  Path: $($NodeInfo.path)"
        }
    }
    else {
        Write-ColorOutput "Node.js not found (min: v$NodeMinVersion)" "error"
    }

    # Check NPM
    Write-Host "Checking NPM..."
    $NpmInfo = Get-DependencyStatus -CommandName "npm" -VersionArgument "--version"
    if ($NpmInfo.status -eq "installed") {
        Write-ColorOutput "NPM found: v$($NpmInfo.version)" "ok"
        $NpmStatus.status = "installed"
        $NpmStatus.version = "v$($NpmInfo.version)"
        $NpmStatus.path = $NpmInfo.path

        if ($Verbose) {
            Write-Host "  Path: $($NpmInfo.path)"
        }
    }
    else {
        Write-ColorOutput "NPM not found (min: v$NpmMinVersion)" "error"
    }

    # Check Claude Code
    Write-Host "Checking Claude Code..."
    $ClaudeInfo = Get-DependencyStatus -CommandName "claude" -VersionArgument "--version"
    if ($ClaudeInfo.status -eq "installed") {
        Write-ColorOutput "Claude Code found: $($ClaudeInfo.version)" "ok"
        $ClaudeStatus.status = "installed"
        $ClaudeStatus.version = $ClaudeInfo.version
        $ClaudeStatus.path = $ClaudeInfo.path

        if ($Verbose) {
            Write-Host "  Path: $($ClaudeInfo.path)"
        }
    }
    else {
        Write-ColorOutput "Claude Code not found (min: $ClaudeCodeMinVersion)" "error"
    }

    # Check OpenSpec with version range validation
    Write-Host "Checking OpenSpec..."
    $OpenspecInfo = Get-DependencyStatus -CommandName "openspec" -VersionArgument "--version"
    if ($OpenspecInfo.status -eq "installed") {
        $VersionTest = Test-DependencyVersion -CurrentVersion $OpenspecInfo.version -MinVersion $OpenspecMinVersion -MaxVersion $OpenspecMaxVersion

        if ($VersionTest.isValid) {
            Write-ColorOutput "OpenSpec found: $($OpenspecInfo.version)" "ok"
            $OpenspecStatus.status = "installed"
            $OpenspecStatus.version = $OpenspecInfo.version
            $OpenspecStatus.path = $OpenspecInfo.path
        }
        else {
            Write-ColorOutput "OpenSpec version $($OpenspecInfo.version) is out of range (min: $OpenspecMinVersion, max: $OpenspecMaxVersion)" "error"
            $OpenspecStatus.status = "version_mismatch"
            $OpenspecStatus.version = $OpenspecInfo.version
            $OpenspecStatus.path = $OpenspecInfo.path
            $OpenspecStatus.error = $VersionTest.error
        }

        if ($Verbose) {
            Write-Host "  Path: $($OpenspecInfo.path)"
        }
    }
    else {
        Write-ColorOutput "OpenSpec not found (min: $OpenspecMinVersion, max: $OpenspecMaxVersion)" "error"
    }

    # Generate JSON result
    Write-Host ""
    Write-ColorOutput "Check complete. Generating result file..." "info"

    $Result = [ordered]@{
        timestamp = New-Timestamp
        platform = "windows"
        dependencies = [ordered]@{
            dotnet = [ordered]@{
                status = $DotNetStatus.status
                version = $DotNetStatus.version
                path = $DotNetStatus.path
                required = $true
                minVersion = $DotNetMinVersion
            }
            node = [ordered]@{
                status = $NodeStatus.status
                version = $NodeStatus.version
                path = $NodeStatus.path
                required = $true
                minVersion = $NodeMinVersion
            }
            npm = [ordered]@{
                status = $NpmStatus.status
                version = $NpmStatus.version
                path = $NpmStatus.path
                required = $true
                minVersion = $NpmMinVersion
            }
            "claude-code" = [ordered]@{
                status = $ClaudeStatus.status
                version = $ClaudeStatus.version
                path = $ClaudeStatus.path
                required = $true
                minVersion = $ClaudeCodeMinVersion
            }
            openspec = [ordered]@{
                status = $OpenspecStatus.status
                version = $OpenspecStatus.version
                path = $OpenspecStatus.path
                required = $true
                minVersion = $OpenspecMinVersion
                maxVersion = $OpenspecMaxVersion
                error = $OpenspecStatus.error
            }
        }
        summary = [ordered]@{
            total = 5
            installed = $null
            requiredInstalled = $null
            ready = $null
        }
    }

    # Calculate summary
    $installedCount = 0
    $requiredInstalledCount = 0

    if ($DotNetStatus.status -eq "installed") { $installedCount++ }
    if ($NodeStatus.status -eq "installed") { $installedCount++ }
    if ($NpmStatus.status -eq "installed") { $installedCount++ }
    if ($ClaudeStatus.status -eq "installed") { $installedCount++ }
    if ($OpenspecStatus.status -eq "installed") { $installedCount++ }

    if ($DotNetStatus.status -eq "installed") { $requiredInstalledCount++ }
    if ($NodeStatus.status -eq "installed") { $requiredInstalledCount++ }
    if ($NpmStatus.status -eq "installed") { $requiredInstalledCount++ }
    if ($ClaudeStatus.status -eq "installed") { $requiredInstalledCount++ }
    if ($OpenspecStatus.status -eq "installed") { $requiredInstalledCount++ }

    $Result.summary.installed = $installedCount
    $Result.summary.requiredInstalled = $requiredInstalledCount
    $Result.summary.ready = ($requiredInstalledCount -eq 5)

    # Write JSON output
    $ResultPath = Join-Path $ScriptDir "check-result.json"
    $jsonWritten = Format-JsonOutput -Data $Result -OutputPath $ResultPath -Depth 10

    if ($jsonWritten) {
        Write-Host ""
        Write-Host "Results written to: $ResultPath"

        # Display summary
        Write-Host ""
        Write-Host "Summary:"
        Write-Host "  Required dependencies: $requiredInstalledCount/5 installed"
        Write-Host "  Ready: $(if ($Result.summary.ready) { 'Yes' } else { 'No' })"
    }
    else {
        Write-ColorOutput "Failed to write results file" "error"
        exit 1
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
