[CmdletBinding()]
Param(
    [Parameter(Position=0,Mandatory=$false,ValueFromRemainingArguments=$true)]
    [string[]]$BuildArguments
)

Write-Output "PowerShell $($PSVersionTable.PSEdition) version $($PSVersionTable.PSVersion)"

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"
$ConfirmPreference = "None"
trap { Write-Error $_ -ErrorAction Continue; exit 1 }

function Resolve-Python {
    if ($env:PYTHON_EXE -and (Get-Command $env:PYTHON_EXE -ErrorAction SilentlyContinue)) {
        return $env:PYTHON_EXE
    }

    if (Get-Command "python" -ErrorAction SilentlyContinue) {
        return "python"
    }

    if (Get-Command "py" -ErrorAction SilentlyContinue) {
        return "py"
    }

    throw "python executable not found. Install python or set PYTHON_EXE."
}

$PSScriptRoot = Split-Path $MyInvocation.MyCommand.Path -Parent
$env:PYTHONPATH = if ($env:PYTHONPATH) { "$PSScriptRoot;$($env:PYTHONPATH)" } else { $PSScriptRoot }
$pythonCmd = Resolve-Python

& $pythonCmd -m pybuild.entry @BuildArguments
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
