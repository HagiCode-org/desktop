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
  nodeVersionMatchesGovernedMajor,
  readPinnedNodeRuntimeConfig,
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
    `Install ${packageRecord.installSpec} into ${path.join(toolchainRoot, 'npm-global')} and refresh dependency status.`,
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

  async readToolchainManifest(): Promise<BundledToolchainManifest | null> {
    const manifestPath = this.getManifestPath();
    try {
      const raw = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      const manifest = normalizeManifest(raw);
      if (!manifest) {
        log.warn('[BundledNodeRuntimeManager] Ignoring invalid bundled toolchain manifest:', manifestPath);
      }
      return manifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        log.warn('[BundledNodeRuntimeManager] Failed to read bundled toolchain manifest:', manifestPath, error);
      }
      return null;
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
    const manifestPath = this.getManifestPath();
    const runtimeManifestPath = this.pathManager.getEmbeddedNodeRuntimeManifestPath();
    const manifest = await this.readToolchainManifest();
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
      errors.push(`${TOOLCHAIN_MANIFEST_FILE} is missing or invalid`);
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
      componentErrors.push(`${TOOLCHAIN_MANIFEST_FILE} is missing or invalid`);
    }
    if (!commandRelativePath) {
      componentErrors.push(`${componentId} command is not declared in ${TOOLCHAIN_MANIFEST_FILE}`);
    }
    if (executablePath && !fsSync.existsSync(executablePath)) {
      componentErrors.push(`${componentId} executable is missing at ${executablePath}`);
    }
    if (executablePath && requiresExecutableBit(process.platform) && !isExecutable(executablePath)) {
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
      componentErrors.push(`${TOOLCHAIN_MANIFEST_FILE} is missing or invalid`);
    }
    if (!packageRecord) {
      componentErrors.push(`${componentId} package is not declared in ${TOOLCHAIN_MANIFEST_FILE}`);
    }
    if (configuredPackage && packageRecord && packageRecord.version !== configuredPackage.version) {
      componentErrors.push(`${componentId} package expected ${configuredPackage.version} but found ${packageRecord.version || 'missing'}`);
    }
    if (packageRecord && packageRecord.installMode !== (configuredPackage.installMode || 'manual')) {
      componentErrors.push(`${componentId} installMode expected ${configuredPackage.installMode || 'manual'} but found ${packageRecord.installMode || 'missing'}`);
    }
    if (packageRecord && !packageRecord.installSpec) {
      componentErrors.push(`${componentId} installSpec is missing from ${TOOLCHAIN_MANIFEST_FILE}`);
    }
    if (packageRecord && !packageRecord.manualActionId) {
      componentErrors.push(`${componentId} manualActionId is missing from ${TOOLCHAIN_MANIFEST_FILE}`);
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
