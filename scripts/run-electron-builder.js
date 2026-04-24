#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const require = createRequire(import.meta.url);
const electronBuilderCliPath = require.resolve('electron-builder/out/cli/cli.js');

function run(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    stdio: options.stdio || 'inherit',
    encoding: options.encoding || 'utf8',
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}

function raiseMacOpenFileLimit() {
  if (process.platform !== 'darwin') {
    return;
  }

  const desiredLimit = process.env.HAGICODE_MACOS_NOFILE_LIMIT || '65536';
  process.env.HAGICODE_MACOS_NOFILE_LIMIT = desiredLimit;
  const result = run('/bin/bash', ['-lc', 'ulimit -n'], { stdio: 'pipe' });
  const effectiveLimit = String(result.stdout || '').trim();
  if (effectiveLimit) {
    process.env.HAGICODE_MACOS_EFFECTIVE_NOFILE_LIMIT = effectiveLimit;
    console.log(`[electron-builder] requested macOS open file limit: ${desiredLimit}; launcher limit: ${effectiveLimit}`);
  }
}

raiseMacOpenFileLimit();

const command = process.platform === 'darwin' ? '/bin/bash' : process.execPath;
const commandArgs = process.platform === 'darwin'
  ? [
    '-lc',
    'ulimit -n "$HAGICODE_MACOS_NOFILE_LIMIT" 2>/dev/null || ulimit -n 16384 2>/dev/null || true; echo "[electron-builder] effective macOS open file limit: $(ulimit -n)"; exec "$@"',
    'electron-builder-runner',
    process.execPath,
    electronBuilderCliPath,
    ...args,
  ]
  : [electronBuilderCliPath, ...args];

const result = run(command, commandArgs);
process.exit(result.status ?? 0);
