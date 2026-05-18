import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import log from 'electron-log';
import { PathManager } from './path-manager.js';
import {
  TOOLCHAIN_MANIFEST_FILE,
  detectNodeRuntimePlatform,
  getCommandExecutableName,
  getGovernedNodeRuntimeMajor,
  getNpmGlobalBinRelativePath,
  getNpmGlobalModulesRelativePath,
  getNodeExecutableRelativePath,
  nodeVersionMatchesGovernedMajor,
  readPinnedNodeRuntimeConfig,
  resolveExistingNpmExecutableRelativePath,
  resolvePinnedNodeRuntimeTarget,
  type EmbeddedNodeRuntimeConsumerDefaultMatrix,
  type EmbeddedNodeRuntimeConfig,
} from './embedded-node-runtime-config.js';
import {
  resolveDesktopBundledNodeRuntimePolicyFromEnv,
  type BundledNodeRuntimePolicyDecision,
} from './bundled-node-runtime-policy.js';

export type BundledToolchainComponentId = 'node' | 'npm' | 'openspec' | 'skills' | 'omniroute';
export type BundledToolchainIntegrity = 'ok' | 'missing' | 'corrupt' | 'incompatible' | 'pending';
export type BundledToolchainRemediation = 'none' | 'reinstall-desktop' | 'update-desktop';
export type BundledToolchainPrimaryAction = BundledToolchainRemediation | 'manual-install';
export type BundledToolchainInstallMode = 'manual' | 'auto';
export type BundledToolchainInstallState = 'pending' | 'installed';

export interface BundledToolchainManifestPackage {
  packageName: string;
  version: string;
  integrity?: string;
  binName: string;
  aliases?: string[];
  installMode: BundledToolchainInstallMode;
  installState: BundledToolchainInstallState;
  installSpec: string;
  manualActionId: string;
  packageRootRelativePath?: string;
  cliScriptRelativePath?: string;
  commandArtifacts?: string[];
}

export interface BundledToolchainManifest {
  schemaVersion: number;
  layoutVersion: number;
  owner: 'hagicode-desktop';
  source: 'bundled-desktop';
  platform: string;
  defaultEnabledByConsumer?: EmbeddedNodeRuntimeConsumerDefaultMatrix;
  stagedAt: string;
  portableFixedRoot: string;
  toolchainRoot: string;
  node: {
    version: string;
    channelVersion: string;
    releaseDate: string;
    provider: string;
    releaseMetadataUrl: string;
    allowedDownloadHosts: string[];
    downloadUrl: string;
    sourceHost: string;
    archiveName: string;
    archiveType: string;
    archivePath: string;
    checksumSha256: string;
    extractRoot: string;
    executableRelativePath: string;
    npmExecutableRelativePath: string;
    archiveNpmExecutableRelativePath?: string;
  };
  packages: Record<string, BundledToolchainManifestPackage>;
  commands: Partial<Record<BundledToolchainComponentId | string, string>>;
  activation?: string[];
}

export interface BundledToolchainComponentStatus {
  componentId: BundledToolchainComponentId;
  installed: boolean;
  version?: string;
  requiredVersion?: string;
  resolutionSource: 'bundled-desktop';
  sourcePath: string;
  executablePath?: string;
  manifestPath: string;
  integrity: BundledToolchainIntegrity;
  primaryAction: BundledToolchainPrimaryAction;
  message?: string;
  installMode?: BundledToolchainInstallMode;
  installState?: BundledToolchainInstallState;
  installSpec?: string;
  manualActionId?: string;
  managedByDesktop?: boolean;
}

export interface BundledToolchainStatus {
  available: boolean;
  integrity: BundledToolchainIntegrity;
  platform: string;
  toolchainRoot: string;
  manifestPath: string;
  runtimeManifestPath: string;
  manifest?: BundledToolchainManifest;
  components: Record<BundledToolchainComponentId, BundledToolchainComponentStatus>;
  missingEntries: string[];
  errors: string[];
  remediation: BundledToolchainRemediation;
  activationPolicy: BundledNodeRuntimePolicyDecision;
  activeForDesktop: boolean;
}

const COMPONENTS: BundledToolchainComponentId[] = ['node', 'npm', 'openspec', 'skills', 'omniroute'];
const RUNTIME_COMPONENTS: BundledToolchainComponentId[] = ['node', 'npm'];
function isExecutable(targetPath: string): boolean {
  try {
    fsSync.accessSync(targetPath, fsSync.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function requiresExecutableBit(platform: NodeJS.Platform): boolean {
  return platform !== 'win32';
}

function normalizeManifest(raw: unknown): BundledToolchainManifest | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const manifest = raw as Partial<BundledToolchainManifest>;
  if (manifest.owner !== 'hagicode-desktop' || manifest.source !== 'bundled-desktop') {
    return null;
  }

  return manifest as BundledToolchainManifest;
}

function toBundledToolchainManifestPackage(
  packageConfig: EmbeddedNodeRuntimeConfig['corePackages'][string],
): BundledToolchainManifestPackage {
  return {
    packageName: packageConfig.packageName,
    version: packageConfig.version,
    integrity: packageConfig.integrity,
    binName: packageConfig.binName,
    aliases: packageConfig.aliases,
    installMode: packageConfig.installMode ?? 'manual',
    installState: packageConfig.installState ?? 'pending',
    installSpec: packageConfig.installSpec ?? `${packageConfig.packageName}@${packageConfig.version}`,
    manualActionId: packageConfig.manualActionId ?? 'install-bundled-node-cli',
  };
}

function resolveManagedPackageRoot(
  toolchainRoot: string,
  packageName: string,
  platform: string,
): string {
  return path.join(
    toolchainRoot,
    getNpmGlobalModulesRelativePath(platform),
    ...packageName.split('/').filter(Boolean),
  );
}

function resolveManagedCommandCandidates(
  toolchainRoot: string,
  packageRecord: BundledToolchainManifestPackage,
  platform: string,
): string[] {
  const npmGlobalBinRoot = path.join(toolchainRoot, getNpmGlobalBinRelativePath(platform));
  const executableName = getCommandExecutableName(platform, packageRecord.binName);
  const legacyExecutableName = getCommandExecutableName(platform, packageRecord.binName);

  return [
    path.join(npmGlobalBinRoot, executableName),
    path.join(toolchainRoot, 'bin', legacyExecutableName),
  ];
}

function describePendingManualInstall(
  packageRecord: BundledToolchainManifestPackage,
  toolchainRoot: string,
): string {
  return [
    `Bundled Node.js and npm are ready, but ${packageRecord.binName} is pending manual installation.`,
    `Install ${packageRecord.installSpec} into ${toolchainRoot} and refresh dependency status.`,
  ].join(' ');
}

async function readInstalledPackageVersion(packageRoot: string): Promise<string | null> {
  try {
    const packageJson = JSON.parse(await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8')) as { version?: string };
    return typeof packageJson.version === 'string' ? packageJson.version : null;
  } catch {
    return null;
  }
}

export class BundledNodeRuntimeManager {
  private readonly pathManager: PathManager;
  private readonly runtimeConfig: EmbeddedNodeRuntimeConfig;

  constructor(pathManager: PathManager = PathManager.getInstance(), runtimeConfig = readPinnedNodeRuntimeConfig()) {
    this.pathManager = pathManager;
    this.runtimeConfig = runtimeConfig;
  }

  getToolchainRoot(): string {
    return this.pathManager.getPortableToolchainRoot();
  }

  getManifestPath(): string {
    return this.pathManager.getPortableToolchainManifestPath();
  }

  private buildSyntheticToolchainManifest(toolchainRoot: string, platform: string): BundledToolchainManifest | null {
    const nodeExecutableRelativePath = getNodeExecutableRelativePath(platform);
    const nodeExecutablePath = path.join(toolchainRoot, nodeExecutableRelativePath);
    if (!fsSync.existsSync(nodeExecutablePath)) {
      return null;
    }

    const npmExecutableRelativePath = resolveExistingNpmExecutableRelativePath(toolchainRoot, platform, fsSync.existsSync);
    let runtimeTarget: ReturnType<typeof resolvePinnedNodeRuntimeTarget> | null = null;
    try {
      runtimeTarget = resolvePinnedNodeRuntimeTarget(platform, this.runtimeConfig);
    } catch {
      runtimeTarget = null;
    }

    return {
      schemaVersion: this.runtimeConfig.schemaVersion,
      layoutVersion: this.runtimeConfig.layoutVersion,
      owner: 'hagicode-desktop',
      source: 'bundled-desktop',
      platform,
      defaultEnabledByConsumer: { ...(this.runtimeConfig.defaultEnabledByConsumer ?? {}) },
      stagedAt: new Date(0).toISOString(),
      portableFixedRoot: path.resolve(toolchainRoot, '..', '..', '..'),
      toolchainRoot,
      node: {
        version: this.runtimeConfig.releaseVersion,
        channelVersion: this.runtimeConfig.channelVersion,
        releaseDate: this.runtimeConfig.releaseDate,
        provider: this.runtimeConfig.source.provider,
        releaseMetadataUrl: this.runtimeConfig.source.releaseMetadataUrl,
        allowedDownloadHosts: this.runtimeConfig.source.allowedDownloadHosts,
        downloadUrl: runtimeTarget?.downloadUrl ?? '',
        sourceHost: runtimeTarget ? new URL(runtimeTarget.downloadUrl).hostname : '',
        archiveName: runtimeTarget?.archiveName ?? '',
        archiveType: runtimeTarget?.archiveType ?? '',
        archivePath: '',
        checksumSha256: runtimeTarget?.checksumSha256 ?? '',
        extractRoot: runtimeTarget?.extractRoot ?? '',
        executableRelativePath: nodeExecutableRelativePath,
        npmExecutableRelativePath,
      },
      packages: Object.fromEntries(
        Object.entries(this.runtimeConfig.corePackages).map(([packageId, packageConfig]) => [
          packageId,
          toBundledToolchainManifestPackage(packageConfig),
        ]),
      ),
      commands: {
        node: nodeExecutableRelativePath,
        npm: npmExecutableRelativePath,
      },
    };
  }

  async readToolchainManifest(): Promise<BundledToolchainManifest | null> {
    const manifestPath = this.getManifestPath();
    const toolchainRoot = this.getToolchainRoot();
    const platform = detectNodeRuntimePlatform();
    try {
      const raw = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      const manifest = normalizeManifest(raw);
      if (!manifest) {
        const syntheticManifest = this.buildSyntheticToolchainManifest(toolchainRoot, platform);
        if (syntheticManifest) {
          log.info('[BundledNodeRuntimeManager] Falling back to synthesized native hagiscript Node metadata:', toolchainRoot);
          return syntheticManifest;
        }
        log.warn('[BundledNodeRuntimeManager] Ignoring invalid bundled toolchain manifest:', manifestPath);
      }
      return manifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.warn('[BundledNodeRuntimeManager] Failed to read bundled toolchain manifest:', manifestPath, error);
      }
      return this.buildSyntheticToolchainManifest(toolchainRoot, platform);
    }
  }

  resolveDesktopActivationPolicy(manifest: BundledToolchainManifest | null): BundledNodeRuntimePolicyDecision {
    return resolveDesktopBundledNodeRuntimePolicyFromEnv(
      manifest?.defaultEnabledByConsumer ?? this.runtimeConfig.defaultEnabledByConsumer,
    );
  }

  async getDesktopActivationPolicy(): Promise<BundledNodeRuntimePolicyDecision> {
    return this.resolveDesktopActivationPolicy(await this.readToolchainManifest());
  }

  async verify(): Promise<BundledToolchainStatus> {
    const platform = detectNodeRuntimePlatform();
    const toolchainRoot = this.getToolchainRoot();
    const runtimeManifestPath = this.pathManager.getEmbeddedNodeRuntimeManifestPath();
    const manifest = await this.readToolchainManifest();
    const manifestPath = fsSync.existsSync(this.getManifestPath()) ? this.getManifestPath() : runtimeManifestPath;
    const activationPolicy = this.resolveDesktopActivationPolicy(manifest);
    const missingEntries: string[] = [];
    const errors: string[] = [];

    let target;
    try {
      target = resolvePinnedNodeRuntimeTarget(platform, this.runtimeConfig);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    if (!manifest) {
      errors.push('bundled Node runtime metadata is missing or invalid');
    } else {
      if (manifest.schemaVersion !== this.runtimeConfig.schemaVersion) {
        errors.push(`toolchain schema version expected ${this.runtimeConfig.schemaVersion} but found ${manifest.schemaVersion || 'missing'}`);
      }
      if (manifest.platform !== platform) {
        errors.push(`toolchain platform expected ${platform} but found ${manifest.platform || 'missing'}`);
      }
      if (manifest.layoutVersion !== this.runtimeConfig.layoutVersion) {
        errors.push(`layout version expected ${this.runtimeConfig.layoutVersion} but found ${manifest.layoutVersion || 'missing'}`);
      }
      if (!nodeVersionMatchesGovernedMajor(manifest.node?.version, this.runtimeConfig)) {
        errors.push(`Node major version expected ${getGovernedNodeRuntimeMajor(this.runtimeConfig)} but found ${manifest.node?.version || 'missing'}`);
      }
      if (target && manifest.node?.checksumSha256 !== target.checksumSha256) {
        errors.push('Node archive checksum metadata does not match the pinned runtime manifest');
      }
    }

    const components = {} as Record<BundledToolchainComponentId, BundledToolchainComponentStatus>;
    for (const componentId of COMPONENTS) {
      const status = componentId === 'node' || componentId === 'npm'
        ? this.buildRuntimeComponentStatus(componentId, manifest, manifestPath, toolchainRoot, errors)
        : await this.buildManagedPackageComponentStatus(componentId, manifest, manifestPath, toolchainRoot, platform, errors);
      components[componentId] = status;
      if (status.integrity !== 'ok' && status.integrity !== 'pending') {
        missingEntries.push(componentId);
      }
    }

    const available = errors.length === 0 && RUNTIME_COMPONENTS.every((componentId) => components[componentId].installed);
    const integrity: BundledToolchainIntegrity = available
      ? 'ok'
      : manifest
        ? 'corrupt'
        : 'missing';

    return {
      available,
      integrity,
      platform,
      toolchainRoot,
      manifestPath,
      runtimeManifestPath,
      manifest: manifest ?? undefined,
      components,
      missingEntries,
      errors,
      remediation: available ? 'none' : 'reinstall-desktop',
      activationPolicy,
      activeForDesktop: activationPolicy.enabled,
    };
  }

  private buildRuntimeComponentStatus(
    componentId: 'node' | 'npm',
    manifest: BundledToolchainManifest | null,
    manifestPath: string,
    toolchainRoot: string,
    sharedErrors: string[],
  ): BundledToolchainComponentStatus {
    const commandRelativePath = manifest?.commands?.[componentId];
    const executablePath = commandRelativePath ? path.join(toolchainRoot, commandRelativePath) : undefined;
    const componentErrors: string[] = [];

    if (!manifest) {
      componentErrors.push('bundled Node runtime metadata is missing or invalid');
    }
    if (!commandRelativePath) {
      componentErrors.push(`${componentId} command is not declared in bundled Node runtime metadata`);
    }
    if (executablePath && !fsSync.existsSync(executablePath)) {
      componentErrors.push(`${componentId} executable is missing at ${executablePath}`);
    }
    if (componentId === 'node' && executablePath && requiresExecutableBit(process.platform) && !isExecutable(executablePath)) {
      componentErrors.push(`${componentId} executable is not executable at ${executablePath}`);
    }

    const installed = sharedErrors.length === 0 && componentErrors.length === 0;

    return {
      componentId,
      installed,
      version: manifest?.node?.version,
      requiredVersion: getGovernedNodeRuntimeMajor(this.runtimeConfig),
      resolutionSource: 'bundled-desktop',
      sourcePath: toolchainRoot,
      executablePath,
      manifestPath,
      integrity: installed ? 'ok' : manifest ? 'corrupt' : 'missing',
      primaryAction: installed ? 'none' : 'reinstall-desktop',
      message: componentErrors.join('; ') || undefined,
      managedByDesktop: true,
    };
  }

  private async buildManagedPackageComponentStatus(
    componentId: Exclude<BundledToolchainComponentId, 'node' | 'npm'>,
    manifest: BundledToolchainManifest | null,
    manifestPath: string,
    toolchainRoot: string,
    platform: string,
    sharedErrors: string[],
  ): Promise<BundledToolchainComponentStatus> {
    const configuredPackage = this.runtimeConfig.corePackages[componentId];
    const packageRecord = manifest?.packages?.[componentId];
    const componentErrors: string[] = [];

    if (!manifest) {
      componentErrors.push('bundled Node runtime metadata is missing or invalid');
    }
    if (!packageRecord) {
      componentErrors.push(`${componentId} package is not declared in bundled Node runtime metadata`);
    }
    if (configuredPackage && packageRecord && packageRecord.version !== configuredPackage.version) {
      componentErrors.push(`${componentId} package expected ${configuredPackage.version} but found ${packageRecord.version || 'missing'}`);
    }
    if (packageRecord && packageRecord.installMode !== (configuredPackage.installMode || 'manual')) {
      componentErrors.push(`${componentId} installMode expected ${configuredPackage.installMode || 'manual'} but found ${packageRecord.installMode || 'missing'}`);
    }
    if (packageRecord && !packageRecord.installSpec) {
      componentErrors.push(`${componentId} installSpec is missing from bundled Node runtime metadata`);
    }
    if (packageRecord && !packageRecord.manualActionId) {
      componentErrors.push(`${componentId} manualActionId is missing from bundled Node runtime metadata`);
    }

    const packageRoot = packageRecord
      ? resolveManagedPackageRoot(toolchainRoot, packageRecord.packageName, platform)
      : undefined;
    const installedPackageVersion = packageRoot ? await readInstalledPackageVersion(packageRoot) : null;
    const executablePath = packageRecord
      ? resolveManagedCommandCandidates(toolchainRoot, packageRecord, platform).find((candidate) => fsSync.existsSync(candidate))
      : undefined;

    if (packageRoot && fsSync.existsSync(packageRoot) && executablePath && sharedErrors.length === 0 && componentErrors.length === 0) {
      if (installedPackageVersion && installedPackageVersion !== configuredPackage.version) {
        componentErrors.push(`${componentId} installed package version expected ${configuredPackage.version} but found ${installedPackageVersion}`);
      }

      if (componentErrors.length === 0) {
        return {
          componentId,
          installed: true,
          version: installedPackageVersion ?? packageRecord?.version,
          requiredVersion: configuredPackage.version,
          resolutionSource: 'bundled-desktop',
          sourcePath: toolchainRoot,
          executablePath,
          manifestPath,
          integrity: 'ok',
          primaryAction: 'none',
          installMode: packageRecord?.installMode,
          installState: 'installed',
          installSpec: packageRecord?.installSpec,
          manualActionId: packageRecord?.manualActionId,
          managedByDesktop: true,
        };
      }
    }

    if (sharedErrors.length === 0 && componentErrors.length === 0 && packageRecord) {
      return {
        componentId,
        installed: false,
        version: packageRecord.version,
        requiredVersion: configuredPackage.version,
        resolutionSource: 'bundled-desktop',
        sourcePath: toolchainRoot,
        executablePath,
        manifestPath,
        integrity: 'pending',
        primaryAction: 'manual-install',
        message: describePendingManualInstall(packageRecord, toolchainRoot),
        installMode: packageRecord.installMode,
        installState: packageRecord.installState,
        installSpec: packageRecord.installSpec,
        manualActionId: packageRecord.manualActionId,
        managedByDesktop: true,
      };
    }

    return {
      componentId,
      installed: false,
      version: installedPackageVersion ?? packageRecord?.version,
      requiredVersion: configuredPackage?.version,
      resolutionSource: 'bundled-desktop',
      sourcePath: toolchainRoot,
      executablePath,
      manifestPath,
      integrity: manifest ? 'corrupt' : 'missing',
      primaryAction: componentRecordNeedsManualInstall(componentErrors, packageRecord) ? 'manual-install' : 'reinstall-desktop',
      message: componentErrors.join('; ') || undefined,
      installMode: packageRecord?.installMode,
      installState: packageRecord?.installState,
      installSpec: packageRecord?.installSpec,
      manualActionId: packageRecord?.manualActionId,
      managedByDesktop: true,
    };
  }
}

function componentRecordNeedsManualInstall(
  componentErrors: string[],
  packageRecord: BundledToolchainManifestPackage | undefined,
): boolean {
  return packageRecord !== undefined
    && componentErrors.every((error) => !error.includes('missing or invalid'))
    && packageRecord.installMode === 'manual';
}
