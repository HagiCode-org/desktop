import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { detectRuntimePlatform, resolvePinnedRuntimeTarget } from './embedded-runtime-config.js';

const cwd = process.cwd();
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const ENV_FILES = ['.env', '.env.local', '.env.development', '.env.development.local'];
const PORTABLE_RUNTIME_REQUIRED_FILES = [
  path.join('lib', 'PCode.Web.dll'),
  path.join('lib', 'PCode.Web.runtimeconfig.json'),
  path.join('lib', 'PCode.Web.deps.json'),
];
const PORTABLE_RUNTIME_MANIFEST = 'manifest.json';
const stagedPortableRoot = path.join(cwd, 'build', 'portable-version-runtime', 'current');
const originalEnvKeys = new Set(Object.keys(process.env));

loadEnvFiles();

const runtimePlatform = process.env.HAGICODE_EMBEDDED_DOTNET_PLATFORM || detectRuntimePlatform();

resolvePinnedRuntimeTarget(runtimePlatform);

if (!runtimePlatform.startsWith('win-') && !runtimePlatform.startsWith('linux-')) {
  console.error(`[dev:portable-version] Private runtime dev flow is only configured for Windows/Linux. Current target: ${runtimePlatform}`);
  process.exit(1);
}

const embeddedRuntimeRoot = path.join(cwd, 'build', 'embedded-runtime', 'current', 'dotnet', runtimePlatform);
const defaultPortableCandidates = [
  path.resolve(cwd, '..', 'local_deployment', 'linux-x64'),
  path.resolve(cwd, '..', 'local_deployment', 'linux-x64-nort'),
  path.resolve(cwd, '..', 'local_publishment', '.local-publishment', 'linux-x64'),
  path.resolve(cwd, '..', 'local_publishment', '.local-publishment', 'linux-x64-nort'),
  path.resolve(cwd, '..', 'hagicode-core', 'Release', 'release-structured', 'linux-x64'),
  path.resolve(cwd, '..', 'hagicode-core', 'Release', 'release-structured', 'linux-x64-nort'),
  path.resolve(cwd, '..', 'hagibuild', 'Release', 'release-structured', 'linux-x64'),
  path.resolve(cwd, '..', 'hagibuild', 'Release', 'release-structured', 'linux-x64-nort'),
];

function loadEnvFiles() {
  for (const relativePath of ENV_FILES) {
    const envPath = path.join(cwd, relativePath);
    if (!fs.existsSync(envPath)) {
      continue;
    }

    const content = fs.readFileSync(envPath, 'utf-8');
    for (const rawLine of content.split(/\r?\n/u)) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith('#')) {
        continue;
      }

      const separatorIndex = line.indexOf('=');
      if (separatorIndex <= 0) {
        continue;
      }

      const rawKey = line.slice(0, separatorIndex).trim();
      const key = rawKey.startsWith('export ') ? rawKey.slice('export '.length).trim() : rawKey;
      if (!key || originalEnvKeys.has(key)) {
        continue;
      }

      let value = line.slice(separatorIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  }
}

function isRuntimeRootPresent(runtimeRoot) {
  try {
    return fs.statSync(runtimeRoot).isDirectory();
  } catch {
    return false;
  }
}

function hasPortablePayloadFiles(runtimeRoot) {
  return PORTABLE_RUNTIME_REQUIRED_FILES.every((relativePath) => fs.existsSync(path.join(runtimeRoot, relativePath)));
}

function hasPortableManifest(runtimeRoot) {
  return fs.existsSync(path.join(runtimeRoot, PORTABLE_RUNTIME_MANIFEST));
}

function buildPortableBridgeManifest(sourceRoot) {
  const sourceName = path.basename(sourceRoot);
  const packageVersion = process.env.npm_package_version || '0.0.0-dev';

  return {
    $schema: 'https://schemas.hagicode.com/package-manifest.v1.json',
    manifestVersion: '1.0',
    package: {
      name: `portable-dev-${sourceName}`,
      version: packageVersion,
      buildTimestamp: new Date(0).toISOString(),
      gitCommit: 'dev-portable-bridge',
      platform: runtimePlatform,
    },
    dependencies: {},
    filesReference: {
      path: '.',
      checksum: 'development-bridge',
      format: 'symlink-bridge',
      count: 0,
    },
    metadata: {
      description: 'Development bridge manifest for portable version mode.',
      author: 'hagicode-desktop/dev-with-portable-runtime',
      license: 'development-only',
      homepage: 'https://hagicode.com',
      documentation: 'https://hagicode.com/docs',
      repository: 'https://github.com/HagiCode-org/desktop',
    },
  };
}

function linkOrCopyEntry(sourcePath, targetPath, isDirectory) {
  try {
    fs.symlinkSync(sourcePath, targetPath, isDirectory && process.platform === 'win32' ? 'junction' : undefined);
    return;
  } catch {
    if (isDirectory) {
      fs.cpSync(sourcePath, targetPath, { recursive: true });
      return;
    }

    fs.copyFileSync(sourcePath, targetPath);
  }
}

function stagePortableRuntimeBridge(sourceRoot) {
  fs.rmSync(stagedPortableRoot, { recursive: true, force: true });
  fs.mkdirSync(stagedPortableRoot, { recursive: true });

  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    if (entry.name === PORTABLE_RUNTIME_MANIFEST) {
      continue;
    }

    const sourcePath = path.join(sourceRoot, entry.name);
    const targetPath = path.join(stagedPortableRoot, entry.name);

    if (entry.isDirectory()) {
      linkOrCopyEntry(sourcePath, targetPath, true);
      continue;
    }

    if (entry.isFile()) {
      linkOrCopyEntry(sourcePath, targetPath, false);
    }
  }

  fs.writeFileSync(
    path.join(stagedPortableRoot, PORTABLE_RUNTIME_MANIFEST),
    `${JSON.stringify(buildPortableBridgeManifest(sourceRoot), null, 2)}\n`,
    'utf-8',
  );

  console.warn(`[dev:portable-version] Source runtime is missing ${PORTABLE_RUNTIME_MANIFEST}; staged a dev bridge payload at ${stagedPortableRoot}`);
  return stagedPortableRoot;
}

function resolvePortableRuntimeRoot() {
  const override = process.env.HAGICODE_PORTABLE_RUNTIME_ROOT?.trim();
  if (override) {
    const overrideRoot = path.resolve(cwd, override);
    if (isRuntimeRootPresent(overrideRoot) && hasPortablePayloadFiles(overrideRoot) && !hasPortableManifest(overrideRoot)) {
      return stagePortableRuntimeBridge(overrideRoot);
    }

    return overrideRoot;
  }

  const fullyValidCandidate = defaultPortableCandidates.find((candidate) => (
    isRuntimeRootPresent(candidate) && hasPortablePayloadFiles(candidate) && hasPortableManifest(candidate)
  ));
  if (fullyValidCandidate) {
    return fullyValidCandidate;
  }

  const bridgeableCandidate = defaultPortableCandidates.find((candidate) => (
    isRuntimeRootPresent(candidate) && hasPortablePayloadFiles(candidate)
  ));
  if (bridgeableCandidate) {
    return stagePortableRuntimeBridge(bridgeableCandidate);
  }

  const existingDefault = defaultPortableCandidates.find((candidate) => isRuntimeRootPresent(candidate));
  return existingDefault || defaultPortableCandidates[0];
}

const portableRuntimeRoot = resolvePortableRuntimeRoot();

console.log(`[dev:portable-version] Preparing embedded runtime for ${runtimePlatform}...`);
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
  console.error('[dev:portable-version] Failed to prepare embedded runtime:', prepare.error);
  process.exit(1);
}

if (prepare.status !== 0) {
  process.exit(prepare.status ?? 1);
}

if (!fs.existsSync(portableRuntimeRoot)) {
  console.error('[dev:portable-version] Portable runtime root does not exist.');
  console.error(`[dev:portable-version] Expected path: ${portableRuntimeRoot}`);
  console.error('[dev:portable-version] Set HAGICODE_PORTABLE_RUNTIME_ROOT to an extracted runtime directory to override the default.');
  process.exit(1);
}

console.log(`[dev:portable-version] Using pinned runtime root (HAGICODE_EMBEDDED_DOTNET_ROOT): ${embeddedRuntimeRoot}`);
console.log(`[dev:portable-version] Using portable runtime root (HAGICODE_PORTABLE_RUNTIME_ROOT): ${portableRuntimeRoot}`);

const child = spawn(npmCommand, ['run', 'dev'], {
  cwd,
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    HAGICODE_EMBEDDED_DOTNET_PLATFORM: runtimePlatform,
    HAGICODE_EMBEDDED_DOTNET_ROOT: embeddedRuntimeRoot,
    HAGICODE_PORTABLE_RUNTIME_ROOT: portableRuntimeRoot,
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
  console.error('[dev:portable-version] Failed to start dev server:', error);
  process.exit(1);
});
