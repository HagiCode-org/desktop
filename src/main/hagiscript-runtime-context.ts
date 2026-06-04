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
  DESKTOP_HAGISCRIPT_SERVER_BASE_APP_NAME,
  DESKTOP_HAGISCRIPT_SERVER_VERSION_STATE_FILE,
  resolveDesktopManagedPm2AppName,
} from './hagiscript-desktop-manifest.js';
import { ensureNoSpacePathAlias, ensurePm2HomeAlias } from './pm2-home-alias.js';
import type { PathManager } from './path-manager.js';
import type { ActiveRuntimeDescriptor } from '../types/distribution-mode.js';

export type HagiscriptManagedPm2Service = 'server';

export interface HagiscriptRuntimeContext {
  readonly serviceName: HagiscriptManagedPm2Service;
  readonly activeRuntime: ActiveRuntimeDescriptor;
  readonly dependencyManagementMode?: string;
  readonly externalNodePath: string | null;
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
    const shared = await this.resolveSharedContext();
    const activeRuntimeRoot = path.resolve(input.activeRuntime.rootPath);
    const activeVersion = input.activeRuntime.versionId?.trim() || path.basename(activeRuntimeRoot);
    const serviceWorkingDirectory = path.resolve(input.serviceWorkingDirectory);
    const aliasedServiceWorkingDirectory = await ensureNoSpacePathAlias(
      serviceWorkingDirectory,
      'desktop-service-working-directory',
    );
    const serviceDataHome = shared.serverDataRoot;
    const pm2Home = path.join(shared.runtimeDataRoot, DESKTOP_HAGISCRIPT_SERVER_PM2_HOME_DIR);
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
          // PM2 behaves unreliably on Windows Store paths with spaces, so the
          // manifest uses a stable alias while Desktop diagnostics keep the
          // canonical path for log discovery and user-facing output.
          serverDataRoot: shared.serverDataRootForManifest,
          npmPrefix: shared.npmPrefix,
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
      dependencyManagementMode: shared.dependencyManagementMode,
      externalNodePath: shared.externalNodePath,
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

  private async resolveSharedContext(): Promise<{
    dependencyManagementMode?: string;
    externalNodePath: string | null;
    runtimeRoot: string;
    runtimeHome: string;
    runtimeDataRoot: string;
    runtimeLogsDirectory: string;
    runtimeStateFilePath: string;
    serverProgramRoot: string;
    serverDataRoot: string;
    serverDataRootForManifest: string;
    npmPrefix: string;
    dotnetRuntimeRoot: string;
  }> {
    const managedContext = await this.dependencyManagementService.getManagedCommandContext('pm2');

    const runtimeHome = path.resolve(this.pathManager.getRuntimeProgramHome());
    const runtimeDataRoot = path.resolve(this.pathManager.getRuntimeDataHome());
    const runtimeRoot = path.resolve(this.pathManager.getUserDataPath());
    const serverProgramRoot = path.resolve(this.pathManager.getManagedServerProgramHome());
    const serverDataRoot = path.resolve(this.pathManager.getManagedServerDataHome());
    const aliasedRuntimeHome = await ensureNoSpacePathAlias(runtimeHome, 'desktop-runtime-home');
    const aliasedRuntimeRoot = await ensureNoSpacePathAlias(runtimeRoot, 'desktop-runtime-root');
    const aliasedServerDataRoot = await ensurePm2HomeAlias(serverDataRoot, 'desktop-server-data-root');
    const dotnetRuntimeRoot = path.resolve(this.pathManager.getEmbeddedRuntimeContainerRoot(this.pathManager.getCurrentPlatform()));
    const aliasedDotnetRuntimeRoot = await ensureNoSpacePathAlias(dotnetRuntimeRoot, 'desktop-dotnet-runtime-root');
    const externalNodePath = managedContext.environment.source === 'externally-managed'
      && path.isAbsolute(managedContext.environment.node.executablePath)
      ? path.resolve(managedContext.environment.node.executablePath)
      : null;

    return {
      dependencyManagementMode: managedContext.environment.source === 'externally-managed'
        ? 'external-managed'
        : undefined,
      externalNodePath,
      runtimeRoot: aliasedRuntimeRoot,
      runtimeHome: aliasedRuntimeHome,
      runtimeDataRoot,
      runtimeLogsDirectory: path.join(runtimeDataRoot, 'logs'),
      runtimeStateFilePath: path.join(runtimeDataRoot, 'state.json'),
      serverProgramRoot,
      serverDataRoot,
      serverDataRootForManifest: aliasedServerDataRoot,
      npmPrefix: managedContext.environment.source === 'desktop-managed'
        ? path.resolve(managedContext.environment.npmGlobalPrefix)
        : managedContext.environment.npmGlobalPrefix,
      dotnetRuntimeRoot: aliasedDotnetRuntimeRoot,
    };
  }
}
