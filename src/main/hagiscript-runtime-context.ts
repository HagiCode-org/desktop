import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { dump } from 'js-yaml';
import type { DependencyManagementService } from './dependency-management-service.js';
import {
  buildDesktopHagiscriptRuntimeManifest,
  buildDesktopManagedServerVersionState,
  DESKTOP_HAGISCRIPT_CODE_SERVER_BASE_APP_NAME,
  DESKTOP_HAGISCRIPT_OMNIROUTE_BASE_APP_NAME,
  DESKTOP_HAGISCRIPT_SERVER_PM2_HOME_DIR,
  DESKTOP_HAGISCRIPT_SERVER_RUNTIME_FILES_DIR,
  DESKTOP_HAGISCRIPT_SERVER_BASE_APP_NAME,
  DESKTOP_HAGISCRIPT_SERVER_VERSION_STATE_FILE,
  resolveDesktopManagedPm2AppName,
} from './hagiscript-desktop-manifest.js';
import { ensureNoSpacePathAlias } from './pm2-home-alias.js';
import type { PathManager } from './path-manager.js';
import type { ActiveRuntimeDescriptor } from '../types/distribution-mode.js';
import { extractPm2MajorVersion } from './portable-toolchain-paths.js';

export type HagiscriptManagedPm2Service = 'server' | 'omniroute' | 'code-server';

interface HagiscriptBundledRuntimeContextInput {
  service: Extract<HagiscriptManagedPm2Service, 'omniroute' | 'code-server'>;
  launchScriptPath?: string;
  launchWorkingDirectory?: string;
  launchArgs?: string[];
  serviceEnv?: NodeJS.ProcessEnv;
}

export interface HagiscriptRuntimeContext {
  readonly serviceName: HagiscriptManagedPm2Service;
  readonly activeRuntime: ActiveRuntimeDescriptor;
  readonly hagiscriptExecutablePath: string;
  readonly hagiscriptPackageRoot: string;
  readonly commandEnv: NodeJS.ProcessEnv;
  readonly runtimeRoot: string;
  readonly runtimeHome: string;
  readonly runtimeDataRoot: string;
  readonly runtimeLogsDirectory: string;
  readonly runtimeStateFilePath: string;
  readonly serviceDataHome: string;
  readonly pm2Home: string;
  readonly pm2LogsDirectory: string;
  readonly runtimeFilesDir: string;
  readonly manifestPath: string;
  readonly manifestDirectory: string;
  readonly appName: string;
  readonly servicePayloadPath: string;
  readonly serviceWorkingDirectory: string;
  cleanup(): Promise<void>;
}

export interface ResolveHagiscriptRuntimeContextInput {
  activeRuntime: ActiveRuntimeDescriptor;
  servicePayloadPath: string;
  serviceWorkingDirectory: string;
  serviceEnv?: NodeJS.ProcessEnv;
}

export class HagiscriptRuntimeContextResolver {
  private readonly pathManager: Pick<
    PathManager,
    | 'getRuntimeProgramHome'
    | 'getRuntimeDataHome'
    | 'getUserDataPath'
    | 'getManagedServerProgramHome'
    | 'getManagedServerDataHome'
    | 'getCodeServerRuntimeDataHome'
    | 'getCodeServerRuntimeRoot'
    | 'getOmniRouteRuntimeDataHome'
    | 'getOmniRouteRuntimeRoot'
    | 'getEmbeddedRuntimeContainerRoot'
    | 'getEmbeddedRuntimeRoot'
    | 'getCurrentPlatform'
  >;
  private readonly dependencyManagementService: DependencyManagementService;

  constructor(options: {
    pathManager: Pick<
      PathManager,
      | 'getRuntimeProgramHome'
      | 'getRuntimeDataHome'
      | 'getUserDataPath'
      | 'getManagedServerProgramHome'
      | 'getManagedServerDataHome'
      | 'getCodeServerRuntimeDataHome'
      | 'getCodeServerRuntimeRoot'
      | 'getOmniRouteRuntimeDataHome'
      | 'getOmniRouteRuntimeRoot'
      | 'getEmbeddedRuntimeContainerRoot'
      | 'getEmbeddedRuntimeRoot'
      | 'getCurrentPlatform'
    >;
    dependencyManagementService: DependencyManagementService;
  }) {
    this.pathManager = options.pathManager;
    this.dependencyManagementService = options.dependencyManagementService;
  }

  async resolve(input: ResolveHagiscriptRuntimeContextInput): Promise<HagiscriptRuntimeContext> {
    const shared = await this.resolveSharedContext();
    const activeRuntimeRoot = path.resolve(input.activeRuntime.rootPath);
    const activeVersion = input.activeRuntime.versionId?.trim() || path.basename(activeRuntimeRoot);
    const serviceWorkingDirectory = path.resolve(input.serviceWorkingDirectory);
    const aliasedServiceWorkingDirectory = await ensureNoSpacePathAlias(
      serviceWorkingDirectory,
      'desktop-service-working-directory',
    );
    const serviceDataHome = shared.serverDataRoot;
    const pm2Home = path.join(serviceDataHome, DESKTOP_HAGISCRIPT_SERVER_PM2_HOME_DIR);
    const pm2LogsDirectory = path.join(pm2Home, 'logs');
    const runtimeFilesDir = path.join(serviceDataHome, DESKTOP_HAGISCRIPT_SERVER_RUNTIME_FILES_DIR);
    const manifestDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-desktop-hagiscript-server-'));
    const manifestPath = path.join(manifestDirectory, 'runtime-override.yml');
    const versionsStatePath = path.join(serviceDataHome, DESKTOP_HAGISCRIPT_SERVER_VERSION_STATE_FILE);
    const servicePayloadPath = path.join(
      aliasedServiceWorkingDirectory,
      path.basename(path.resolve(input.servicePayloadPath)),
    );

    await Promise.all([
      fs.mkdir(serviceDataHome, { recursive: true }),
      fs.mkdir(pm2Home, { recursive: true }),
      fs.mkdir(pm2LogsDirectory, { recursive: true }),
      fs.mkdir(runtimeFilesDir, { recursive: true }),
    ]);
    await fs.writeFile(
      versionsStatePath,
      `${JSON.stringify(
        buildDesktopManagedServerVersionState({
          activeVersion,
          installPath: activeRuntimeRoot,
        }),
        null,
        2,
      )}\n`,
      'utf8',
    );
    await fs.writeFile(
      manifestPath,
      dump(
        buildDesktopHagiscriptRuntimeManifest({
          runtimeRoot: shared.runtimeRoot,
          runtimeHome: shared.runtimeHome,
          runtimeDataRoot: shared.runtimeDataRoot,
          serverProgramRoot: shared.serverProgramRoot,
          serverDataRoot: shared.serverDataRoot,
          npmPrefix: shared.npmPrefix,
          hagiscriptPackageRoot: shared.hagiscriptPackageRoot,
          dotnetRuntimeRoot: shared.dotnetRuntimeRoot,
          server: {
            servicePayloadPath,
            serviceWorkingDirectory: aliasedServiceWorkingDirectory,
            serviceEnv: input.serviceEnv ?? {},
            activeVersion,
          },
        }),
        { noRefs: true, lineWidth: 120 },
      ),
      'utf8',
    );

    return {
      serviceName: 'server',
      activeRuntime: input.activeRuntime,
      hagiscriptExecutablePath: shared.hagiscriptExecutablePath,
      hagiscriptPackageRoot: shared.hagiscriptPackageRoot,
      commandEnv: shared.commandEnv,
      runtimeRoot: shared.runtimeRoot,
      runtimeHome: shared.runtimeHome,
      runtimeDataRoot: shared.runtimeDataRoot,
      runtimeLogsDirectory: shared.runtimeLogsDirectory,
      runtimeStateFilePath: shared.runtimeStateFilePath,
      serviceDataHome,
      pm2Home,
      pm2LogsDirectory,
      runtimeFilesDir,
      manifestPath,
      manifestDirectory,
      appName: resolveDesktopManagedPm2AppName(DESKTOP_HAGISCRIPT_SERVER_BASE_APP_NAME),
      servicePayloadPath,
      serviceWorkingDirectory: aliasedServiceWorkingDirectory,
      cleanup: async () => {
        await fs.rm(manifestDirectory, { recursive: true, force: true });
      },
    };
  }

  async resolveBundledRuntime(input: HagiscriptBundledRuntimeContextInput): Promise<HagiscriptRuntimeContext> {
    const shared = await this.resolveSharedContext();
    const serviceDataHome = input.service === 'omniroute'
      ? path.resolve(this.pathManager.getOmniRouteRuntimeDataHome())
      : path.resolve(this.pathManager.getCodeServerRuntimeDataHome());
    const pm2MajorVersion = extractPm2MajorVersion(null);
    const pm2Home = path.join(serviceDataHome, 'pm2', pm2MajorVersion);
    const runtimeFilesDir = path.join(serviceDataHome, 'runtime');
    const pm2LogsDirectory = path.join(pm2Home, 'logs');
    const componentBaseAppName = input.service === 'omniroute'
      ? DESKTOP_HAGISCRIPT_OMNIROUTE_BASE_APP_NAME
      : DESKTOP_HAGISCRIPT_CODE_SERVER_BASE_APP_NAME;
    const manifestDirectory = await fs.mkdtemp(path.join(os.tmpdir(), `hagicode-desktop-hagiscript-${input.service}-`));
    const manifestPath = path.join(manifestDirectory, 'runtime-override.yml');
    const launchScriptPath = input.launchScriptPath
      ? await ensureNoSpacePathAlias(
          path.resolve(input.launchScriptPath),
          `desktop-${input.service}-script`,
        )
      : null;
    const launchWorkingDirectory = input.launchWorkingDirectory
      ? await ensureNoSpacePathAlias(
          path.resolve(input.launchWorkingDirectory),
          `desktop-${input.service}-working-directory`,
        )
      : null;

    await Promise.all([
      fs.mkdir(serviceDataHome, { recursive: true }),
      fs.mkdir(pm2Home, { recursive: true }),
      fs.mkdir(pm2LogsDirectory, { recursive: true }),
      fs.mkdir(runtimeFilesDir, { recursive: true }),
    ]);

    const pm2Override: {
      appName: string;
      args?: string[];
      env: Record<string, string>;
      pm2Home: string;
      cwd?: string;
      script?: string;
    } = {
      appName: componentBaseAppName,
      env: normalizeStringEnv(input.serviceEnv ?? {}),
      pm2Home,
    };

    if (input.launchArgs && input.launchArgs.length > 0) {
      pm2Override.args = input.launchArgs;
    }
    if (launchWorkingDirectory) {
      pm2Override.cwd = launchWorkingDirectory;
    }
    if (launchScriptPath) {
      pm2Override.script = launchScriptPath;
    }

    const manifest = buildDesktopHagiscriptRuntimeManifest({
      runtimeRoot: shared.runtimeRoot,
      runtimeHome: shared.runtimeHome,
      runtimeDataRoot: shared.runtimeDataRoot,
      serverProgramRoot: shared.serverProgramRoot,
      serverDataRoot: shared.serverDataRoot,
      npmPrefix: shared.npmPrefix,
      hagiscriptPackageRoot: shared.hagiscriptPackageRoot,
      dotnetRuntimeRoot: shared.dotnetRuntimeRoot,
      bundledRuntimeOverrides: {
        [input.service]: {
          pm2: {
            ...pm2Override,
          },
        },
      },
    });

    await fs.writeFile(
      manifestPath,
      dump(manifest, { noRefs: true, lineWidth: 120 }),
      'utf8',
    );

    return {
      serviceName: input.service,
      activeRuntime: {
        kind: 'portable-fixed',
        rootPath: input.service === 'omniroute'
          ? this.pathManager.getOmniRouteRuntimeRoot()
          : this.pathManager.getCodeServerRuntimeRoot(),
        versionLabel: input.service,
        displayName: input.service,
        isReadOnly: true,
      },
      hagiscriptExecutablePath: shared.hagiscriptExecutablePath,
      hagiscriptPackageRoot: shared.hagiscriptPackageRoot,
      commandEnv: shared.commandEnv,
      runtimeRoot: shared.runtimeRoot,
      runtimeHome: shared.runtimeHome,
      runtimeDataRoot: shared.runtimeDataRoot,
      runtimeLogsDirectory: shared.runtimeLogsDirectory,
      runtimeStateFilePath: shared.runtimeStateFilePath,
      serviceDataHome,
      pm2Home,
      pm2LogsDirectory,
      runtimeFilesDir,
      manifestPath,
      manifestDirectory,
      appName: resolveDesktopManagedPm2AppName(componentBaseAppName),
      servicePayloadPath: launchScriptPath ?? (
        input.service === 'omniroute'
          ? this.pathManager.getOmniRouteRuntimeRoot()
          : this.pathManager.getCodeServerRuntimeRoot()
      ),
      serviceWorkingDirectory: launchWorkingDirectory ?? (
        input.service === 'omniroute'
          ? this.pathManager.getOmniRouteRuntimeRoot()
          : this.pathManager.getCodeServerRuntimeRoot()
      ),
      cleanup: async () => {
        await fs.rm(manifestDirectory, { recursive: true, force: true });
      },
    };
  }

  private async resolveSharedContext(): Promise<{
    hagiscriptExecutablePath: string;
    hagiscriptPackageRoot: string;
    commandEnv: NodeJS.ProcessEnv;
    runtimeRoot: string;
    runtimeHome: string;
    runtimeDataRoot: string;
    runtimeLogsDirectory: string;
    runtimeStateFilePath: string;
    serverProgramRoot: string;
    serverDataRoot: string;
    npmPrefix: string;
    dotnetRuntimeRoot: string;
  }> {
    const hagiscriptContext = await this.dependencyManagementService.getManagedCommandContext('hagiscript');
    const packageStatus = hagiscriptContext.packageStatus;
    const hagiscriptExecutablePath = hagiscriptContext.executablePath;
    const hagiscriptPackageRoot = packageStatus?.packageRoot ?? null;

    if (packageStatus?.status !== 'installed' || !hagiscriptExecutablePath || !hagiscriptPackageRoot) {
      throw new Error('Desktop managed hagiscript is unavailable. Install or repair hagiscript in Dependency Management first.');
    }

    const runtimeHome = path.resolve(this.pathManager.getRuntimeProgramHome());
    const runtimeDataRoot = path.resolve(this.pathManager.getRuntimeDataHome());
    const runtimeRoot = path.resolve(this.pathManager.getUserDataPath());
    const serverProgramRoot = path.resolve(this.pathManager.getManagedServerProgramHome());
    const serverDataRoot = path.resolve(this.pathManager.getManagedServerDataHome());
    const aliasedRuntimeHome = await ensureNoSpacePathAlias(runtimeHome, 'desktop-runtime-home');
    const aliasedRuntimeRoot = await ensureNoSpacePathAlias(runtimeRoot, 'desktop-runtime-root');
    const dotnetRuntimeRoot = path.resolve(this.pathManager.getEmbeddedRuntimeContainerRoot(this.pathManager.getCurrentPlatform()));
    const aliasedDotnetRuntimeRoot = await ensureNoSpacePathAlias(dotnetRuntimeRoot, 'desktop-dotnet-runtime-root');

    return {
      hagiscriptExecutablePath,
      hagiscriptPackageRoot,
      commandEnv: hagiscriptContext.commandEnv,
      runtimeRoot: aliasedRuntimeRoot,
      runtimeHome: aliasedRuntimeHome,
      runtimeDataRoot,
      runtimeLogsDirectory: path.join(runtimeDataRoot, 'logs'),
      runtimeStateFilePath: path.join(runtimeDataRoot, 'state.json'),
      serverProgramRoot,
      serverDataRoot,
      npmPrefix: path.resolve(hagiscriptContext.environment.npmGlobalPrefix),
      dotnetRuntimeRoot: aliasedDotnetRuntimeRoot,
    };
  }
}

function normalizeStringEnv(serviceEnv: NodeJS.ProcessEnv): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(serviceEnv)) {
    if (typeof value === 'string' && key.trim().length > 0) {
      normalized[key] = value;
    }
  }

  return normalized;
}
