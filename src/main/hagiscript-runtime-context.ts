import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { DependencyManagementService } from './dependency-management-service.js';
import { ensureNoSpacePathAlias } from './pm2-home-alias.js';
import type { PathManager } from './path-manager.js';
import type { ActiveRuntimeDescriptor } from '../types/distribution-mode.js';

const SERVER_SERVICE_NAME = 'server';
const SERVER_RUNTIME_DATA_DIR = path.join('services', SERVER_SERVICE_NAME);
const SERVER_PM2_HOME_DIR = '.pm2';
const SERVER_PM2_RUNTIME_DIR = 'pm2-runtime';
const HAGISCRIPT_RUNTIME_SCRIPTS_DIR = path.join('runtime', 'scripts');

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
    const runtimeRoot = path.resolve(input.activeRuntime.rootPath);
    const aliasedRuntimeHome = await ensureNoSpacePathAlias(runtimeHome, 'desktop-runtime-home');
    const aliasedRuntimeRoot = await ensureNoSpacePathAlias(runtimeRoot, 'desktop-active-runtime-root');
    const dotnetRuntimeRoot = path.resolve(this.pathManager.getEmbeddedRuntimeContainerRoot(this.pathManager.getCurrentPlatform()));
    const aliasedDotnetRuntimeRoot = await ensureNoSpacePathAlias(dotnetRuntimeRoot, 'desktop-dotnet-runtime-root');
    const serviceWorkingDirectory = path.resolve(input.serviceWorkingDirectory);
    const aliasedServiceWorkingDirectory = await ensureNoSpacePathAlias(
      serviceWorkingDirectory,
      'desktop-service-working-directory',
    );
    const runtimeLogsDirectory = path.join(runtimeDataRoot, 'logs');
    const runtimeStateFilePath = path.join(runtimeDataRoot, 'state.json');
    const serviceDataHome = path.join(runtimeDataRoot, 'components', SERVER_RUNTIME_DATA_DIR);
    const pm2Home = path.join(serviceDataHome, SERVER_PM2_HOME_DIR);
    const pm2LogsDirectory = path.join(pm2Home, 'logs');
    const runtimeFilesDir = path.join(serviceDataHome, SERVER_PM2_RUNTIME_DIR);
    const manifestDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-desktop-hagiscript-'));
    const manifestPath = path.join(manifestDirectory, 'runtime-override.json');

    await fs.writeFile(
      manifestPath,
      `${JSON.stringify(
        this.buildManifestOverride({
          runtimeRoot: aliasedRuntimeRoot,
          runtimeHome: aliasedRuntimeHome,
          runtimeDataRoot,
          npmPrefix: path.resolve(hagiscriptContext.environment.npmGlobalPrefix),
          hagiscriptPackageRoot,
          dotnetRuntimeRoot: aliasedDotnetRuntimeRoot,
          servicePayloadPath: path.join(
            aliasedServiceWorkingDirectory,
            path.basename(path.resolve(input.servicePayloadPath)),
          ),
          serviceWorkingDirectory: aliasedServiceWorkingDirectory,
          serviceEnv: input.serviceEnv ?? {},
        }),
        null,
        2,
      )}\n`,
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
      servicePayloadPath: path.join(
        aliasedServiceWorkingDirectory,
        path.basename(path.resolve(input.servicePayloadPath)),
      ),
      serviceWorkingDirectory: aliasedServiceWorkingDirectory,
      cleanup: async () => {
        await fs.rm(manifestDirectory, { recursive: true, force: true });
      },
    };
  }

  private buildManifestOverride(input: {
    runtimeRoot: string;
    runtimeHome: string;
    runtimeDataRoot: string;
    npmPrefix: string;
    hagiscriptPackageRoot: string;
    dotnetRuntimeRoot: string;
    servicePayloadPath: string;
    serviceWorkingDirectory: string;
    serviceEnv: NodeJS.ProcessEnv;
  }) {
    const serverScriptsRoot = path.join(input.hagiscriptPackageRoot, HAGISCRIPT_RUNTIME_SCRIPTS_DIR);

    return {
      runtime: {
        name: 'hagicode-desktop-runtime',
        version: '1.0.0',
      },
      paths: {
        runtimeRoot: input.runtimeRoot,
        runtimeHome: input.runtimeHome,
        runtimeDataRoot: input.runtimeDataRoot,
        bin: path.join(input.runtimeHome, 'bin'),
        config: path.join(input.runtimeDataRoot, 'config'),
        logs: path.join(input.runtimeDataRoot, 'logs'),
        data: path.join(input.runtimeDataRoot, 'data'),
        stateFile: path.join(input.runtimeDataRoot, 'state.json'),
        componentsRoot: path.join(input.runtimeHome, 'components'),
        componentDataRoot: path.join(input.runtimeDataRoot, 'components'),
        defaultPm2Home: 'pm2',
        npmPrefix: input.npmPrefix,
        nodeRuntime: path.join(input.runtimeHome, 'components', 'node', 'runtime'),
        dotnetRuntime: input.dotnetRuntimeRoot,
        vendoredRoot: path.join(input.runtimeHome, 'components', 'bundled'),
      },
      phases: {
        install: { order: [SERVER_SERVICE_NAME] },
        remove: { order: [SERVER_SERVICE_NAME] },
        update: { order: [SERVER_SERVICE_NAME] },
      },
      components: [
        {
          name: SERVER_SERVICE_NAME,
          type: 'released-service',
          runtimeDataDir: SERVER_RUNTIME_DATA_DIR.split(path.sep).join('/'),
          installScript: path.join(serverScriptsRoot, 'install-server.mjs'),
          configureScript: path.join(serverScriptsRoot, 'configure-server.mjs'),
          removeScript: path.join(serverScriptsRoot, 'remove-server.mjs'),
          pm2: {
            appName: 'hagicode-server',
            pm2Home: SERVER_PM2_HOME_DIR,
            env: this.normalizeManifestEnv(input.serviceEnv),
          },
          releasedService: {
            dllPath: input.servicePayloadPath,
            workingDirectory: input.serviceWorkingDirectory,
            configRoot: input.serviceWorkingDirectory,
            runtimeFilesDir: SERVER_PM2_RUNTIME_DIR,
          },
        },
      ],
    };
  }

  private normalizeManifestEnv(serviceEnv: NodeJS.ProcessEnv): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(serviceEnv)) {
      if (typeof value === 'string' && key.trim().length > 0) {
        env[key] = value;
      }
    }

    return env;
  }
}
