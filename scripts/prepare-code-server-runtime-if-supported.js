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

const config = readCodeServerRuntimeConfig();
const platformKey = process.env.HAGICODE_CODE_SERVER_PLATFORM || detectCodeServerRuntimePlatform();
const runtimeRoot = path.join(process.cwd(), 'resources', 'code-server', 'current');
const forceRestage = process.env.HAGICODE_FORCE_CODE_SERVER_RUNTIME_RESTAGE === '1';

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
    return { reusable: false, reason: 'runtime root is missing' };
  }

  const validation = validateCodeServerRuntimePayload(runtimeRoot, { platformKey, config });
  const errors = [...validation.missingEntries, ...validation.diagnostics];
  if (errors.length > 0) {
    return { reusable: false, reason: errors.join('; ') };
  }

  const requestedVersion = resolveRequestedCodeServerRuntimeVersion(platformKey, config);
  if (requestedVersion && validation.metadata?.version !== requestedVersion) {
    return {
      reusable: false,
      reason: `runtime version mismatch: expected ${requestedVersion}, found ${validation.metadata?.version || 'missing'}`,
    };
  }

  return { reusable: true, reason: null };
}

if (forceRestage) {
  console.log('[code-server-runtime] Forced restage requested via HAGICODE_FORCE_CODE_SERVER_RUNTIME_RESTAGE=1');
} else {
  const reuseDecision = canReuseExistingRuntime();
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
  },
});

if (result.error) {
  console.error('[code-server-runtime] Failed to prepare vendored runtime:', result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
