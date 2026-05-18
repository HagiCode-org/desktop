import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { dump } from 'js-yaml';
import type { DependencyManagementService } from './dependency-management-service.js';
import {
  buildDesktopHagiscriptRuntimeManifest,
  buildDesktopManagedServerVersionState,
  DESKTOP_HAGISCRIPT_SERVER_PM2_HOME_DIR,
  DESKTOP_HAGISCRIPT_SERVER_RUNTIME_FILES_DIR,
  DESKTOP_HAGISCRIPT_SERVER_VERSION_STATE_FILE,
} from './hagiscript-desktop-manifest.js';
import { ensureNoSpacePathAlias } from './pm2-home-alias.js';
import type { PathManager } from './path-manager.js';
import type { ActiveRuntimeDescriptor } from '../types/distribution-mode.js';

export interface HagiscriptRuntimeContext {
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
    const activeRuntimeRoot = path.resolve(input.activeRuntime.rootPath);
    const activeVersion = input.activeRuntime.versionId?.trim() || path.basename(activeRuntimeRoot);
    const serviceWorkingDirectory = path.resolve(input.serviceWorkingDirectory);
    const aliasedServiceWorkingDirectory = await ensureNoSpacePathAlias(
      serviceWorkingDirectory,
      'desktop-service-working-directory',
    );
    const runtimeLogsDirectory = path.join(runtimeDataRoot, 'logs');
    const runtimeStateFilePath = path.join(runtimeDataRoot, 'state.json');
    const serviceDataHome = serverDataRoot;
    const pm2Home = path.join(serviceDataHome, DESKTOP_HAGISCRIPT_SERVER_PM2_HOME_DIR);
    const pm2LogsDirectory = path.join(pm2Home, 'logs');
    const runtimeFilesDir = path.join(serviceDataHome, DESKTOP_HAGISCRIPT_SERVER_RUNTIME_FILES_DIR);
    const manifestDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-desktop-hagiscript-'));
    const manifestPath = path.join(manifestDirectory, 'runtime-override.yml');
    const versionsStatePath = path.join(serviceDataHome, DESKTOP_HAGISCRIPT_SERVER_VERSION_STATE_FILE);
    const servicePayloadPath = path.join(
      aliasedServiceWorkingDirectory,
      path.basename(path.resolve(input.servicePayloadPath)),
    );

    await fs.mkdir(serviceDataHome, { recursive: true });
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
          runtimeRoot: aliasedRuntimeRoot,
          runtimeHome: aliasedRuntimeHome,
          runtimeDataRoot,
          serverProgramRoot,
          serverDataRoot,
          npmPrefix: path.resolve(hagiscriptContext.environment.npmGlobalPrefix),
          hagiscriptPackageRoot,
          dotnetRuntimeRoot: aliasedDotnetRuntimeRoot,
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
      activeRuntime: input.activeRuntime,
      hagiscriptExecutablePath,
      hagiscriptPackageRoot,
      commandEnv: hagiscriptContext.commandEnv,
      runtimeRoot: aliasedRuntimeRoot,
      runtimeHome: aliasedRuntimeHome,
      runtimeDataRoot,
      runtimeLogsDirectory,
      runtimeStateFilePath,
      serviceDataHome,
      pm2Home,
      pm2LogsDirectory,
      runtimeFilesDir,
      manifestPath,
      manifestDirectory,
      appName: 'hagicode-server',
      servicePayloadPath,
      serviceWorkingDirectory: aliasedServiceWorkingDirectory,
      cleanup: async () => {
        await fs.rm(manifestDirectory, { recursive: true, force: true });
      },
    };
  }
}
