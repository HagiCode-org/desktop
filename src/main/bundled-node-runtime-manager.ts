import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import log from 'electron-log';
import { PathManager } from './path-manager.js';
import {
  TOOLCHAIN_MANIFEST_FILE,
  detectNodeRuntimePlatform,
  readPinnedNodeRuntimeConfig,
  resolvePinnedNodeRuntimeTarget,
  type EmbeddedNodeRuntimeConfig,
} from './embedded-node-runtime-config.js';

export type BundledToolchainComponentId = 'node' | 'npm' | 'openspec' | 'skills' | 'omniroute';
export type BundledToolchainIntegrity = 'ok' | 'missing' | 'corrupt' | 'incompatible';
export type BundledToolchainRemediation = 'none' | 'reinstall-desktop' | 'update-desktop';

export interface BundledToolchainManifestPackage {
  packageName: string;
  version: string;
  integrity?: string;
  binName: string;
  aliases?: string[];
  packageRootRelativePath: string;
  cliScriptRelativePath: string;
  commandArtifacts: string[];
}

export interface BundledToolchainManifest {
  schemaVersion: number;
  layoutVersion: number;
  owner: 'hagicode-desktop';
  source: 'bundled-desktop';
  platform: string;
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
  primaryAction: BundledToolchainRemediation;
  message?: string;
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
}

const COMPONENTS: BundledToolchainComponentId[] = ['node', 'npm', 'openspec', 'skills', 'omniroute'];

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

  async verify(): Promise<BundledToolchainStatus> {
    const platform = detectNodeRuntimePlatform();
    const toolchainRoot = this.getToolchainRoot();
    const manifestPath = this.getManifestPath();
    const runtimeManifestPath = this.pathManager.getEmbeddedNodeRuntimeManifestPath();
    const manifest = await this.readToolchainManifest();
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
      if (manifest.platform !== platform) {
        errors.push(`toolchain platform expected ${platform} but found ${manifest.platform || 'missing'}`);
      }
      if (manifest.layoutVersion !== this.runtimeConfig.layoutVersion) {
        errors.push(`layout version expected ${this.runtimeConfig.layoutVersion} but found ${manifest.layoutVersion || 'missing'}`);
      }
      if (manifest.node?.version !== this.runtimeConfig.releaseVersion) {
        errors.push(`Node version expected ${this.runtimeConfig.releaseVersion} but found ${manifest.node?.version || 'missing'}`);
      }
      if (target && manifest.node?.checksumSha256 !== target.checksumSha256) {
        errors.push('Node archive checksum metadata does not match the pinned runtime manifest');
      }
    }

    const components = {} as Record<BundledToolchainComponentId, BundledToolchainComponentStatus>;
    for (const componentId of COMPONENTS) {
      const status = this.buildComponentStatus(componentId, manifest, manifestPath, toolchainRoot, platform, errors);
      components[componentId] = status;
      if (!status.installed) {
        missingEntries.push(componentId);
      }
    }

    const available = errors.length === 0 && COMPONENTS.every((componentId) => components[componentId].installed);
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
    };
  }

  private buildComponentStatus(
    componentId: BundledToolchainComponentId,
    manifest: BundledToolchainManifest | null,
    manifestPath: string,
    toolchainRoot: string,
    platform: string,
    sharedErrors: string[],
  ): BundledToolchainComponentStatus {
    const commandRelativePath = manifest?.commands?.[componentId];
    const executablePath = commandRelativePath ? path.join(toolchainRoot, commandRelativePath) : undefined;
    const packageRecord = componentId === 'node' || componentId === 'npm' ? null : manifest?.packages?.[componentId];
    const configuredPackage = componentId === 'node' || componentId === 'npm' ? null : this.runtimeConfig.corePackages[componentId];
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
    if (configuredPackage && !packageRecord) {
      componentErrors.push(`${componentId} package is not declared in ${TOOLCHAIN_MANIFEST_FILE}`);
    }
    if (configuredPackage && packageRecord && packageRecord.version !== configuredPackage.version) {
      componentErrors.push(`${componentId} package expected ${configuredPackage.version} but found ${packageRecord.version || 'missing'}`);
    }

    const version = componentId === 'node' || componentId === 'npm'
      ? manifest?.node?.version
      : packageRecord?.version;
    const requiredVersion = componentId === 'node' || componentId === 'npm'
      ? this.runtimeConfig.releaseVersion
      : configuredPackage?.version;
    const installed = sharedErrors.length === 0 && componentErrors.length === 0;

    return {
      componentId,
      installed,
      version,
      requiredVersion,
      resolutionSource: 'bundled-desktop',
      sourcePath: toolchainRoot,
      executablePath,
      manifestPath,
      integrity: installed ? 'ok' : manifest ? 'corrupt' : 'missing',
      primaryAction: installed ? 'none' : 'reinstall-desktop',
      message: componentErrors.join('; ') || undefined,
    };
  }
}
