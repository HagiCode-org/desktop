import path from 'node:path';
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
  detectOmniRouteRuntimePlatform,
  readOmniRouteRuntimeConfig,
} from './omniroute-runtime.js';
import {
  readDesktopRuntimeManifest,
  type DesktopRuntimeManifest,
} from './desktop-runtime-paths.js';

export const DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME = 'node';
export const DESKTOP_HAGISCRIPT_SERVER_COMPONENT_NAME = 'server';
export const DESKTOP_HAGISCRIPT_SERVER_PM2_HOME_DIR = '.pm2';
export const DESKTOP_HAGISCRIPT_SERVER_RUNTIME_FILES_DIR = 'pm2-runtime';
export const DESKTOP_HAGISCRIPT_SERVER_VERSION_STATE_FILE = 'versions-state.json';
export const DESKTOP_HAGISCRIPT_PM2_NAME_IDENTIFIER_ENV = 'hagicode_instance';
export const DESKTOP_HAGISCRIPT_DEV_INSTANCE_NAME = 'hagicode_dev';
export const DESKTOP_HAGISCRIPT_PROD_INSTANCE_NAME = 'hagicode_prod';

const HAGISCRIPT_RUNTIME_SCRIPTS_DIR = path.join('runtime', 'scripts');

function normalizeComponentRuntimeDataDir(relativePath: string): string {
  return relativePath.replace(/^components[\\/]/u, '');
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
  hagiscriptPackageRoot?: string;
  dotnetRuntimeRoot?: string;
  desktopRuntimeManifest?: DesktopRuntimeManifest;
  dotnetPlatform?: string;
  codeServerPlatform?: string;
  omniRoutePlatform?: string;
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
  const hagiscriptRuntimeScriptsRoot = resolveHagiscriptRuntimeScriptsRoot(options.hagiscriptPackageRoot);
  const instanceName = resolveDesktopHagiscriptInstanceName();
  const desktopRuntimeManifest = options.desktopRuntimeManifest ?? readDesktopRuntimeManifest();
  const dotnetPlatform = options.dotnetPlatform ?? detectPinnedRuntimePlatform();
  const codeServerPlatform = options.codeServerPlatform ?? detectCodeServerRuntimePlatform();
  const omniRoutePlatform = options.omniRoutePlatform ?? detectOmniRouteRuntimePlatform();
  const nodeRuntimeConfig = readPinnedNodeRuntimeConfig();
  const dotnetRuntimeConfig = readPinnedRuntimeManifest();
  const codeServerRuntimeConfig = readCodeServerRuntimeConfig();
  const omniRouteRuntimeConfig = readOmniRouteRuntimeConfig();
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
    installScript: path.join(hagiscriptRuntimeScriptsRoot, 'install-node.mjs'),
    verifyScript: path.join(hagiscriptRuntimeScriptsRoot, 'verify-node.mjs'),
  };
  const dotnetComponentName = `dotnet/runtime/${dotnetPlatform}`;
  const dotnetComponent = {
    name: dotnetComponentName,
    type: 'runtime',
    source: 'desktop-embedded-dotnet',
    version: dotnetRuntimeConfig.releaseVersion,
    channelVersion: dotnetRuntimeConfig.channelVersion,
    installScript: path.join(hagiscriptRuntimeScriptsRoot, 'install-dotnet.mjs'),
    verifyScript: path.join(hagiscriptRuntimeScriptsRoot, 'verify-dotnet.mjs'),
  };
  const omniRouteComponent = {
    name: 'omniroute',
    type: 'bundled-runtime',
    source: 'desktop-vendored-runtime',
    version: resolveReleaseVersion(
      omniRoutePlatform,
      omniRouteRuntimeConfig.releaseVersionByPlatform,
      omniRouteRuntimeConfig.releaseVersion,
    ),
    runtimeDataDir: normalizeComponentRuntimeDataDir(desktopRuntimeManifest.services.omniroute.dataRelativePath),
    lifecycleDependencies: [DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME],
    installScript: path.join(hagiscriptRuntimeScriptsRoot, 'install-omniroute.mjs'),
    configureScript: path.join(hagiscriptRuntimeScriptsRoot, 'configure-omniroute.mjs'),
    pm2: {
      appName: 'hagicode-omniroute',
      nameIdentifierEnv: DESKTOP_HAGISCRIPT_PM2_NAME_IDENTIFIER_ENV,
      cwd: 'current',
    },
  };
  const codeServerComponent = {
    name: 'code-server',
    type: 'bundled-runtime',
    source: 'desktop-vendored-runtime',
    version: resolveReleaseVersion(
      codeServerPlatform,
      codeServerRuntimeConfig.releaseVersionByPlatform,
      codeServerRuntimeConfig.releaseVersion,
    ),
    runtimeDataDir: normalizeComponentRuntimeDataDir(desktopRuntimeManifest.services['code-server'].dataRelativePath),
    lifecycleDependencies: [DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME],
    installScript: path.join(hagiscriptRuntimeScriptsRoot, 'install-code-server.mjs'),
    configureScript: path.join(hagiscriptRuntimeScriptsRoot, 'configure-code-server.mjs'),
    pm2: {
      appName: 'hagicode-code-server',
      nameIdentifierEnv: DESKTOP_HAGISCRIPT_PM2_NAME_IDENTIFIER_ENV,
      cwd: 'current',
    },
  };

  const components: Array<Record<string, unknown>> = [
    nodeComponent,
    dotnetComponent,
    omniRouteComponent,
    codeServerComponent,
  ];

  const installOrder = [
    DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME,
    dotnetComponentName,
  ];
  const removeOrder = [
    'code-server',
    'omniroute',
    dotnetComponentName,
    DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME,
  ];
  const updateOrder = [
    DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME,
    dotnetComponentName,
  ];

  if (options.server) {
    components.splice(2, 0, buildDesktopHagiscriptServerComponent({
      hagiscriptPackageRoot: options.hagiscriptPackageRoot,
      server: options.server,
      nodeComponentName: DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME,
      dotnetComponentName,
    }));
    installOrder.push(DESKTOP_HAGISCRIPT_SERVER_COMPONENT_NAME);
    removeOrder.splice(2, 0, DESKTOP_HAGISCRIPT_SERVER_COMPONENT_NAME);
    updateOrder.push(DESKTOP_HAGISCRIPT_SERVER_COMPONENT_NAME);
  }

  installOrder.push('omniroute', 'code-server');
  updateOrder.push('omniroute', 'code-server');

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

function resolveHagiscriptRuntimeScriptsRoot(hagiscriptPackageRoot?: string): string {
  if (!hagiscriptPackageRoot) {
    throw new Error('hagiscriptPackageRoot is required when generating a Desktop runtime manifest.');
  }

  return path.join(hagiscriptPackageRoot, HAGISCRIPT_RUNTIME_SCRIPTS_DIR);
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
  hagiscriptPackageRoot?: string;
  server: DesktopHagiscriptManifestServerOptions;
  nodeComponentName: string;
  dotnetComponentName: string;
}): Record<string, unknown> {
  if (!input.hagiscriptPackageRoot) {
    throw new Error('hagiscriptPackageRoot is required when generating a Desktop server component manifest.');
  }

  const serverScriptsRoot = path.join(input.hagiscriptPackageRoot, HAGISCRIPT_RUNTIME_SCRIPTS_DIR);

  return {
    name: DESKTOP_HAGISCRIPT_SERVER_COMPONENT_NAME,
    type: 'released-service',
    source: 'hagicode-release-package',
    lifecycleDependencies: [
      input.nodeComponentName,
      input.dotnetComponentName,
    ],
    installScript: path.join(serverScriptsRoot, 'install-server.mjs'),
    configureScript: path.join(serverScriptsRoot, 'configure-server.mjs'),
    removeScript: path.join(serverScriptsRoot, 'remove-server.mjs'),
    pm2: {
      appName: 'hagicode-server',
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
