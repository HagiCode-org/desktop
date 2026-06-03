param(
  [string]$PackageSpec = '@fission-ai/openspec@1.3.1',
  [string]$NodeExe = 'node',
  [string]$NpmCli = '',
  [string]$WorkingRoot = ''
)

$ErrorActionPreference = 'Stop'

function New-TestRoot {
  param([string]$PreferredRoot)

  if ($PreferredRoot) {
    $root = [System.IO.Path]::GetFullPath($PreferredRoot)
    New-Item -ItemType Directory -Force -Path $root | Out-Null
    return $root
  }

  $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $root = Join-Path ([System.IO.Path]::GetTempPath()) "hagicode-openspec-install-test-$timestamp"
  New-Item -ItemType Directory -Force -Path $root | Out-Null
  return $root
}

function Resolve-NodeCommand {
  param(
    [string]$NodeExe,
    [string]$NpmCli
  )

  $resolvedNodeExe = if ([System.IO.Path]::IsPathRooted($NodeExe)) {
    $NodeExe
  } else {
    (Get-Command $NodeExe -ErrorAction Stop).Source
  }

  if ($NpmCli) {
    $resolvedNpmCli = [System.IO.Path]::GetFullPath($NpmCli)
  } else {
    $nodeRoot = Split-Path -Parent $resolvedNodeExe
    $candidate = Join-Path $nodeRoot 'node_modules\npm\bin\npm-cli.js'
    if (-not (Test-Path -LiteralPath $candidate)) {
      throw "Unable to infer npm-cli.js from Node path: $resolvedNodeExe. Pass -NpmCli explicitly."
    }

    $resolvedNpmCli = $candidate
  }

  if (-not (Test-Path -LiteralPath $resolvedNodeExe)) {
    throw "Node executable not found: $resolvedNodeExe"
  }

  if (-not (Test-Path -LiteralPath $resolvedNpmCli)) {
    throw "npm CLI script not found: $resolvedNpmCli"
  }

  return @{
    NodeExe = $resolvedNodeExe
    NpmCli = $resolvedNpmCli
  }
}

function Invoke-NpmInstallCase {
  param(
    [hashtable]$Tooling,
    [string]$CaseName,
    [string]$PackageSpec,
    [string]$CaseRoot,
    [bool]$UseScriptShellOverride
  )

  $prefix = Join-Path $CaseRoot 'prefix'
  $cache = Join-Path $CaseRoot 'cache'
  $tmp = Join-Path $CaseRoot 'tmp'
  $home = Join-Path $CaseRoot 'home'
  $logPath = Join-Path $CaseRoot 'install.log'

  foreach ($directory in @($prefix, $cache, $tmp, $home)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
  }

  $envMap = @{
    npm_config_prefix = $prefix
    NPM_CONFIG_PREFIX = $prefix
    npm_config_cache = $cache
    NPM_CONFIG_CACHE = $cache
    npm_config_tmp = $tmp
    NPM_CONFIG_TMP = $tmp
    TMP = $tmp
    TEMP = $tmp
    USERPROFILE = $home
    HOME = $home
  }

  if ($UseScriptShellOverride) {
    $envMap['npm_config_script_shell'] = 'powershell.exe'
    $envMap['NPM_CONFIG_SCRIPT_SHELL'] = 'powershell.exe'
  }

  $args = @(
    $Tooling.NpmCli,
    'install',
    '--global',
    '--prefix', $prefix,
    '--cache', $cache,
    $PackageSpec
  )

  if ($UseScriptShellOverride) {
    $args = @(
      $Tooling.NpmCli,
      'install',
      '--script-shell=powershell.exe',
      '--global',
      '--prefix', $prefix,
      '--cache', $cache,
      $PackageSpec
    )
  }

  $commandLine = @($Tooling.NodeExe) + $args

  $originalValues = @{}
  foreach ($entry in $envMap.GetEnumerator()) {
    $originalValues[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key)
    [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value)
  }

  try {
    $output = & $Tooling.NodeExe @args 2>&1 | Tee-Object -FilePath $logPath
    $exitCode = $LASTEXITCODE
  } finally {
    foreach ($entry in $originalValues.GetEnumerator()) {
      [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value)
    }
  }

  $openspecCmd = Join-Path $prefix 'openspec.cmd'
  $openspecBin = Join-Path $prefix 'node_modules\@fission-ai\openspec\bin\openspec.js'

  return [pscustomobject]@{
    CaseName = $CaseName
    ExitCode = $exitCode
    Prefix = $prefix
    Cache = $cache
    LogPath = $logPath
    UsedScriptShellOverride = $UseScriptShellOverride
    CommandLine = ($commandLine -join ' ')
    OpenspecCmdExists = Test-Path -LiteralPath $openspecCmd
    OpenspecBinExists = Test-Path -LiteralPath $openspecBin
    OutputPreview = ($output | Select-Object -Last 20) -join [Environment]::NewLine
  }
}

$testRoot = New-TestRoot -PreferredRoot $WorkingRoot
$tooling = Resolve-NodeCommand -NodeExe $NodeExe -NpmCli $NpmCli

$results = @()
$results += Invoke-NpmInstallCase -Tooling $tooling -CaseName 'baseline' -PackageSpec $PackageSpec -CaseRoot (Join-Path $testRoot 'baseline') -UseScriptShellOverride:$false
$results += Invoke-NpmInstallCase -Tooling $tooling -CaseName 'with-script-shell' -PackageSpec $PackageSpec -CaseRoot (Join-Path $testRoot 'with-script-shell') -UseScriptShellOverride:$true

$summaryPath = Join-Path $testRoot 'summary.json'
$results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $summaryPath -Encoding UTF8

Write-Host ''
Write-Host 'OpenSpec global install test summary'
Write-Host "Working root: $testRoot"
Write-Host "Node exe:     $($tooling.NodeExe)"
Write-Host "npm cli:      $($tooling.NpmCli)"
Write-Host "Summary json: $summaryPath"
Write-Host ''

foreach ($result in $results) {
  Write-Host "[$($result.CaseName)] exit=$($result.ExitCode) override=$($result.UsedScriptShellOverride) cmd=$($result.OpenspecCmdExists) bin=$($result.OpenspecBinExists)"
  Write-Host "log: $($result.LogPath)"
  Write-Host ''
}
