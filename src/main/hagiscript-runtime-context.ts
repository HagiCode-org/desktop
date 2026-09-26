import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dump } from 'js-yaml';
import {
  buildDesktopHagiscriptRuntimeManifest,
  buildDesktopManagedServerVersionState,
  DESKTOP_HAGISCRIPT_SERVER_PM2_HOME_DIR,
  DESKTOP_HAGISCRIPT_SERVER_RUNTIME_FILES_DIR,
  DESKTOP_HAGISCRIPT_SERVER_BASE_APP_NAME,
  DESKTOP_HAGISCRIPT_SERVER_VERSION_STATE_FILE,
  resolveDesktopManagedPm2AppName,
} from './hagiscript-desktop-manifest.js';
import { ensureNoSpacePathAlias } from './pm2-home-alias.js';
import type { PathManager } from './path-manager.js';
import type { ActiveRuntimeDescriptor } from '../types/distribution-mode.js';

export type HagiscriptManagedPm2Service = 'server';

export interface HagiscriptRuntimeContext {
  readonly serviceName: HagiscriptManagedPm2Service;
  readonly activeRuntime: ActiveRuntimeDescriptor;
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
    | 'getBundledRuntimeProgramHome'
    | 'getRuntimeDataHome'
    | 'getUserDataPath'
    | 'getManagedServerProgramHome'
    | 'getEmbeddedRuntimeContainerRoot'
    | 'getEmbeddedRuntimeRoot'
    | 'getCurrentPlatform'
  >;
  constructor(options: {
    pathManager: Pick<
      PathManager,
      | 'getRuntimeProgramHome'
      | 'getBundledRuntimeProgramHome'
      | 'getRuntimeDataHome'
      | 'getUserDataPath'
      | 'getManagedServerProgramHome'
      | 'getEmbeddedRuntimeContainerRoot'
      | 'getEmbeddedRuntimeRoot'
      | 'getCurrentPlatform'
    >;
  }) {
    this.pathManager = options.pathManager;
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
    const pm2Home = path.join(shared.runtimeDataRoot, DESKTOP_HAGISCRIPT_SERVER_PM2_HOME_DIR);
    const serviceDataHome = pm2Home;
    const pm2LogsDirectory = path.join(pm2Home, 'logs');
    const runtimeFilesDir = path.join(pm2Home, DESKTOP_HAGISCRIPT_SERVER_RUNTIME_FILES_DIR);
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
          serverDataRoot: pm2Home,
          npmPrefix: shared.npmPrefix,
          nodeRuntimeRoot: shared.nodeRuntimeRoot ?? undefined,
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
    runtimeRoot: string;
    runtimeHome: string;
    runtimeDataRoot: string;
    runtimeLogsDirectory: string;
    runtimeStateFilePath: string;
    serverProgramRoot: string;
    npmPrefix: string;
    nodeRuntimeRoot: string;
    dotnetRuntimeRoot: string;
  }> {
    const platform = this.pathManager.getCurrentPlatform();
    const nodeExecutableName = platform.startsWith('win-') ? 'node.exe' : path.join('bin', 'node');
    const runtimeHome = path.resolve(this.pathManager.getRuntimeProgramHome());
    const bundledRuntimeHome = path.resolve(this.pathManager.getBundledRuntimeProgramHome());
    const runtimeDataRoot = path.resolve(this.pathManager.getRuntimeDataHome());
    const runtimeRoot = path.resolve(this.pathManager.getUserDataPath());
    const serverProgramRoot = path.resolve(this.pathManager.getManagedServerProgramHome());
    const aliasedRuntimeHome = await ensureNoSpacePathAlias(runtimeHome, 'desktop-runtime-home');
    const aliasedRuntimeRoot = await ensureNoSpacePathAlias(runtimeRoot, 'desktop-runtime-root');
    const dotnetRuntimeRoot = path.resolve(this.pathManager.getEmbeddedRuntimeContainerRoot(this.pathManager.getCurrentPlatform()));
    const aliasedDotnetRuntimeRoot = await ensureNoSpacePathAlias(dotnetRuntimeRoot, 'desktop-dotnet-runtime-root');
    const aliasedBundledRuntimeHome = await ensureNoSpacePathAlias(bundledRuntimeHome, 'desktop-bundled-runtime-home');
    const nodeRuntimeRoot = path.join(aliasedBundledRuntimeHome, 'components', 'node', 'runtime');
    const npmPrefix = path.join(aliasedBundledRuntimeHome, 'npm-pm2');
    await validateDesktopPm2Toolchain(nodeRuntimeRoot, npmPrefix, nodeExecutableName, platform);

    return {
      runtimeRoot: aliasedRuntimeRoot,
      runtimeHome: aliasedRuntimeHome,
      runtimeDataRoot,
      runtimeLogsDirectory: path.join(runtimeDataRoot, 'logs'),
      runtimeStateFilePath: path.join(runtimeDataRoot, 'state.json'),
      serverProgramRoot,
      npmPrefix,
      nodeRuntimeRoot,
      dotnetRuntimeRoot: aliasedDotnetRuntimeRoot,
    };
  }
}

export async function validateDesktopPm2Toolchain(
  nodeRuntimeRoot: string,
  npmPrefix: string,
  nodeExecutableName = process.platform === 'win32' ? 'node.exe' : path.join('bin', 'node'),
  platform: string = process.platform,
): Promise<void> {
  const nodePath = path.join(nodeRuntimeRoot, nodeExecutableName);
  const pm2Root = path.join(
    npmPrefix,
    platform.startsWith('win-') || platform === 'win32' ? 'node_modules' : path.join('lib', 'node_modules'),
    'pm2',
  );
  const requiredFiles = [
    ['Bundled PM2 Node executable', nodePath],
    ['Managed PM2 entrypoint', path.join(pm2Root, 'bin', 'pm2')],
    ['Managed PM2 package manifest', path.join(pm2Root, 'package.json')],
  ] as const;

  for (const [label, targetPath] of requiredFiles) {
    try {
      const stats = await fs.stat(targetPath);
      if (!stats.isFile()) {
        throw new Error(`${label} is not a file: ${targetPath}`);
      }
      if (label === 'Bundled PM2 Node executable' && !platform.startsWith('win-') && platform !== 'win32') {
        await fs.access(targetPath, constants.X_OK);
      }
    } catch {
      throw new Error(`${label} is missing: ${targetPath}`);
    }
  }
}
