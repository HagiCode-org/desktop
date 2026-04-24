#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { detectNodeRuntimePlatform, resolvePinnedNodeRuntimeTarget } from './embedded-node-runtime-config.js';

const runtimePlatform = process.env.HAGICODE_EMBEDDED_NODE_PLATFORM || detectNodeRuntimePlatform();

try {
  resolvePinnedNodeRuntimeTarget(runtimePlatform);
} catch (error) {
  console.log(`[bundled-toolchain] Skipping Node toolchain staging for unsupported platform ${runtimePlatform}: ${error.message}`);
  process.exit(0);
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
