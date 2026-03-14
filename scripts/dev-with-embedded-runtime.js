import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';

if (process.platform !== 'win32') {
  console.error('[dev:embedded-runtime] This helper currently supports Windows only.');
  process.exit(1);
}

const cwd = process.cwd();
const commandShell = process.env.ComSpec || 'cmd.exe';
const runtimeRoot = path.join(cwd, 'build', 'embedded-runtime', 'current', 'dotnet', 'win-x64');

console.log(`[dev:embedded-runtime] Preparing embedded runtime...`);
const prepare = spawnSync(process.execPath, [path.join('scripts', 'prepare-embedded-runtime.js')], {
  cwd,
  stdio: 'inherit',
  shell: false,
});

if (prepare.error) {
  console.error('[dev:embedded-runtime] Failed to prepare embedded runtime:', prepare.error);
  process.exit(1);
}

if (prepare.status !== 0) {
  process.exit(prepare.status ?? 1);
}

console.log(`[dev:embedded-runtime] Using bundled runtime root (HAGICODE_EMBEDDED_DOTNET_ROOT): ${runtimeRoot}`);

const child = spawn(commandShell, ['/d', '/s', '/c', 'npm run dev'], {
  cwd,
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
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
