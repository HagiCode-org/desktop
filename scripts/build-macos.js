#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const archAliases = new Map([
  ['x64', 'x64'],
  ['amd64', 'x64'],
  ['intel', 'x64'],
  ['arm64', 'arm64'],
  ['aarch64', 'arm64'],
  ['apple-silicon', 'arm64'],
]);

function normalizeArch(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return archAliases.get(normalized) || null;
}

function resolveDefaultArch() {
  const detected = normalizeArch(process.arch);
  if (!detected) {
    throw new Error(`Unsupported macOS build host architecture: ${process.arch}`);
  }
  return detected;
}

function resolveBuildArchs() {
  const raw = process.env.HAGICODE_MAC_BUILD_ARCHS?.trim();
  if (!raw) {
    return [resolveDefaultArch()];
  }

  const archs = raw
    .split(/[\s,]+/)
    .map(normalizeArch)
    .filter(Boolean);

  return [...new Set(archs)];
}

function runNpmScript(scriptName) {
  console.log(`[mac-build] Running npm run ${scriptName}`);
  const result = spawnSync('npm', ['run', scriptName], {
    cwd: process.cwd(),
    env: process.env,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const archs = resolveBuildArchs();
if (archs.length === 0) {
  throw new Error('No valid macOS build architectures were requested. Use HAGICODE_MAC_BUILD_ARCHS=x64,arm64.');
}

console.log(`[mac-build] Target architectures: ${archs.join(', ')}`);
for (const arch of archs) {
  runNpmScript(`build:mac:${arch}`);
}
