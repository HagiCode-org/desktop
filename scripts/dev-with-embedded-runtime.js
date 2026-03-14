import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { detectRuntimePlatform, resolvePinnedRuntimeTarget } from './embedded-runtime-config.js';

const cwd = process.cwd();
const runtimePlatform = process.env.HAGICODE_EMBEDDED_DOTNET_PLATFORM || detectRuntimePlatform();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

resolvePinnedRuntimeTarget(runtimePlatform);

if (!runtimePlatform.startsWith('win-') && !runtimePlatform.startsWith('linux-')) {
  console.error(`[dev:embedded-runtime] Private runtime dev flow is only configured for Windows/Linux. Current target: ${runtimePlatform}`);
  process.exit(1);
}

const runtimeRoot = path.join(cwd, 'build', 'embedded-runtime', 'current', 'dotnet', runtimePlatform);

console.log(`[dev:embedded-runtime] Preparing embedded runtime for ${runtimePlatform}...`);
const prepare = spawnSync(process.execPath, [path.join('scripts', 'prepare-embedded-runtime.js')], {
  cwd,
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    HAGICODE_EMBEDDED_DOTNET_PLATFORM: runtimePlatform,
  },
});

if (prepare.error) {
  console.error('[dev:embedded-runtime] Failed to prepare embedded runtime:', prepare.error);
  process.exit(1);
}

if (prepare.status !== 0) {
  process.exit(prepare.status ?? 1);
}

console.log(`[dev:embedded-runtime] Using pinned runtime root (HAGICODE_EMBEDDED_DOTNET_ROOT): ${runtimeRoot}`);

const child = spawn(npmCommand, ['run', 'dev'], {
  cwd,
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    HAGICODE_EMBEDDED_DOTNET_PLATFORM: runtimePlatform,
    HAGICODE_EMBEDDED_DOTNET_ROOT: runtimeRoot,
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('[dev:embedded-runtime] Failed to start dev server:', error);
  process.exit(1);
});
