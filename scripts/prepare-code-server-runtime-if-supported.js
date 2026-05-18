#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'fs';
import path from 'path';
import {
  detectCodeServerRuntimePlatform,
  readCodeServerRuntimeConfig,
  resolveConfiguredCodeServerReleaseUrls,
  resolveCodeServerArtifactsDir,
  resolveRequestedCodeServerRuntimeVersion,
  validateCodeServerRuntimePayload,
} from './code-server-runtime-contract.js';
import { resolveStagedDesktopRuntimeComponentRoot } from './desktop-runtime-layout.js';
import {
  resolveRuntimeManifestDataScopePath,
  resolveScriptUserDataPath,
} from './runtime-manifest-store.js';

const config = readCodeServerRuntimeConfig();
const platformKey = process.env.HAGICODE_CODE_SERVER_PLATFORM || detectCodeServerRuntimePlatform();
const runtimeRoot = resolveStagedDesktopRuntimeComponentRoot('code-server', { cwd: process.cwd() });
const forceRestage = process.env.HAGICODE_FORCE_CODE_SERVER_RUNTIME_RESTAGE === '1';
const desktopDataScopeRoot = resolveRuntimeManifestDataScopePath(resolveScriptUserDataPath(), process.env);
const expectedRuntimeDataHome = path.join(
  desktopDataScopeRoot,
  'runtimeData',
  'components',
  'services',
  'code-server',
);

function hasConfiguredSource() {
  if (process.env.HAGICODE_CODE_SERVER_ARCHIVE_URL?.trim()) {
    return true;
  }
  if (process.env.HAGICODE_CODE_SERVER_RUNTIME_INDEX_URL?.trim() || config.source?.indexUrl?.trim()) {
    return true;
  }
  if (resolveConfiguredCodeServerReleaseUrls(platformKey, config).length > 0) {
    return true;
  }
  const artifactsDir = resolveCodeServerArtifactsDir(config);
  return Boolean(artifactsDir && fs.existsSync(artifactsDir));
}

function canReuseExistingRuntime() {
  if (!fs.existsSync(runtimeRoot)) {
    return { reusable: false, reason: 'runtime root is missing', forceUpdate: true };
  }

  const validation = validateCodeServerRuntimePayload(runtimeRoot, { platformKey, config });
  const errors = [...validation.missingEntries, ...validation.diagnostics];
  if (errors.length > 0) {
    return { reusable: false, reason: errors.join('; '), forceUpdate: true };
  }

  const requestedVersion = resolveRequestedCodeServerRuntimeVersion(platformKey, config);
  if (requestedVersion && validation.metadata?.version !== requestedVersion) {
    return {
        reusable: false,
        reason: `runtime version mismatch: expected ${requestedVersion}, found ${validation.metadata?.version || 'missing'}`,
        forceUpdate: true,
      };
    }

  const actualRuntimeDataHome = readManagedRuntimeDataHome(validation.metadataPath);
  if (actualRuntimeDataHome && path.resolve(actualRuntimeDataHome) !== expectedRuntimeDataHome) {
    return {
      reusable: false,
      reason: `runtime data home mismatch: expected ${expectedRuntimeDataHome}, found ${actualRuntimeDataHome}`,
      forceUpdate: true,
    };
  }

  return { reusable: true, reason: null, forceUpdate: false };
}

function readManagedRuntimeDataHome(metadataPath) {
  if (!metadataPath?.endsWith('.hagicode-runtime.json') || !fs.existsSync(metadataPath)) {
    return null;
  }

  try {
    const marker = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    return typeof marker.runtimeDataHome === 'string' ? marker.runtimeDataHome : null;
  } catch {
    return null;
  }
}

let reuseDecision = { reusable: false, reason: null, forceUpdate: false };

if (forceRestage) {
  console.log('[code-server-runtime] Forced restage requested via HAGICODE_FORCE_CODE_SERVER_RUNTIME_RESTAGE=1');
} else {
  reuseDecision = canReuseExistingRuntime();
  if (reuseDecision.reusable) {
    console.log(`[code-server-runtime] Reusing existing staged vendored runtime at ${runtimeRoot}`);
    process.exit(0);
  }
  console.log(`[code-server-runtime] Existing staged runtime cannot be reused: ${reuseDecision.reason}`);
}

if (!hasConfiguredSource()) {
  console.log('[code-server-runtime] Skipping vendored runtime staging because no artifact source is configured');
  process.exit(0);
}

const result = spawnSync(process.execPath, [path.join('scripts', 'prepare-code-server-runtime.js')], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: false,
    env: {
      ...process.env,
      HAGICODE_CODE_SERVER_PLATFORM: platformKey,
      HAGICODE_FORCE_CODE_SERVER_RUNTIME_RESTAGE: reuseDecision.forceUpdate ? '1' : process.env.HAGICODE_FORCE_CODE_SERVER_RUNTIME_RESTAGE,
    },
  });

if (result.error) {
  console.error('[code-server-runtime] Failed to prepare vendored runtime:', result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
