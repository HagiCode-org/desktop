#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'fs';
import path from 'path';
import {
  detectOmniRouteRuntimePlatform,
  readOmniRouteRuntimeConfig,
  resolveConfiguredOmniRouteReleaseUrls,
  resolveOmniRouteArtifactsDir,
  resolveRequestedOmniRouteRuntimeVersion,
  validateOmniRouteRuntimePayload,
} from './omniroute-runtime-contract.js';

const config = readOmniRouteRuntimeConfig();
const platformKey = process.env.HAGICODE_OMNIROUTE_PLATFORM || detectOmniRouteRuntimePlatform();
const runtimeRoot = path.join(process.cwd(), 'resources', 'omniroute', 'current');
const forceRestage = process.env.HAGICODE_FORCE_OMNIROUTE_RUNTIME_RESTAGE === '1';

function hasConfiguredSource() {
  if (process.env.HAGICODE_OMNIROUTE_ARCHIVE_URL?.trim()) {
    return true;
  }
  if (process.env.HAGICODE_OMNIROUTE_RUNTIME_INDEX_URL?.trim() || config.source?.indexUrl?.trim()) {
    return true;
  }
  if (resolveConfiguredOmniRouteReleaseUrls(platformKey, config).length > 0) {
    return true;
  }
  const artifactsDir = resolveOmniRouteArtifactsDir(config);
  return Boolean(artifactsDir && fs.existsSync(artifactsDir));
}

function canReuseExistingRuntime() {
  if (!fs.existsSync(runtimeRoot)) {
    return { reusable: false, reason: 'runtime root is missing' };
  }

  const validation = validateOmniRouteRuntimePayload(runtimeRoot, { platformKey, config });
  const errors = [...validation.missingEntries, ...validation.diagnostics];
  if (errors.length > 0) {
    return { reusable: false, reason: errors.join('; ') };
  }

  const requestedVersion = resolveRequestedOmniRouteRuntimeVersion(platformKey, config);
  if (requestedVersion && validation.metadata?.version !== requestedVersion) {
    return {
      reusable: false,
      reason: `runtime version mismatch: expected ${requestedVersion}, found ${validation.metadata?.version || 'missing'}`,
    };
  }

  return { reusable: true, reason: null };
}

if (forceRestage) {
  console.log('[omniroute-runtime] Forced restage requested via HAGICODE_FORCE_OMNIROUTE_RUNTIME_RESTAGE=1');
} else {
  const reuseDecision = canReuseExistingRuntime();
  if (reuseDecision.reusable) {
    console.log(`[omniroute-runtime] Reusing existing staged vendored runtime at ${runtimeRoot}`);
    process.exit(0);
  }
  console.log(`[omniroute-runtime] Existing staged runtime cannot be reused: ${reuseDecision.reason}`);
}

if (!hasConfiguredSource()) {
  console.log('[omniroute-runtime] Skipping vendored runtime staging because no artifact source is configured');
  process.exit(0);
}

const result = spawnSync(process.execPath, [path.join('scripts', 'prepare-vendored-omniroute-runtime.js')], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    HAGICODE_OMNIROUTE_PLATFORM: platformKey,
  },
});

if (result.error) {
  console.error('[omniroute-runtime] Failed to prepare vendored runtime:', result.error);
  process.exit(1);
}

if ((result.status ?? 0) !== 0) {
  process.exit(result.status ?? 1);
}

const verifyResult = spawnSync(process.execPath, [path.join('scripts', 'verify-vendored-omniroute-runtime.js')], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    HAGICODE_OMNIROUTE_PLATFORM: platformKey,
  },
});

if (verifyResult.error) {
  console.error('[omniroute-runtime] Failed to verify vendored runtime:', verifyResult.error);
  process.exit(1);
}

process.exit(verifyResult.status ?? 0);
