import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import log from 'electron-log';
import {
  detectPinnedRuntimePlatform,
  readPinnedRuntimeManifest,
} from './embedded-runtime-config.js';
import { readPinnedNodeRuntimeConfig } from './embedded-node-runtime-config.js';
import {
  detectCodeServerRuntimePlatform,
  readCodeServerRuntimeConfig,
} from './code-server-runtime.js';
import {
  readDesktopRuntimeManifest,
  type DesktopRuntimeManifest,
  type DesktopRuntimeServiceId,
} from './desktop-runtime-paths.js';

export const DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME = 'node';
export const DESKTOP_HAGISCRIPT_SERVER_COMPONENT_NAME = 'server';
export const DESKTOP_HAGISCRIPT_CODE_SERVER_COMPONENT_NAME = 'code-server';
export const DESKTOP_HAGISCRIPT_SERVER_PM2_HOME_DIR = '.pm2';
export const DESKTOP_HAGISCRIPT_SERVER_RUNTIME_FILES_DIR = 'pm2-runtime';
export const DESKTOP_HAGISCRIPT_SERVER_VERSION_STATE_FILE = 'versions-state.json';
export const DESKTOP_HAGISCRIPT_PM2_NAME_IDENTIFIER_ENV = 'hagicode_instance';
export const DESKTOP_HAGISCRIPT_DEV_INSTANCE_NAME = 'hagicode_dev';
export const DESKTOP_HAGISCRIPT_PROD_INSTANCE_NAME = 'hagicode_prod';
export const DESKTOP_HAGISCRIPT_SERVER_BASE_APP_NAME = 'hagicode-server';
export const DESKTOP_HAGISCRIPT_CODE_SERVER_BASE_APP_NAME = 'hagicode-code-server';

const DESKTOP_RUNTIME_SCRIPTS_DIRECTORY_NAME = 'hagiscript-runtime-scripts';
const DESKTOP_RUNTIME_SCRIPTS_REQUIRED_FILE = 'noop-install-node.mjs';

function normalizeComponentRuntimeDataDir(relativePath: string): string {
  return relativePath.replace(/^components[\\/]/u, '');
}

function resolveBundledRuntimePackagedRoot(
  runtimeHome: string,
  desktopRuntimeManifest: DesktopRuntimeManifest,
  serviceId: DesktopRuntimeServiceId,
): string {
  return path.resolve(runtimeHome, desktopRuntimeManifest.components[serviceId].relativePath);
}

function readBundledRuntimeMarkerVersion(packagedRoot: string): string | undefined {
  const markerPath = path.join(packagedRoot, '.hagicode-runtime.json');

  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as { version?: unknown };
    const version = typeof marker.version === 'string' ? marker.version.trim() : '';
    return version.length > 0 ? version : undefined;
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code !== 'ENOENT') {
      log.warn('[hagiscript-desktop-manifest] failed to read bundled runtime marker version', {
        packagedRoot,
        markerPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return undefined;
  }
}

function resolveBundledRuntimeComponentVersion(input: {
  runtimeHome: string;
  desktopRuntimeManifest: DesktopRuntimeManifest;
  serviceId: DesktopRuntimeServiceId;
  configuredVersion: string | undefined;
}): string | undefined {
  const packagedRoot = resolveBundledRuntimePackagedRoot(
    input.runtimeHome,
    input.desktopRuntimeManifest,
    input.serviceId,
  );
  const markerVersion = readBundledRuntimeMarkerVersion(packagedRoot);
  const configuredVersion = input.configuredVersion?.trim() || undefined;

  if (markerVersion && configuredVersion && markerVersion !== configuredVersion) {
    log.warn('[hagiscript-desktop-manifest] bundled runtime version mismatch; preferring packaged marker', {
      serviceId: input.serviceId,
      packagedRoot,
      markerVersion,
      configuredVersion,
    });
  }

  return markerVersion ?? configuredVersion;
}

export interface DesktopHagiscriptManifestServerOptions {
  servicePayloadPath: string;
  serviceWorkingDirectory: string;
  serviceEnv?: NodeJS.ProcessEnv;
  activeVersion?: string | null;
}

export interface DesktopHagiscriptManifestOptions {
  runtimeRoot: string;
  runtimeHome: string;
  runtimeDataRoot: string;
  serverProgramRoot: string;
  serverDataRoot: string;
  npmPrefix: string;
  dotnetRuntimeRoot?: string;
  desktopRuntimeManifest?: DesktopRuntimeManifest;
  dotnetPlatform?: string;
  codeServerPlatform?: string;
  bundledRuntimeOverrides?: Partial<Record<DesktopRuntimeServiceId, {
    runtimeDataDir?: string;
    pm2?: {
      appName?: string;
      cwd?: string;
      script?: string;
      args?: string[];
      env?: Record<string, string>;
      pm2Home?: string;
    };
  }>>;
  server?: DesktopHagiscriptManifestServerOptions;
}

export interface DesktopManagedServerVersionState {
  schemaVersion: 1;
  activeVersion: string | null;
  versions: Record<
    string,
    {
      version: string;
      installPath: string;
      installedAt: string;
      source: {
        kind: 'local-folder';
        locator: string;
        assetName: string;
      };
    }
  >;
}

export function buildDesktopHagiscriptRuntimeManifest(
  options: DesktopHagiscriptManifestOptions,
): Record<string, unknown> {
  const desktopRuntimeScriptsRoot = resolveDesktopRuntimeScriptsRoot();
  const instanceName = resolveDesktopHagiscriptInstanceName();
  const desktopRuntimeManifest = options.desktopRuntimeManifest ?? readDesktopRuntimeManifest();
  const dotnetPlatform = options.dotnetPlatform ?? detectPinnedRuntimePlatform();
  const codeServerPlatform = options.codeServerPlatform ?? detectCodeServerRuntimePlatform();
  const nodeRuntimeConfig = readPinnedNodeRuntimeConfig();
  const dotnetRuntimeConfig = readPinnedRuntimeManifest();
  const codeServerRuntimeConfig = readCodeServerRuntimeConfig();
  const bundledRuntimeOverrides = options.bundledRuntimeOverrides ?? {};
  const codeServerOverride = bundledRuntimeOverrides['code-server'];
  const paths = {
    runtimeRoot: options.runtimeRoot,
    runtimeHome: options.runtimeHome,
    runtimeDataRoot: options.runtimeDataRoot,
    serverProgramRoot: options.serverProgramRoot,
    serverDataRoot: options.serverDataRoot,
    bin: path.join(options.runtimeHome, 'bin'),
    config: path.join(options.runtimeDataRoot, 'config'),
    logs: path.join(options.runtimeDataRoot, 'logs'),
    data: path.join(options.runtimeDataRoot, 'data'),
    stateFile: path.join(options.runtimeDataRoot, 'state.json'),
    componentsRoot: path.join(options.runtimeHome, 'components'),
    componentDataRoot: path.join(options.runtimeDataRoot, 'components'),
    defaultPm2Home: 'pm2',
    npmPrefix: options.npmPrefix,
    nodeRuntime: desktopRuntimeManifest.components.node.relativePath,
    dotnetRuntime: options.dotnetRuntimeRoot
      ?? desktopRuntimeManifest.components.dotnet.relativePath.replace('{platform}', dotnetPlatform),
    vendoredRoot: desktopRuntimeManifest.components['code-server'].relativePath
      .split('/code-server')
      .join(''),
  };

  const nodeComponent = {
    name: DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME,
    type: 'runtime',
    source: 'desktop-bundled-node',
    version: nodeRuntimeConfig.releaseVersion,
    channelVersion: nodeRuntimeConfig.channelVersion,
    installScript: path.join(desktopRuntimeScriptsRoot, 'noop-install-node.mjs'),
    verifyScript: path.join(desktopRuntimeScriptsRoot, 'noop-verify-node.mjs'),
  };
  const dotnetComponentName = `dotnet/runtime/${dotnetPlatform}`;
  const dotnetComponent = {
    name: dotnetComponentName,
    type: 'runtime',
    source: 'desktop-embedded-dotnet',
    version: dotnetRuntimeConfig.releaseVersion,
    channelVersion: dotnetRuntimeConfig.channelVersion,
    installScript: path.join(desktopRuntimeScriptsRoot, 'noop-install-dotnet.mjs'),
    verifyScript: path.join(desktopRuntimeScriptsRoot, 'noop-verify-dotnet.mjs'),
  };
  const codeServerComponent = {
    name: DESKTOP_HAGISCRIPT_CODE_SERVER_COMPONENT_NAME,
    type: 'bundled-runtime',
    source: 'desktop-vendored-runtime',
    version: resolveBundledRuntimeComponentVersion({
      runtimeHome: options.runtimeHome,
      desktopRuntimeManifest,
      serviceId: 'code-server',
      configuredVersion: resolveReleaseVersion(
        codeServerPlatform,
        codeServerRuntimeConfig.releaseVersionByPlatform,
        codeServerRuntimeConfig.releaseVersion,
      ),
    }),
    bundledInstallMode: codeServerRuntimeConfig.packagedLayout.installMode,
    runtimeDataDir: codeServerOverride?.runtimeDataDir
      ?? normalizeComponentRuntimeDataDir(desktopRuntimeManifest.services['code-server'].dataRelativePath),
    lifecycleDependencies: [DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME],
    installScript: path.join(desktopRuntimeScriptsRoot, 'noop-install-code-server.mjs'),
    configureScript: path.join(desktopRuntimeScriptsRoot, 'noop-configure-code-server.mjs'),
    pm2: {
      appName: DESKTOP_HAGISCRIPT_CODE_SERVER_BASE_APP_NAME,
      nameIdentifierEnv: DESKTOP_HAGISCRIPT_PM2_NAME_IDENTIFIER_ENV,
      cwd: 'current',
      ...(codeServerOverride?.pm2 ?? {}),
    },
  };

  const components: Array<Record<string, unknown>> = [
    nodeComponent,
    dotnetComponent,
    codeServerComponent,
  ];

  const installOrder = [
    DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME,
    dotnetComponentName,
  ];
  const removeOrder = [
    'code-server',
    dotnetComponentName,
    DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME,
  ];
  const updateOrder = [
    DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME,
    dotnetComponentName,
  ];

  if (options.server) {
    components.splice(2, 0, buildDesktopHagiscriptServerComponent({
      server: options.server,
      nodeComponentName: DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME,
      dotnetComponentName,
    }));
    installOrder.push(DESKTOP_HAGISCRIPT_SERVER_COMPONENT_NAME);
    removeOrder.splice(2, 0, DESKTOP_HAGISCRIPT_SERVER_COMPONENT_NAME);
    updateOrder.push(DESKTOP_HAGISCRIPT_SERVER_COMPONENT_NAME);
  }

  installOrder.push('code-server');
  updateOrder.push('code-server');

  return {
    runtime: {
      name: 'hagicode-desktop-runtime',
      version: desktopRuntimeManifest.runtimeVersion || '0.1.0',
      hagicodeInstance: instanceName,
    },
    paths,
    components,
    phases: {
      install: { order: installOrder },
      remove: { order: removeOrder },
      update: { order: updateOrder },
    },
    npmSync: desktopRuntimeManifest.npmSync,
  };
}

function resolveDesktopRuntimeScriptsRoot(): string {
  const moduleDirectory = fileURLToPath(new URL('.', import.meta.url));
  const resourcesPath = typeof process.resourcesPath === 'string' && process.resourcesPath.trim().length > 0
    ? process.resourcesPath
    : null;
  const cwdCandidate = path.resolve(
    process.cwd(),
    'resources',
    DESKTOP_RUNTIME_SCRIPTS_DIRECTORY_NAME,
  );
  const moduleCandidate = path.resolve(
    moduleDirectory,
    '../../resources',
    DESKTOP_RUNTIME_SCRIPTS_DIRECTORY_NAME,
  );
  const packagedAsarCandidate = resourcesPath
    ? path.resolve(
        resourcesPath,
        'app.asar',
        'resources',
        DESKTOP_RUNTIME_SCRIPTS_DIRECTORY_NAME,
      )
    : null;
  const packagedUnpackedCandidate = resourcesPath
    ? path.resolve(
        resourcesPath,
        'resources',
        DESKTOP_RUNTIME_SCRIPTS_DIRECTORY_NAME,
      )
    : null;
  const candidates = [
    cwdCandidate,
    moduleCandidate,
    packagedAsarCandidate,
    packagedUnpackedCandidate,
  ].filter((candidate): candidate is string => Boolean(candidate));

  const resolved = candidates.find((candidate) => fs.existsSync(path.join(candidate, DESKTOP_RUNTIME_SCRIPTS_REQUIRED_FILE)));
  if (resolved) {
    return resolved;
  }

  log.warn('[hagiscript-desktop-manifest] Desktop runtime scripts root was not found; falling back to module-relative path', {
    candidates,
  });
  return moduleCandidate;
}

export function buildDesktopManagedServerVersionState(input: {
  activeVersion: string;
  installPath: string;
  installedAt?: string;
}): DesktopManagedServerVersionState {
  const installedAt = input.installedAt ?? new Date().toISOString();
  const assetName = path.basename(input.installPath);

  return {
    schemaVersion: 1,
    activeVersion: input.activeVersion,
    versions: {
      [input.activeVersion]: {
        version: input.activeVersion,
        installPath: input.installPath,
        installedAt,
        source: {
          kind: 'local-folder',
          locator: input.installPath,
          assetName,
        },
      },
    },
  };
}

function buildDesktopHagiscriptServerComponent(input: {
  server: DesktopHagiscriptManifestServerOptions;
  nodeComponentName: string;
  dotnetComponentName: string;
}): Record<string, unknown> {
  const serverScriptsRoot = resolveDesktopRuntimeScriptsRoot();

  return {
    name: DESKTOP_HAGISCRIPT_SERVER_COMPONENT_NAME,
    type: 'released-service',
    source: 'hagicode-release-package',
    lifecycleDependencies: [
      input.nodeComponentName,
      input.dotnetComponentName,
    ],
    installScript: path.join(serverScriptsRoot, 'noop-install-server.mjs'),
    configureScript: path.join(serverScriptsRoot, 'noop-configure-server.mjs'),
    removeScript: path.join(serverScriptsRoot, 'noop-remove-server.mjs'),
    pm2: {
      appName: DESKTOP_HAGISCRIPT_SERVER_BASE_APP_NAME,
      nameIdentifierEnv: DESKTOP_HAGISCRIPT_PM2_NAME_IDENTIFIER_ENV,
      pm2Home: DESKTOP_HAGISCRIPT_SERVER_PM2_HOME_DIR,
      env: normalizeManifestEnv(input.server.serviceEnv ?? {}),
    },
    releasedService: {
      dllPath: input.server.servicePayloadPath,
      workingDirectory: input.server.serviceWorkingDirectory,
      configRoot: input.server.serviceWorkingDirectory,
      runtimeFilesDir: DESKTOP_HAGISCRIPT_SERVER_RUNTIME_FILES_DIR,
      activeVersion: normalizeOptionalString(input.server.activeVersion),
    },
  };
}

function resolveReleaseVersion(
  platform: string,
  releaseVersionByPlatform: Record<string, string> | undefined,
  releaseVersion: string | undefined,
): string | undefined {
  const perPlatform = releaseVersionByPlatform?.[platform]?.trim();
  if (perPlatform) {
    return perPlatform;
  }

  const sharedVersion = releaseVersion?.trim();
  return sharedVersion || undefined;
}

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function resolveDesktopHagiscriptInstanceName(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicitInstanceName = env.HAGICODE_DESKTOP_INSTANCE_NAME?.trim();
  if (explicitInstanceName) {
    return explicitInstanceName;
  }

  return env.NODE_ENV === 'development'
    ? DESKTOP_HAGISCRIPT_DEV_INSTANCE_NAME
    : DESKTOP_HAGISCRIPT_PROD_INSTANCE_NAME;
}

export function resolveDesktopManagedPm2AppName(
  baseAppName: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return `${baseAppName}-${resolveDesktopHagiscriptInstanceName(env)}`;
}

function normalizeManifestEnv(serviceEnv: NodeJS.ProcessEnv): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(serviceEnv)) {
    if (
      typeof value === 'string'
      && key.trim().length > 0
      && key !== DESKTOP_HAGISCRIPT_PM2_NAME_IDENTIFIER_ENV
    ) {
      env[key] = value;
    }
  }

  return env;
}
