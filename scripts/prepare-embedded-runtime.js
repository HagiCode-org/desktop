#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const runtimePlatform = process.env.HAGICODE_EMBEDDED_DOTNET_PLATFORM || detectPlatform();
const dotnetExecutableName = process.platform === 'win32' ? 'dotnet.exe' : 'dotnet';
const stageRoot = path.join(process.cwd(), 'build', 'embedded-runtime', 'current');
const stagedRuntimeRoot = path.join(stageRoot, 'dotnet', runtimePlatform);
const stagedSharedRoot = path.join(stagedRuntimeRoot, 'shared');

function detectPlatform() {
  if (process.platform === 'win32') return 'win-x64';
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'osx-arm64' : 'osx-x64';
  if (process.platform === 'linux') return process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  throw new Error(`Unsupported build platform: ${process.platform}/${process.arch}`);
}

function resolveSourceRoot() {
  const explicitSource = process.env.HAGICODE_EMBEDDED_DOTNET_SOURCE?.trim();
  const envDotnetRoot = process.env.DOTNET_ROOT?.trim();
  const guessedRoot = explicitSource || envDotnetRoot || detectLocalDotnetRoot();

  if (!guessedRoot) {
    throw new Error('Unable to resolve an embedded runtime source. Set HAGICODE_EMBEDDED_DOTNET_SOURCE to a dotnet runtime root.');
  }

  const resolvedRoot = path.resolve(guessedRoot);
  const platformScopedRoot = path.join(resolvedRoot, runtimePlatform);
  if (fs.existsSync(path.join(platformScopedRoot, dotnetExecutableName))) {
    return platformScopedRoot;
  }

  return resolvedRoot;
}

function detectLocalDotnetRoot() {
  try {
    const command = process.platform === 'win32' ? 'where' : 'which';
    const output = execFileSync(command, ['dotnet'], { encoding: 'utf8' }).trim();
    const firstLine = output.split(/\r?\n/)[0]?.trim();
    return firstLine ? path.dirname(firstLine) : null;
  } catch {
    return null;
  }
}

function listVersionDirectories(targetPath) {
  try {
    return fs.readdirSync(targetPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((entry) => /^\d+(?:\.\d+){1,3}$/.test(entry));
  } catch {
    return [];
  }
}

function compareVersions(left, right) {
  const leftParts = left.split('.').map((segment) => Number.parseInt(segment, 10));
  const rightParts = right.split('.').map((segment) => Number.parseInt(segment, 10));

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftValue = leftParts[index] || 0;
    const rightValue = rightParts[index] || 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }

  return 0;
}

function pickHighestVersion(versions) {
  return [...versions].sort((left, right) => compareVersions(right, left))[0];
}

function validateRuntimeLayout(runtimeRoot) {
  const missing = [];
  const dotnetPath = path.join(runtimeRoot, dotnetExecutableName);
  if (!fs.existsSync(dotnetPath)) {
    missing.push(dotnetExecutableName);
  }

  const hostFxrRoot = path.join(runtimeRoot, 'host', 'fxr');
  const fxrVersions = listVersionDirectories(hostFxrRoot);
  if (fxrVersions.length === 0) {
    missing.push('host/fxr');
  }

  const aspNetCoreRoot = path.join(runtimeRoot, 'shared', 'Microsoft.AspNetCore.App');
  const aspNetCoreVersions = listVersionDirectories(aspNetCoreRoot);
  if (aspNetCoreVersions.length === 0) {
    missing.push('shared/Microsoft.AspNetCore.App');
  }

  const netCoreRoot = path.join(runtimeRoot, 'shared', 'Microsoft.NETCore.App');
  const netCoreVersions = listVersionDirectories(netCoreRoot);
  if (netCoreVersions.length === 0) {
    missing.push('shared/Microsoft.NETCore.App');
  }

  if (missing.length > 0) {
    throw new Error(`Runtime payload is incomplete at ${runtimeRoot}. Missing: ${missing.join(', ')}`);
  }

  return {
    dotnetPath,
    aspNetCoreVersion: pickHighestVersion(aspNetCoreVersions),
    netCoreVersion: pickHighestVersion(netCoreVersions),
    hostFxrVersion: pickHighestVersion(fxrVersions),
  };
}

function copyVersionedDirectory(sourceBase, targetBase, version) {
  if (!version) {
    return;
  }

  fs.cpSync(path.join(sourceBase, version), path.join(targetBase, version), { recursive: true, force: true });
}

function stageRuntime() {
  const sourceRoot = resolveSourceRoot();
  const validation = validateRuntimeLayout(sourceRoot);

  fs.rmSync(stageRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(stagedRuntimeRoot, 'host'), { recursive: true });
  fs.mkdirSync(stagedSharedRoot, { recursive: true });

  fs.copyFileSync(path.join(sourceRoot, dotnetExecutableName), path.join(stagedRuntimeRoot, dotnetExecutableName));
  if (fs.existsSync(path.join(sourceRoot, 'LICENSE.txt'))) {
    fs.copyFileSync(path.join(sourceRoot, 'LICENSE.txt'), path.join(stagedRuntimeRoot, 'LICENSE.txt'));
  }
  if (fs.existsSync(path.join(sourceRoot, 'ThirdPartyNotices.txt'))) {
    fs.copyFileSync(path.join(sourceRoot, 'ThirdPartyNotices.txt'), path.join(stagedRuntimeRoot, 'ThirdPartyNotices.txt'));
  }

  fs.mkdirSync(path.join(stagedRuntimeRoot, 'host', 'fxr'), { recursive: true });
  fs.mkdirSync(path.join(stagedSharedRoot, 'Microsoft.NETCore.App'), { recursive: true });
  fs.mkdirSync(path.join(stagedSharedRoot, 'Microsoft.AspNetCore.App'), { recursive: true });

  copyVersionedDirectory(path.join(sourceRoot, 'host', 'fxr'), path.join(stagedRuntimeRoot, 'host', 'fxr'), validation.hostFxrVersion);
  copyVersionedDirectory(path.join(sourceRoot, 'shared', 'Microsoft.NETCore.App'), path.join(stagedSharedRoot, 'Microsoft.NETCore.App'), validation.netCoreVersion);
  copyVersionedDirectory(path.join(sourceRoot, 'shared', 'Microsoft.AspNetCore.App'), path.join(stagedSharedRoot, 'Microsoft.AspNetCore.App'), validation.aspNetCoreVersion);

  const metadata = {
    platform: runtimePlatform,
    sourceRoot,
    stagedRuntimeRoot,
    dotnetPath: path.join(stagedRuntimeRoot, dotnetExecutableName),
    aspNetCoreVersion: validation.aspNetCoreVersion,
    netCoreVersion: validation.netCoreVersion,
    hostFxrVersion: validation.hostFxrVersion,
    stagedAt: new Date().toISOString(),
  };

  fs.writeFileSync(
    path.join(stageRoot, '.runtime-stage.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
    'utf8',
  );

  console.log(`[embedded-runtime] Staged ${runtimePlatform} runtime from ${sourceRoot}`);
  console.log(`[embedded-runtime] ASP.NET Core ${validation.aspNetCoreVersion || 'unknown'} -> ${stagedRuntimeRoot}`);
}

try {
  stageRuntime();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[embedded-runtime] ${message}`);
  process.exit(1);
}
