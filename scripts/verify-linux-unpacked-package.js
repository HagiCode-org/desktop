#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import {
  EMBEDDED_RUNTIME_METADATA_FILE,
  detectRuntimePlatform,
  ensureOfficialMicrosoftDownloadUrl,
  getDotnetExecutableName,
  readPinnedRuntimeConfig,
  resolvePinnedRuntimeTarget,
} from './embedded-runtime-config.js';
import { detectNodeRuntimePlatform } from './embedded-node-runtime-config.js';
import {
  readToolchainManifest,
  validateToolchainManifest,
  validateToolchainPayload,
} from './bundled-toolchain-contract.js';
import {
  detectCodeServerRuntimePlatform,
  readCodeServerRuntimeConfig,
  validateCodeServerRuntimePayload,
} from './code-server-runtime-contract.js';

const args = process.argv.slice(2);
const runtimePlatform = process.env.HAGICODE_EMBEDDED_DOTNET_PLATFORM || detectRuntimePlatform();
const nodeRuntimePlatform = process.env.HAGICODE_EMBEDDED_NODE_PLATFORM || detectNodeRuntimePlatform();
const codeServerPlatform = process.env.HAGICODE_CODE_SERVER_PLATFORM || detectCodeServerRuntimePlatform();
const runtimeConfig = readPinnedRuntimeConfig();
const runtimeTarget = resolvePinnedRuntimeTarget(runtimePlatform, runtimeConfig);
const codeServerConfig = readCodeServerRuntimeConfig();

function parseArgs() {
  let unpackedRoot = path.join(process.cwd(), 'pkg', 'linux-unpacked');

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--root') {
      const rootPath = args[index + 1];
      if (!rootPath) {
        throw new Error('--root requires a path value');
      }
      unpackedRoot = path.resolve(process.cwd(), rootPath);
      index += 1;
      continue;
    }

    if (arg === '--help') {
      console.log('Usage: node scripts/verify-linux-unpacked-package.js [--root <path>]');
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return unpackedRoot;
}

function ensureLinuxPlatform(platformKey, label) {
  if (!platformKey.startsWith('linux-')) {
    throw new Error(`${label} must resolve to a linux-* platform for linux-unpacked verification. Received: ${platformKey}`);
  }
}

function isExecutable(targetPath) {
  try {
    fs.accessSync(targetPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
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

function inspectDotnetRuntimeVersions(runtimeRoot) {
  return {
    aspNetCoreVersion: pickHighestVersion(listVersionDirectories(path.join(runtimeRoot, 'shared', 'Microsoft.AspNetCore.App'))),
    netCoreVersion: pickHighestVersion(listVersionDirectories(path.join(runtimeRoot, 'shared', 'Microsoft.NETCore.App'))),
    hostFxrVersion: pickHighestVersion(listVersionDirectories(path.join(runtimeRoot, 'host', 'fxr'))),
  };
}

function validateDotnetRuntimePayload(runtimeRoot) {
  const errors = [];
  const dotnetExecutableName = getDotnetExecutableName(runtimePlatform);
  const dotnetPath = path.join(runtimeRoot, dotnetExecutableName);

  if (!fs.existsSync(dotnetPath)) {
    errors.push(`missing ${dotnetExecutableName}`);
  } else if (!isExecutable(dotnetPath)) {
    errors.push(`${dotnetExecutableName} is not executable`);
  }

  if (listVersionDirectories(path.join(runtimeRoot, 'host', 'fxr')).length === 0) {
    errors.push('missing host/fxr');
  }
  if (listVersionDirectories(path.join(runtimeRoot, 'shared', 'Microsoft.AspNetCore.App')).length === 0) {
    errors.push('missing shared/Microsoft.AspNetCore.App');
  }
  if (listVersionDirectories(path.join(runtimeRoot, 'shared', 'Microsoft.NETCore.App')).length === 0) {
    errors.push('missing shared/Microsoft.NETCore.App');
  }

  const metadataPath = path.join(runtimeRoot, EMBEDDED_RUNTIME_METADATA_FILE);
  if (!fs.existsSync(metadataPath)) {
    errors.push(`missing ${EMBEDDED_RUNTIME_METADATA_FILE}`);
    return errors;
  }

  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  const versions = inspectDotnetRuntimeVersions(runtimeRoot);
  ensureOfficialMicrosoftDownloadUrl(metadata.downloadUrl, runtimeConfig.source?.allowedDownloadHosts || []);

  if (metadata.provider !== runtimeConfig.source.provider) {
    errors.push(`provider expected ${runtimeConfig.source.provider} but found ${metadata.provider || 'missing'}`);
  }
  if (metadata.platform !== runtimePlatform) {
    errors.push(`platform expected ${runtimePlatform} but found ${metadata.platform || 'missing'}`);
  }
  if (metadata.releaseVersion !== runtimeConfig.releaseVersion) {
    errors.push(`releaseVersion expected ${runtimeConfig.releaseVersion} but found ${metadata.releaseVersion || 'missing'}`);
  }
  if (metadata.downloadUrl !== runtimeTarget.downloadUrl) {
    errors.push('downloadUrl does not match the pinned runtime manifest');
  }
  if (metadata.aspNetCoreVersion !== runtimeTarget.aspNetCoreVersion) {
    errors.push(`metadata ASP.NET Core version expected ${runtimeTarget.aspNetCoreVersion} but found ${metadata.aspNetCoreVersion || 'missing'}`);
  }
  if (metadata.netCoreVersion !== runtimeTarget.netCoreVersion) {
    errors.push(`metadata Microsoft.NETCore.App version expected ${runtimeTarget.netCoreVersion} but found ${metadata.netCoreVersion || 'missing'}`);
  }
  if (metadata.hostFxrVersion !== runtimeTarget.hostFxrVersion) {
    errors.push(`metadata host/fxr version expected ${runtimeTarget.hostFxrVersion} but found ${metadata.hostFxrVersion || 'missing'}`);
  }
  if (versions.aspNetCoreVersion !== runtimeTarget.aspNetCoreVersion) {
    errors.push(`runtime ASP.NET Core version expected ${runtimeTarget.aspNetCoreVersion} but found ${versions.aspNetCoreVersion || 'missing'}`);
  }
  if (versions.netCoreVersion !== runtimeTarget.netCoreVersion) {
    errors.push(`runtime Microsoft.NETCore.App version expected ${runtimeTarget.netCoreVersion} but found ${versions.netCoreVersion || 'missing'}`);
  }
  if (versions.hostFxrVersion !== runtimeTarget.hostFxrVersion) {
    errors.push(`runtime host/fxr version expected ${runtimeTarget.hostFxrVersion} but found ${versions.hostFxrVersion || 'missing'}`);
  }

  return errors;
}

function validateNodeToolchain(toolchainRoot) {
  const payloadErrors = validateToolchainPayload(toolchainRoot, { platform: nodeRuntimePlatform });
  const manifest = readToolchainManifest(toolchainRoot);
  const manifestPlatform = manifest?.platform || nodeRuntimePlatform;
  const manifestErrors = validateToolchainManifest(toolchainRoot, { platform: manifestPlatform });
  return [...payloadErrors, ...manifestErrors];
}

function validateCodeServerRuntime(runtimeRoot) {
  const result = validateCodeServerRuntimePayload(runtimeRoot, {
    platformKey: codeServerPlatform,
    config: codeServerConfig,
  });
  return [...result.missingEntries, ...result.diagnostics];
}


function main() {
  ensureLinuxPlatform(runtimePlatform, 'Embedded dotnet runtime platform');
  ensureLinuxPlatform(nodeRuntimePlatform, 'Bundled Node runtime platform');
  ensureLinuxPlatform(codeServerPlatform, 'Vendored code-server platform');

  const unpackedRoot = parseArgs();
  const runtimeRoot = path.join(unpackedRoot, 'resources', 'extra', 'runtime');
  if (!fs.existsSync(runtimeRoot)) {
    throw new Error(`linux-unpacked runtime root does not exist: ${runtimeRoot}`);
  }

  const validations = [
    {
      label: 'bundled Node runtime',
      targetRoot: path.join(runtimeRoot, 'components', 'node', 'runtime'),
      validate: validateNodeToolchain,
    },
    {
      label: 'embedded dotnet runtime',
      targetRoot: path.join(runtimeRoot, 'components', 'dotnet', 'runtime', runtimePlatform, 'current'),
      validate: validateDotnetRuntimePayload,
    },
    {
      label: 'vendored code-server runtime',
      targetRoot: path.join(runtimeRoot, 'components', 'bundled', 'code-server'),
      validate: validateCodeServerRuntime,
    },
  ];

  const failures = [];

  for (const validation of validations) {
    if (!fs.existsSync(validation.targetRoot)) {
      failures.push(`${validation.label}: missing directory ${validation.targetRoot}`);
      continue;
    }

    const errors = validation.validate(validation.targetRoot);
    if (errors.length > 0) {
      failures.push(`${validation.label}: ${errors.join('; ')}`);
      continue;
    }

    console.log(`[linux-unpacked-verify] ${validation.label} OK -> ${validation.targetRoot}`);
  }

  if (failures.length > 0) {
    throw new Error(`linux-unpacked package verification failed:\n- ${failures.join('\n- ')}`);
  }

  console.log(`[linux-unpacked-verify] Verified packaged runtime payloads under ${unpackedRoot}`);
}

main();
