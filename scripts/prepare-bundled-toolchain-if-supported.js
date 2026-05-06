#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  detectNodeRuntimePlatform,
  readPinnedNodeRuntimeConfig,
  resolvePinnedNodeRuntimeTarget,
} from './embedded-node-runtime-config.js';
import {
  readToolchainManifest,
  validateToolchainPayload,
} from './bundled-toolchain-contract.js';
import { resolveStagedDesktopRuntimeComponentRoot } from './desktop-runtime-layout.js';

const runtimePlatform = process.env.HAGICODE_EMBEDDED_NODE_PLATFORM || detectNodeRuntimePlatform();
const toolchainRoot = resolveStagedDesktopRuntimeComponentRoot('node', { cwd: process.cwd() });
const forceRestage = process.env.HAGICODE_FORCE_BUNDLED_TOOLCHAIN_RESTAGE === '1';

function canReuseExistingToolchain() {
  if (!fs.existsSync(toolchainRoot)) {
    return { reusable: false, reason: 'toolchain root is missing' };
  }

  const runtimeConfig = readPinnedNodeRuntimeConfig();
  const manifest = readToolchainManifest(toolchainRoot);
  if (!manifest) {
    return { reusable: false, reason: 'toolchain manifest is missing' };
  }

  const payloadErrors = validateToolchainPayload(toolchainRoot, { platform: runtimePlatform });
  if (payloadErrors.length > 0) {
    return { reusable: false, reason: payloadErrors.join('; ') };
  }

  if (manifest.owner !== 'hagicode-desktop') {
    return { reusable: false, reason: `toolchain owner mismatch: ${manifest.owner || 'missing'}` };
  }
  if (manifest.source !== 'bundled-desktop') {
    return { reusable: false, reason: `toolchain source mismatch: ${manifest.source || 'missing'}` };
  }
  if (manifest.platform !== runtimePlatform) {
    return { reusable: false, reason: `toolchain platform mismatch: ${manifest.platform || 'missing'}` };
  }
  if (manifest.node?.version !== runtimeConfig.releaseVersion) {
    return {
      reusable: false,
      reason: `toolchain Node version mismatch: expected ${runtimeConfig.releaseVersion}, found ${manifest.node?.version || 'missing'}`,
    };
  }
  if (manifest.defaultEnabledByConsumer?.desktop !== runtimeConfig.defaultEnabledByConsumer?.desktop) {
    return { reusable: false, reason: 'toolchain desktop activation default changed' };
  }
  if (manifest.defaultEnabledByConsumer?.['steam-packer'] !== runtimeConfig.defaultEnabledByConsumer?.['steam-packer']) {
    return { reusable: false, reason: 'toolchain steam-packer activation default changed' };
  }

  return { reusable: true, reason: null };
}

try {
  resolvePinnedNodeRuntimeTarget(runtimePlatform);
} catch (error) {
  console.log(`[bundled-toolchain] Skipping Node toolchain staging for unsupported platform ${runtimePlatform}: ${error.message}`);
  process.exit(0);
}

if (forceRestage) {
  console.log('[bundled-toolchain] Forced restage requested via HAGICODE_FORCE_BUNDLED_TOOLCHAIN_RESTAGE=1');
} else {
  const reuseDecision = canReuseExistingToolchain();
  if (reuseDecision.reusable) {
    console.log(`[bundled-toolchain] Reusing existing staged Node toolchain at ${toolchainRoot}`);
    process.exit(0);
  }

  console.log(`[bundled-toolchain] Existing staged toolchain cannot be reused: ${reuseDecision.reason}`);
}

const result = spawnSync(process.execPath, [path.join('scripts', 'prepare-bundled-toolchain.js')], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    HAGICODE_EMBEDDED_NODE_PLATFORM: runtimePlatform,
  },
});

if (result.error) {
  console.error('[bundled-toolchain] Failed to prepare bundled toolchain:', result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
