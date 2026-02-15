# PCode Windows PowerShell Shared Utilities
# Common functions for check.ps1 and install.ps1

function Get-DependencyStatus {
    <#
    .SYNOPSIS
    Checks if a command is available and gets its version and path.

    .PARAMETER CommandName
    The name of the command to check (e.g., "dotnet", "node", "npm").

    .PARAMETER VersionArgument
    The argument to pass to get the version (default: "--version").

    .RETURNS
    A hashtable with status, version, and path information.
    #>
    param(
        [string]$CommandName,
        [string]$VersionArgument = "--version"
    )

    $result = @{
        status = "not_installed"
        version = $null
        path = $null
    }

    try {
        $command = Get-Command $CommandName -ErrorAction SilentlyContinue
        if ($command) {
            $versionOutput = & $CommandName $VersionArgument 2>$null
            if ($versionOutput) {
                $result.version = $versionOutput.ToString().Trim()
                $result.path = $command.Source
                $result.status = "installed"
            }
        }
    }
    catch {
        # Command not found, return default status
    }

    return $result
}

function Test-DependencyVersion {
    <#
    .SYNOPSIS
    Tests if a version meets minimum requirements.

    .PARAMETER CurrentVersion
    The current version string (e.g., "10.0.0", "v18.0.0").

    .PARAMETER MinVersion
    The minimum required version string.

    .PARAMETER MaxVersion
    The maximum allowed version string (optional).

    .RETURNS
    A hashtable with isValid (boolean) and error (string) if invalid.
    #>
    param(
        [string]$CurrentVersion,
        [string]$MinVersion,
        [string]$MaxVersion = $null
    )

    $result = @{
        isValid = $false
        error = $null
    }

    if ([string]::IsNullOrEmpty($CurrentVersion)) {
        $result.error = "Version is empty or null"
        return $result
    }

    # Remove 'v' prefix if present
    $currentVersion = $CurrentVersion -replace '^v', ''
    $minVersion = $MinVersion -replace '^v', ''

    try {
        $current = [version]$currentVersion
        $min = [version]$minVersion

        if ($current -lt $min) {
            $result.error = "Version $CurrentVersion is too low (min: $MinVersion)"
            return $result
        }

        if ($MaxVersion) {
            $maxVersion = $MaxVersion -replace '^v', ''
            $max = [version]$maxVersion
            if ($current -ge $max) {
                $result.error = "Version $CurrentVersion is too high (max: $MaxVersion)"
                return $result
            }
        }

        $result.isValid = $true
    }
    catch {
        $result.error = "Invalid version format: $($_.Exception.Message)"
    }

    return $result
}

function Format-JsonOutput {
    <#
    .SYNOPSIS
    Formats an object as JSON and writes it to a file.

    .PARAMETER Data
    The object to convert to JSON.

    .PARAMETER OutputPath
    The path where the JSON file should be written.

    .PARAMETER Depth
    The depth for JSON serialization (default: 10).
    #>
    param(
        [object]$Data,
        [string]$OutputPath,
        [int]$Depth = 10
    )

    try {
        $json = $Data | ConvertTo-Json -Depth $Depth -Compress:$false
        $json | Out-File -FilePath $OutputPath -Encoding UTF8NoBOM -Force
        return $true
    }
    catch {
        Write-Error "Failed to write JSON to $OutputPath : $($_.Exception.Message)"
        return $false
    }
}

function Write-ColorOutput {
    <#
    .SYNOPSIS
    Writes colored output to the console based on status.

    .PARAMETER Message
    The message to write.

    .PARAMETER Status
    The status type: "ok", "error", "warning", or "info".
    #>
    param(
        [string]$Message,
        [string]$Status = "info"
    )

    switch ($Status) {
        "ok" {
            Write-Host "[OK] $Message" -ForegroundColor Green
        }
        "error" {
            Write-Host "[ERROR] $Message" -ForegroundColor Red
        }
        "warning" {
            Write-Host "[WARNING] $Message" -ForegroundColor Yellow
        }
        "info" {
            Write-Host "[INFO] $Message" -ForegroundColor Cyan
        }
        default {
            Write-Host $Message
        }
    }
}

function Get-ScriptDirectory {
    <#
    .SYNOPSIS
    Gets the directory where the script is located.

    .RETURNS
    The full path to the script directory.
    #>
    if ($psise) {
        # Running in PowerShell ISE
        return Split-Path $psise.CurrentFile.FullPath
    }
    elseif ($PSScriptRoot) {
        # Normal PowerShell execution
        return $PSScriptRoot
    }
    else {
        # Fallback to current directory
        return Get-Location
    }
}

function Import-DependenciesEnv {
    <#
    .SYNOPSIS
    Imports the dependencies.env file and returns a hashtable of values.

    .PARAMETER EnvFilePath
    The path to the dependencies.env file.

    .RETURNS
    A hashtable with environment variable values, or null if file not found.
    #>
    param(
        [string]$EnvFilePath
    )

    if (-not (Test-Path $EnvFilePath)) {
        return $null
    }

    $envVars = @{}

    Get-Content $EnvFilePath | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            $envVars[$name] = $value
        }
    }

    return $envVars
}

function New-Timestamp {
    <#
    .SYNOPSIS
    Generates an ISO 8601 timestamp for the current time.

    .RETURNS
    A string representing the current time in ISO 8601 format.
    #>
    return (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
}

function Invoke-AzureIndexGeneration {
    <#
    .SYNOPSIS
    Invokes the Azure index generation step in separated mode.

    .PARAMETER BuildScriptPath
    The path to the build script (e.g., "./build.sh").

    .PARAMETER AzureBlobSasUrl
    The Azure Blob SAS URL for authentication.

    .PARAMETER IndexOutputPath
    Optional path for the generated index.json file.

    .PARAMETER AdditionalArgs
    Additional arguments to pass to the build script.

    .RETURNS
    True if the step succeeded, false otherwise.
    #>
    param(
        [string]$BuildScriptPath = "./build.sh",
        [string]$AzureBlobSasUrl = "",
        [string]$IndexOutputPath = "",
        [string[]]$AdditionalArgs = @()
    )

    Write-ColorOutput "=== 步骤 1: 生成 Azure Index ===" "info"

    $args = @("--target", "GenerateAzureIndex")

    if (-not [string]::IsNullOrEmpty($AzureBlobSasUrl)) {
        $args += "--azure-blob-sas-url"
        $args += $AzureBlobSasUrl
    }

    if (-not [string]::IsNullOrEmpty($IndexOutputPath)) {
        $args += "--azure-index-output-path"
        $args += $IndexOutputPath
    }

    $args += $AdditionalArgs

    try {
        & $BuildScriptPath $args
        if ($LASTEXITCODE -eq 0) {
            Write-ColorOutput "✅ Azure Index 生成成功" "ok"
            return $true
        } else {
            Write-ColorOutput "❌ Azure Index 生成失败 (退出码: $LASTEXITCODE)" "error"
            return $false
        }
    }
    catch {
        Write-ColorOutput "❌ 执行 Azure Index 生成时出错: $($_.Exception.Message)" "error"
        return $false
    }
}

function Invoke-AzureBlobPublish {
    <#
    .SYNOPSIS
    Invokes the Azure Blob publish step in separated mode.

    .PARAMETER BuildScriptPath
    The path to the build script (e.g., "./build.sh").

    .PARAMETER AzureBlobSasUrl
    The Azure Blob SAS URL for authentication.

    .PARAMETER LocalIndexPath
    Path to the local index.json file to upload.

    .PARAMETER AdditionalArgs
    Additional arguments to pass to the build script.

    .RETURNS
    True if the step succeeded, false otherwise.
    #>
    param(
        [string]$BuildScriptPath = "./build.sh",
        [string]$AzureBlobSasUrl = "",
        [string]$LocalIndexPath = "",
        [string[]]$AdditionalArgs = @()
    )

    Write-ColorOutput "=== 步骤 2: 上传 index.json 到 Azure Blob ===" "info"

    $args = @("--target", "PublishToAzureBlob")

    if (-not [string]::IsNullOrEmpty($AzureBlobSasUrl)) {
        $args += "--azure-blob-sas-url"
        $args += $AzureBlobSasUrl
    }

    if (-not [string]::IsNullOrEmpty($LocalIndexPath)) {
        $args += "--azure-index-output-path"
        $args += $LocalIndexPath
    }

    $args += $AdditionalArgs

    try {
        & $BuildScriptPath $args
        if ($LASTEXITCODE -eq 0) {
            Write-ColorOutput "✅ Azure Blob 上传成功" "ok"
            return $true
        } else {
            Write-ColorOutput "❌ Azure Blob 上传失败 (退出码: $LASTEXITCODE)" "error"
            return $false
        }
    }
    catch {
        Write-ColorOutput "❌ 执行 Azure Blob 上传时出错: $($_.Exception.Message)" "error"
        return $false
    }
}

function Invoke-AzureBlobPublishSeparated {
    <#
    .SYNOPSIS
    Invokes the complete Azure Blob publish workflow in separated mode.

    .PARAMETER BuildScriptPath
    The path to the build script (e.g., "./build.sh").

    .PARAMETER AzureBlobSasUrl
    The Azure Blob SAS URL for authentication.

    .PARAMETER IndexOutputPath
    Optional path for the generated/uploaded index.json file.

    .PARAMETER SkipGeneration
    Skip the index generation step (assumes index already exists).

    .PARAMETER SkipUpload
    Skip the upload step (only generate index).

    .PARAMETER AdditionalArgs
    Additional arguments to pass to the build script.

    .RETURNS
    True if all steps succeeded, false otherwise.
    #>
    param(
        [string]$BuildScriptPath = "./build.sh",
        [string]$AzureBlobSasUrl = "",
        [string]$IndexOutputPath = "",
        [switch]$SkipGeneration = $false,
        [switch]$SkipUpload = $false,
        [string[]]$AdditionalArgs = @()
    )

    Write-ColorOutput "=== Azure Blob 分离模式发布 ===" "info"

    $result = $true

    # Step 1: Generate Index (unless skipped)
    if (-not $SkipGeneration) {
        $genResult = Invoke-AzureIndexGeneration -BuildScriptPath $BuildScriptPath `
            -AzureBlobSasUrl $AzureBlobSasUrl `
            -IndexOutputPath $IndexOutputPath `
            -AdditionalArgs $AdditionalArgs

        if (-not $genResult) {
            Write-ColorOutput "❌ Index 生成失败，终止流程" "error"
            return $false
        }
    }
    else {
        Write-ColorOutput "⏭️ 跳过 Index 生成步骤" "warning"
    }

    # Step 2: Upload Index (unless skipped)
    if (-not $SkipUpload) {
        $uploadResult = Invoke-AzureBlobPublish -BuildScriptPath $BuildScriptPath `
            -AzureBlobSasUrl $AzureBlobSasUrl `
            -LocalIndexPath $IndexOutputPath `
            -AdditionalArgs $AdditionalArgs

        if (-not $uploadResult) {
            Write-ColorOutput "❌ Index 上传失败" "error"
            $result = $false
        }
    }
    else {
        Write-ColorOutput "⏭️ 跳过 Index 上传步骤" "warning"
    }

    if ($result) {
        Write-ColorOutput "✅ Azure Blob 分离模式发布完成" "ok"
    }

    return $result
}

# Export functions
Export-ModuleMember -Function @(
    'Get-DependencyStatus',
    'Test-DependencyVersion',
    'Format-JsonOutput',
    'Write-ColorOutput',
    'Get-ScriptDirectory',
    'Import-DependenciesEnv',
    'New-Timestamp',
    'Invoke-AzureIndexGeneration',
    'Invoke-AzureBlobPublish',
    'Invoke-AzureBlobPublishSeparated'
)
