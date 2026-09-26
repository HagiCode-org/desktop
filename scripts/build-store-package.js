#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';
import { execa } from 'execa';

import {
  DEFAULT_STORE_CONFIG_PATH,
  loadStorePackageConfig,
  projectRoot,
  resolveDesktopSourceRef,
  resolveRuntimeRoot,
  toWindowsPackageVersion,
  validateServerPayloadRoot,
  writeStoreForgeConfigOverlay,
} from './store-package-config.js';
import { readPinnedRuntimeConfig } from './embedded-runtime-config.js';
import { validatePm2Toolchain } from './pm2-toolchain.js';
const RUNTIME_CONSUMER_ENV = 'HAGICODE_RUNTIME_CONSUMER';

const __filename = fileURLToPath(import.meta.url);

function parseArgs(argv) {
  const options = {
    artifactOutputDir: null,
    dryRun: false,
    metadataOutputPath: null,
    overlayOutputPath: path.join(projectRoot, 'forge.store-config.json'),
    platformId: process.arch === 'arm64' ? 'win-arm64' : process.arch === 'ia32' ? 'win-ia32' : 'win-x64',
    runtimeInjectionPath: null,
    serverPayloadPath: null,
    storeConfigPath: DEFAULT_STORE_CONFIG_PATH,
    verbose: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--artifact-output-dir':
        options.artifactOutputDir = path.resolve(projectRoot, argv[++index]);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--metadata-output-path':
        options.metadataOutputPath = path.resolve(projectRoot, argv[++index]);
        break;
      case '--overlay-output-path':
        options.overlayOutputPath = path.resolve(projectRoot, argv[++index]);
        break;
      case '--platform-id':
        options.platformId = String(argv[++index]).trim() || options.platformId;
        break;
      case '--runtime-injection-path':
        options.runtimeInjectionPath = path.resolve(projectRoot, argv[++index]);
        break;
      case '--server-payload-path':
        options.serverPayloadPath = path.resolve(projectRoot, argv[++index]);
        break;
      case '--store-config-path':
        options.storeConfigPath = path.resolve(projectRoot, argv[++index]);
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        console.log(`Usage: node scripts/build-store-package.js [options]

Options:
  --store-config-path <path>      Desktop Store config source (default: config/store-package.json)
  --server-payload-path <dir>     Server payload directory to validate and inject
  --runtime-injection-path <dir>  Override runtime injection path (default: resources/portable-fixed/current)
  --artifact-output-dir <dir>     Output directory for Store artifacts
  --metadata-output-path <path>   Metadata output path
  --overlay-output-path <path>    Generated Forge overlay path
  --platform-id <id>              Workflow platform id (default: win-x64 on x64 hosts)
  --dry-run                       Emit a synthetic Store package without Windows packaging tools
  --verbose                       Print verbose MSIX packaging output
`);
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function sanitizeArtifactNameSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function resolveWindowsStoreVersion(packageJson) {
  const packageWindowsStoreVersion = typeof packageJson?.hagicodeDesktop?.windowsStoreVersion === 'string'
    ? packageJson.hagicodeDesktop.windowsStoreVersion.trim()
    : '';
  const envWindowsStoreVersion = String(process.env.HAGICODE_WINDOWS_STORE_VERSION || '').trim();
  if (envWindowsStoreVersion) {
    return envWindowsStoreVersion;
  }

  return packageWindowsStoreVersion || null;
}

function resolveWindowsArch(platformId) {
  const normalizedPlatformId = String(platformId || '').trim().toLowerCase();
  if (normalizedPlatformId.endsWith('arm64')) {
    return 'arm64';
  }
  if (normalizedPlatformId.endsWith('ia32') || normalizedPlatformId.endsWith('x86')) {
    return 'x86';
  }
  return 'x64';
}

export function buildStepScripts(scripts) {
  if (typeof scripts['prepare:runtime'] !== 'string') {
    throw new Error('Store packaging requires the Desktop prepare:runtime script.');
  }
  if (typeof scripts['build:prod'] !== 'string') {
    throw new Error('Store packaging requires the Desktop build:prod script.');
  }
  return ['prepare:runtime', 'build:prod'];
}

export function validateStoreMsixRuntimeEntries(entries, platformId, runtimeTarget, pm2ToolchainFiles = []) {
  const names = entries.map((entry) => entry.replaceAll('\\', '/').toLowerCase());
  const runtimeRoot = 'resources/extra/runtime/';
  const dotnetRoot = `${runtimeRoot}components/dotnet/runtime/${platformId}/current/`.toLowerCase();
  const dotnetRequired = [
    'dotnet.exe',
    `host/fxr/${runtimeTarget.hostFxrVersion}/hostfxr.dll`,
    `shared/Microsoft.NETCore.App/${runtimeTarget.netCoreVersion}/System.Private.CoreLib.dll`,
    `shared/Microsoft.AspNetCore.App/${runtimeTarget.aspNetCoreVersion}/Microsoft.AspNetCore.dll`,
  ];
  const missingDotnet = dotnetRequired.filter((relativePath) =>
    !names.some((name) => name.endsWith(`${dotnetRoot}${relativePath.toLowerCase()}`)));
  if (missingDotnet.length > 0) {
    throw new Error(`Store MSIX is missing the bundled .NET runtime: ${missingDotnet.join(', ')}`);
  }

  const requiredPm2Files = [
    'components/node/runtime/node.exe',
    'npm-pm2/node_modules/pm2/bin/pm2',
    'npm-pm2/node_modules/pm2/package.json',
    ...pm2ToolchainFiles,
  ];
  const missingPm2Files = [...new Set(requiredPm2Files)].filter((relativePath) =>
    !names.some((name) => name.endsWith(`${runtimeRoot}${relativePath.toLowerCase()}`)));
  if (missingPm2Files.length > 0) {
    throw new Error(`Store MSIX is missing the bundled PM2 toolchain: ${missingPm2Files.join(', ')}`);
  }
}

function resolveStoreRuntimePolicyEnvironment(baseEnv = process.env) {
  const runtimeConsumer = baseEnv[RUNTIME_CONSUMER_ENV]?.trim() || 'windows-store';

  return {
    ...baseEnv,
    [RUNTIME_CONSUMER_ENV]: runtimeConsumer,
  };
}

export { resolveStoreRuntimePolicyEnvironment };

async function runCommand(command, args, cwd = projectRoot, env = process.env) {
  await execa(command, args, {
    cwd,
    env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
}

function createMsixArtifactSignature(stats) {
  return `${stats.size}:${stats.mtimeMs}:${stats.ctimeMs}`;
}

async function listMsixArtifacts(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const entries = await fsp.readdir(directory, { withFileTypes: true });
  const artifacts = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.msix'))
    .map(async (entry) => {
      const artifactPath = path.join(directory, entry.name);
      const stats = await fsp.stat(artifactPath);
      return {
        path: artifactPath,
        signature: createMsixArtifactSignature(stats),
      };
    }));

  return artifacts.sort((left, right) => left.path.localeCompare(right.path));
}

export function resolveUpdatedMsixArtifacts(previousArtifacts, currentArtifacts) {
  const previousArtifactsByPath = new Map(
    previousArtifacts.map((artifact) => [artifact.path, artifact.signature]),
  );

  return currentArtifacts
    .filter((artifact) => previousArtifactsByPath.get(artifact.path) !== artifact.signature)
    .map((artifact) => artifact.path);
}

async function withInjectedPayload(serverPayloadPath, runtimeInjectionPath, callback) {
  if (!serverPayloadPath) {
    return callback({ payloadRoot: null, restoredWorkspacePayload: false });
  }

  const payloadRoot = await resolveRuntimeRoot(serverPayloadPath);
  const validation = await validateServerPayloadRoot(payloadRoot);
  const resolvedInjectionPath = path.resolve(runtimeInjectionPath);
  const payloadMatchesInjectionRoot = payloadRoot === resolvedInjectionPath;

  if (payloadMatchesInjectionRoot) {
    return callback({ payloadRoot, payloadValidation: validation, restoredWorkspacePayload: false });
  }

  const backupDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), 'hagicode-store-payload-'));
  const backupPath = path.join(backupDirectory, 'runtime-backup');
  const hadExistingPayload = fs.existsSync(resolvedInjectionPath);

  if (hadExistingPayload) {
    await fsp.cp(resolvedInjectionPath, backupPath, { recursive: true });
  }

  await fsp.rm(resolvedInjectionPath, { recursive: true, force: true });
  await fsp.mkdir(path.dirname(resolvedInjectionPath), { recursive: true });
  await fsp.cp(payloadRoot, resolvedInjectionPath, { recursive: true });

  try {
    return await callback({
      payloadRoot,
      payloadValidation: validation,
      restoredWorkspacePayload: true,
    });
  } finally {
    await fsp.rm(resolvedInjectionPath, { recursive: true, force: true });
    if (hadExistingPayload) {
      await fsp.cp(backupPath, resolvedInjectionPath, { recursive: true });
    }
    await fsp.rm(backupDirectory, { recursive: true, force: true });
  }
}

async function createSyntheticStorePackage({ artifactPath, runtimeInjectionPath, storeConfig, desktopVersion, windowsStoreVersion }) {
  const zip = new AdmZip();
  const resolvedRuntimeInjectionPath = path.resolve(runtimeInjectionPath);

  if (fs.existsSync(resolvedRuntimeInjectionPath)) {
    zip.addLocalFolder(resolvedRuntimeInjectionPath, 'extra/portable-fixed/current');
  }

  zip.addFile(
    'store-package-identity.json',
    Buffer.from(
      JSON.stringify(
        {
          desktopVersion,
          windowsStoreVersion,
          packageIdentity: storeConfig.packageIdentity,
          msix: storeConfig.msix,
        },
        null,
        2
      ),
      'utf8'
    )
  );

  await fsp.mkdir(path.dirname(artifactPath), { recursive: true });
  zip.writeZip(artifactPath);
}

export function createStoreBuildMetadata({
  artifacts,
  buildMode,
  desktopSourceRef,
  desktopVersion,
  windowsStoreVersion,
  effectiveRuntimeInjectionPath,
  overlayConfigPath,
  packageVersion,
  payloadValidation,
  platformId,
  pm2Toolchain,
  restoredWorkspacePayload,
  serverPayloadPath,
  serverPayloadRoot,
  storeConfig,
  storeConfigPath,
}) {
  return {
    producer: 'hagicode-desktop',
    schemaVersion: 1,
    platform: platformId,
    buildMode,
    desktopVersion,
    windowsStoreVersion,
    desktopSourceRef,
    storePackageVersion: packageVersion,
    storeConfigPath,
    overlayConfigPath,
    effectiveRuntimeInjectionPath,
    serverPayloadPath,
    serverPayloadRoot,
    restoredWorkspacePayload,
    payloadValidation: payloadValidation
      ? {
          requiredPaths: payloadValidation.requiredPaths,
          validationPassed: true,
        }
      : {
          validationPassed: false,
          requiredPaths: [],
        },
    pm2Toolchain: pm2Toolchain ?? {
      validationPassed: false,
      validationStatus: 'not-validated',
      requiredFiles: [],
    },
    store: {
      displayName: storeConfig.packageIdentity.displayName,
      publisherDisplayName: storeConfig.packageIdentity.publisherDisplayName,
      publisher: storeConfig.packageIdentity.publisher,
      identityName: storeConfig.packageIdentity.identityName,
      languages: [...storeConfig.packageIdentity.languages],
      capabilities: [...storeConfig.msix.capabilities],
      minVersion: storeConfig.msix.minVersion,
      maxVersionTested: storeConfig.msix.maxVersionTested,
    },
    artifacts: artifacts.map((artifactPath) => ({
      path: artifactPath,
      fileName: path.basename(artifactPath),
      type: path.extname(artifactPath).slice(1).toLowerCase(),
    })),
    primaryArtifactPath: artifacts[0] ?? null,
  };
}

export async function buildStorePackage(rawOptions = {}) {
  const options = rawOptions.storeConfigPath ? rawOptions : parseArgs(process.argv.slice(2));
  const { storeConfig, storeConfigPath } = await loadStorePackageConfig(options.storeConfigPath);
  const packageJson = JSON.parse(await fsp.readFile(path.join(projectRoot, 'package.json'), 'utf8'));
  const scripts = packageJson.scripts ?? {};
  const windowsStoreVersion = resolveWindowsStoreVersion(packageJson);
  const buildVersionSource = windowsStoreVersion || packageJson.version;
  const buildVersion = toWindowsPackageVersion(buildVersionSource);
  const overlayConfig = await writeStoreForgeConfigOverlay({
    storeConfigPath,
    outputPath: options.overlayOutputPath,
    buildVersion,
  });
  const artifactOutputDirectory = options.artifactOutputDir
    ? path.resolve(options.artifactOutputDir)
    : path.resolve(projectRoot, storeConfig.outputDirectory);
  const metadataOutputPath = options.metadataOutputPath
    ? path.resolve(options.metadataOutputPath)
    : path.resolve(projectRoot, storeConfig.metadataOutputPath);
  const runtimeInjectionPath = options.runtimeInjectionPath
    ? path.resolve(options.runtimeInjectionPath)
    : path.resolve(projectRoot, storeConfig.runtimeInjectionPath);
  const desktopSourceRef = await resolveDesktopSourceRef(projectRoot);
  const buildStepEnv = resolveStoreRuntimePolicyEnvironment(process.env);

  const artifactPaths = await withInjectedPayload(options.serverPayloadPath, runtimeInjectionPath, async ({
    payloadRoot,
    payloadValidation,
    restoredWorkspacePayload,
  }) => {
    if (options.dryRun) {
      const artifactBaseName = sanitizeArtifactNameSegment(packageJson.productName || packageJson.name) || 'hagicode-desktop';
      const syntheticArtifactPath = path.join(
        artifactOutputDirectory,
        `${artifactBaseName}-${packageJson.version}-${resolveWindowsArch(options.platformId)}.msix`
      );
      await createSyntheticStorePackage({
        artifactPath: syntheticArtifactPath,
        runtimeInjectionPath,
        storeConfig,
        desktopVersion: packageJson.version,
        windowsStoreVersion,
      });

      const syntheticMetadata = createStoreBuildMetadata({
        artifacts: [syntheticArtifactPath],
        buildMode: 'desktop-store-build-dry-run',
        desktopSourceRef,
        desktopVersion: packageJson.version,
        windowsStoreVersion,
        effectiveRuntimeInjectionPath: runtimeInjectionPath,
        overlayConfigPath: overlayConfig.outputPath,
        packageVersion: buildVersion,
        payloadValidation,
        platformId: options.platformId,
        pm2Toolchain: {
          validationPassed: false,
          validationStatus: 'not-validated-synthetic',
          requiredFiles: [],
        },
        restoredWorkspacePayload,
        serverPayloadPath: options.serverPayloadPath,
        serverPayloadRoot: payloadRoot,
        storeConfig,
        storeConfigPath,
      });
      await fsp.mkdir(path.dirname(metadataOutputPath), { recursive: true });
      await fsp.writeFile(metadataOutputPath, `${JSON.stringify(syntheticMetadata, null, 2)}\n`, 'utf8');
      return [syntheticArtifactPath];
    }

    if (process.platform !== 'win32') {
      throw new Error('Desktop Store packaging requires Windows unless --dry-run is used.');
    }

    for (const scriptName of buildStepScripts(scripts)) {
      await runCommand(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['run', scriptName],
        projectRoot,
        buildStepEnv,
      );
    }

    const pm2Toolchain = await validatePm2Toolchain(path.join(projectRoot, 'resources'));
    const pm2ToolchainMetadata = {
      validationPassed: true,
      validationStatus: 'validated-staged-and-packaged',
      nodeExecutable: path.relative(pm2Toolchain.root, pm2Toolchain.nodePath).split(path.sep).join('/'),
      pm2Entrypoint: path.relative(pm2Toolchain.root, pm2Toolchain.pm2Entrypoint).split(path.sep).join('/'),
      pm2Version: pm2Toolchain.pm2Version,
      requiredFiles: pm2Toolchain.requiredFiles,
    };

    const existingMsixArtifacts = await listMsixArtifacts(artifactOutputDirectory);
    await runCommand(process.execPath, [
      'scripts/run-electron-forge.js',
      '--platform',
      'win32',
      '--arch',
      resolveWindowsArch(options.platformId),
      '--targets',
      'msix',
    ], projectRoot, {
      ...process.env,
      HAGICODE_PACKAGE_OUTPUT_DIR: artifactOutputDirectory,
      HAGICODE_STORE_CONFIG_PATH: storeConfigPath,
      HAGICODE_STORE_FORGE_CONFIG: overlayConfig.outputPath,
      WINDOWS_PACKAGE_VERSION: buildVersion,
      [RUNTIME_CONSUMER_ENV]: buildStepEnv[RUNTIME_CONSUMER_ENV],
    });

    const packagedMsixArtifacts = resolveUpdatedMsixArtifacts(
      existingMsixArtifacts,
      await listMsixArtifacts(artifactOutputDirectory),
    );

    if (packagedMsixArtifacts.length === 0) {
      throw new Error(`Forge MSIX packaging completed without producing a new .msix artifact in ${artifactOutputDirectory}`);
    }

    if (packagedMsixArtifacts.length > 1) {
      throw new Error(`Expected one MSIX artifact from Forge Store packaging, received ${packagedMsixArtifacts.length}: ${packagedMsixArtifacts.join(', ')}`);
    }

    const packagedMsixPath = packagedMsixArtifacts[0];
    const runtimeTarget = readPinnedRuntimeConfig().platforms[options.platformId];
    if (!runtimeTarget) {
      throw new Error(`No pinned .NET runtime is configured for ${options.platformId}.`);
    }
    validateStoreMsixRuntimeEntries(
      new AdmZip(packagedMsixPath).getEntries().map((entry) => entry.entryName),
      options.platformId,
      runtimeTarget,
      pm2Toolchain.requiredFiles.filter((file) => file.startsWith('npm-pm2/')),
    );

    const buildMetadata = createStoreBuildMetadata({
      artifacts: [packagedMsixPath],
      buildMode: 'desktop-store-build-command',
      desktopSourceRef,
      desktopVersion: packageJson.version,
      windowsStoreVersion,
      effectiveRuntimeInjectionPath: runtimeInjectionPath,
      overlayConfigPath: overlayConfig.outputPath,
      packageVersion: buildVersion,
      payloadValidation,
      platformId: options.platformId,
      pm2Toolchain: pm2ToolchainMetadata,
      restoredWorkspacePayload,
      serverPayloadPath: options.serverPayloadPath,
      serverPayloadRoot: payloadRoot,
      storeConfig,
      storeConfigPath,
    });
    await fsp.mkdir(path.dirname(metadataOutputPath), { recursive: true });
    await fsp.writeFile(metadataOutputPath, `${JSON.stringify(buildMetadata, null, 2)}\n`, 'utf8');
    return [packagedMsixPath];
  });

  return {
    artifactPaths,
    metadataOutputPath,
    overlayConfigPath: overlayConfig.outputPath,
  };
}

async function main() {
  const result = await buildStorePackage();
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(`[store-build] ${error.message}`);
    process.exit(1);
  });
}
