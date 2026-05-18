#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { detectRuntimePlatform, resolvePinnedRuntimeTarget } from './embedded-runtime-config.js';

const runtimePlatform = process.env.HAGICODE_EMBEDDED_DOTNET_PLATFORM || detectRuntimePlatform();
const prepareStartedAt = Date.now();

if (
  !runtimePlatform.startsWith('win-')
  && !runtimePlatform.startsWith('linux-')
  && !runtimePlatform.startsWith('osx-')
) {
  console.log(`[embedded-runtime] Skipping private runtime staging for unsupported platform ${runtimePlatform}`);
  process.exit(0);
}

const runtimeTarget = resolvePinnedRuntimeTarget(runtimePlatform);
console.log(
  `[embedded-runtime] Preparing pinned ASP.NET runtime ${runtimeTarget.aspNetCoreVersion} for ${runtimePlatform}...`,
);

const result = spawnSync(process.execPath, [path.join('scripts', 'prepare-embedded-runtime.js')], {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    HAGICODE_EMBEDDED_DOTNET_PLATFORM: runtimePlatform,
  },
});

if (result.error) {
  console.error('[embedded-runtime] Failed to prepare private runtime:', result.error);
  process.exit(1);
}

console.log(
  `[embedded-runtime] Preparation finished in ${Date.now() - prepareStartedAt}ms with exit code ${result.status ?? 0}`,
);

process.exit(result.status ?? 0);
