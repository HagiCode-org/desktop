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
  readDesktopRuntimeManifest,
  type DesktopRuntimeManifest,
} from './desktop-runtime-paths.js';

export const DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME = 'node';
export const DESKTOP_HAGISCRIPT_SERVER_COMPONENT_NAME = 'server';
export const DESKTOP_HAGISCRIPT_SERVER_PM2_HOME_DIR = 'pm2';
export const DESKTOP_HAGISCRIPT_SERVER_RUNTIME_FILES_DIR = 'pm2-runtime';
export const DESKTOP_HAGISCRIPT_SERVER_VERSION_STATE_FILE = 'versions-state.json';
export const DESKTOP_HAGISCRIPT_PM2_NAME_IDENTIFIER_ENV = 'hagicode_instance';
export const DESKTOP_HAGISCRIPT_DEV_INSTANCE_NAME = 'hagicode_dev';
export const DESKTOP_HAGISCRIPT_PROD_INSTANCE_NAME = 'hagicode_prod';
export const DESKTOP_HAGISCRIPT_SERVER_BASE_APP_NAME = 'hagicode-server';

const DESKTOP_RUNTIME_SCRIPTS_DIRECTORY_NAME = 'hagiscript-runtime-scripts';
const DESKTOP_RUNTIME_SCRIPTS_REQUIRED_FILE = 'noop-install-node.mjs';

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
  const nodeRuntimeConfig = readPinnedNodeRuntimeConfig();
  const dotnetRuntimeConfig = readPinnedRuntimeManifest();
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
  };

  const nodeComponent = {
    name: DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME,
    type: 'runtime',
    source: 'desktop-bundled-node',
    version: nodeRuntimeConfig.releaseVersion,
    channelVersion: nodeRuntimeConfig.channelVersion,
    optionalPolicy: desktopRuntimeManifest.components.node.optionalPolicy,
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
  const components: Array<Record<string, unknown>> = [
    nodeComponent,
    dotnetComponent,
  ];

  const installOrder = [
    DESKTOP_HAGISCRIPT_NODE_COMPONENT_NAME,
    dotnetComponentName,
  ];
  const removeOrder = [
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
      runtimeDataRoot: options.runtimeDataRoot,
    }));
    installOrder.push(DESKTOP_HAGISCRIPT_SERVER_COMPONENT_NAME);
    removeOrder.splice(2, 0, DESKTOP_HAGISCRIPT_SERVER_COMPONENT_NAME);
    updateOrder.push(DESKTOP_HAGISCRIPT_SERVER_COMPONENT_NAME);
  }

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
  runtimeDataRoot: string;
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
      pm2Home: path.join(input.runtimeDataRoot, DESKTOP_HAGISCRIPT_SERVER_PM2_HOME_DIR),
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
