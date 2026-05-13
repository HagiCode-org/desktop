import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveStagedDesktopRuntimeProgramHome } from './desktop-runtime-layout.js';
import { readPinnedNodeRuntimeConfig } from './embedded-node-runtime-config.js';
import { detectRuntimePlatform, readPinnedRuntimeConfig } from './embedded-runtime-config.js';
import {
  detectCodeServerRuntimePlatform,
  readCodeServerRuntimeConfig,
  resolveRequestedCodeServerRuntimeVersion,
} from './code-server-runtime-contract.js';
import {
  detectOmniRouteRuntimePlatform,
  readOmniRouteRuntimeConfig,
  resolveRequestedOmniRouteRuntimeVersion,
} from './omniroute-runtime-contract.js';
import {
  assertGlobalHagiscriptAvailable,
  buildResolvedHagiscriptEnvironment,
  resolveGlobalHagiscriptPackageRoot,
} from './global-hagiscript.js';

const MINIMUM_HAGISCRIPT_VERSION = '0.1.14';
const NODE_COMPONENT_NAME = 'node/runtime';

export function isManagedDesktopRuntimeComponentExecution() {
  return Boolean(process.env.HAGISCRIPT_RUNTIME_COMPONENT_NAME?.trim());
}

export function resolveManagedDesktopRuntimeComponentRoot() {
  return process.env.HAGISCRIPT_RUNTIME_COMPONENT_ROOT?.trim() || null;
}

export function resolveManagedDesktopRuntimeComponentName(componentId) {
  switch (componentId) {
    case 'dotnet':
      return `dotnet/runtime/${process.env.HAGICODE_EMBEDDED_DOTNET_PLATFORM || detectRuntimePlatform()}`;
    case 'node':
      return NODE_COMPONENT_NAME;
    case 'code-server':
      return 'code-server';
    case 'omniroute':
      return 'omniroute';
    default:
      throw new Error(`Unsupported Desktop runtime component: ${componentId}`);
  }
}

function readDesktopRuntimeManifest() {
  const manifestPath = path.join(process.cwd(), 'resources', 'desktop-runtime', 'runtime-manifest.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function resolveDesktopManagedRuntimeManifest() {
  const desktopRuntimeManifest = readDesktopRuntimeManifest();
  const dotnetPlatform = process.env.HAGICODE_EMBEDDED_DOTNET_PLATFORM || detectRuntimePlatform();
  const nodeRuntimeConfig = readPinnedNodeRuntimeConfig();
  const dotnetRuntimeConfig = readPinnedRuntimeConfig();
  const codeServerConfig = readCodeServerRuntimeConfig();
  const codeServerPlatform = process.env.HAGICODE_CODE_SERVER_PLATFORM || detectCodeServerRuntimePlatform();
  const omnirouteConfig = readOmniRouteRuntimeConfig();
  const omniroutePlatform = process.env.HAGICODE_OMNIROUTE_PLATFORM || detectOmniRouteRuntimePlatform();

  return {
    runtime: {
      name: 'hagicode-desktop-runtime',
      version: desktopRuntimeManifest.runtimeVersion || '0.1.0',
    },
    paths: {
      runtimeRoot: '.',
      runtimeHome: '.',
      runtimeDataRoot: '../runtime-data',
      bin: 'bin',
      config: 'config',
      logs: 'logs',
      data: 'data',
      stateFile: 'state.json',
      componentsRoot: 'components',
      componentDataRoot: 'components',
      defaultPm2Home: 'pm2',
      npmPrefix: 'npm',
      nodeRuntime: desktopRuntimeManifest.components.node.relativePath,
      dotnetRuntime: desktopRuntimeManifest.components.dotnet.relativePath.replace('{platform}', dotnetPlatform),
      vendoredRoot: 'components/bundled',
    },
    components: [
      {
        name: NODE_COMPONENT_NAME,
        type: 'runtime',
        source: 'desktop-bundled-node',
        version: nodeRuntimeConfig.releaseVersion,
        channelVersion: nodeRuntimeConfig.channelVersion,
        installScript: path.resolve(process.cwd(), 'scripts', 'prepare-bundled-toolchain.js'),
      },
      {
        name: `dotnet/runtime/${dotnetPlatform}`,
        type: 'runtime',
        source: 'desktop-embedded-dotnet',
        version: dotnetRuntimeConfig.releaseVersion,
        channelVersion: dotnetRuntimeConfig.channelVersion,
        installScript: path.resolve(process.cwd(), 'scripts', 'prepare-embedded-runtime.js'),
      },
      {
        name: 'omniroute',
        type: 'bundled-runtime',
        source: 'desktop-vendored-runtime',
        version: resolveRequestedOmniRouteRuntimeVersion(omniroutePlatform, omnirouteConfig)
          || omnirouteConfig.releaseVersionByPlatform?.[omniroutePlatform]
          || omnirouteConfig.releaseVersion,
        runtimeDataDir: desktopRuntimeManifest.services.omniroute.dataRelativePath,
        installScript: path.resolve(process.cwd(), 'scripts', 'prepare-vendored-omniroute-runtime.js'),
        verifyScript: path.resolve(process.cwd(), 'scripts', 'verify-vendored-omniroute-runtime.js'),
      },
      {
        name: 'code-server',
        type: 'bundled-runtime',
        source: 'desktop-vendored-runtime',
        version: resolveRequestedCodeServerRuntimeVersion(codeServerPlatform, codeServerConfig)
          || codeServerConfig.releaseVersionByPlatform?.[codeServerPlatform]
          || codeServerConfig.releaseVersion,
        runtimeDataDir: desktopRuntimeManifest.services['code-server'].dataRelativePath,
        installScript: path.resolve(process.cwd(), 'scripts', 'prepare-code-server-runtime.js'),
      },
    ],
    phases: {
      install: {
        order: [
          NODE_COMPONENT_NAME,
          `dotnet/runtime/${dotnetPlatform}`,
          'omniroute',
          'code-server',
        ],
      },
      remove: {
        order: [
          'code-server',
          'omniroute',
          `dotnet/runtime/${dotnetPlatform}`,
          NODE_COMPONENT_NAME,
        ],
      },
      update: {
        order: [
          NODE_COMPONENT_NAME,
          `dotnet/runtime/${dotnetPlatform}`,
          'omniroute',
          'code-server',
        ],
      },
    },
  };
}

function writeManagedDesktopRuntimeManifest() {
  const manifestDirectory = process.cwd();
  const manifestPath = path.join(manifestDirectory, '.generated-hagiscript-runtime-manifest.json');
  fs.writeFileSync(manifestPath, `${JSON.stringify(resolveDesktopManagedRuntimeManifest(), null, 2)}\n`, 'utf8');
  return manifestPath;
}

export async function installDesktopRuntimeComponents(componentIds, options = {}) {
  const hagiscriptVersion = assertGlobalHagiscriptAvailable(MINIMUM_HAGISCRIPT_VERSION);
  const hagiscriptPackageRoot = resolveGlobalHagiscriptPackageRoot(MINIMUM_HAGISCRIPT_VERSION);
  const hagiscriptCliPath = path.join(hagiscriptPackageRoot, 'dist', 'cli.js');
  const hagiscriptEnv = buildResolvedHagiscriptEnvironment(MINIMUM_HAGISCRIPT_VERSION);
  const manifestPath = writeManagedDesktopRuntimeManifest();
  const runtimeRoot = resolveStagedDesktopRuntimeProgramHome(process.cwd());
  const componentNames = componentIds.map((componentId) => resolveManagedDesktopRuntimeComponentName(componentId));
  const args = [
    hagiscriptCliPath,
    'runtime',
    'install',
    '--from-manifest',
    manifestPath,
    '--runtime-root',
    runtimeRoot,
    '--components',
    componentNames.join(','),
  ];

  if (options.force) {
    args.push('--force');
  }
  if (process.env.HAGICODE_RUNTIME_VERBOSE === '1' || process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
    args.push('--verbose');
  }

  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...hagiscriptEnv,
    },
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.error) {
    throw result.error;
  }
  if ((result.status ?? 1) !== 0) {
    const failureParts = [
      `hagiscript runtime install failed for ${componentIds.join(', ')}`,
      `exit code: ${result.status ?? 'unknown'}`,
      `hagiscript version: ${hagiscriptVersion}`,
    ];
    if (result.signal) {
      failureParts.push(`signal: ${result.signal}`);
    }

    const outputSections = [];
    if (result.stderr?.trim()) {
      outputSections.push(`stderr:\n${result.stderr.trim()}`);
    }
    if (result.stdout?.trim()) {
      outputSections.push(`stdout:\n${result.stdout.trim()}`);
    }

    const latestLog = readLatestRuntimeInstallLog(runtimeRoot);
    if (latestLog) {
      outputSections.push(`runtime log (${latestLog.path}):\n${latestLog.content}`);
    }

    throw new Error(`${failureParts.join('\n')}${outputSections.length > 0 ? `\n${outputSections.join('\n\n')}` : ''}`);
  }
}

function readLatestRuntimeInstallLog(runtimeRoot) {
  const logsDirectory = path.resolve(runtimeRoot, '..', 'runtime-data', 'logs');
  if (!fs.existsSync(logsDirectory)) {
    return null;
  }

  const candidates = fs.readdirSync(logsDirectory)
    .filter((entry) => entry.endsWith('.log'))
    .map((entry) => {
      const targetPath = path.join(logsDirectory, entry);
      return {
        path: targetPath,
        mtimeMs: fs.statSync(targetPath).mtimeMs,
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  const latest = candidates[0];
  if (!latest) {
    return null;
  }

  const content = fs.readFileSync(latest.path, 'utf8').trim();
  return {
    path: latest.path,
    content: content.length > 8000 ? `${content.slice(-8000)}` : content,
  };
}
