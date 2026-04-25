import { manifestReader, ParsedDependency, DependencyTypeName, type Manifest, type EntryPoint, type InstallResult } from './manifest-reader.js';
import { app } from 'electron';
import Store from 'electron-store';
import log from 'electron-log';
import path from 'node:path';
import { PathManager } from './path-manager.js';
import {
  resolveAspNetCoreRuntimeRequirement,
  validateBundledRuntimeForPlatform,
} from './embedded-runtime.js';
import { resolvePinnedRuntimeTarget } from './embedded-runtime-config.js';
import {
  BundledNodeRuntimeManager,
  type BundledToolchainComponentId,
  type BundledToolchainComponentStatus,
} from './bundled-node-runtime-manager.js';
import { DevNodeRuntimeManager } from './dev-node-runtime-manager.js';
import { satisfies } from 'semver';

/**
 * Dependency type enumeration
 */
export enum DependencyType {
  DotNetRuntime = 'dotnet-runtime',
  NodeJs = 'nodejs',
  JavaRuntime = 'java-runtime',
  ClaudeCode = 'claude-code',
  CliTool = 'cli-tool',
}

export interface BundledCliManualAction {
  logicalName: Exclude<BundledToolchainComponentId, 'node' | 'npm'>;
  packageName: string;
  version: string;
  binName: string;
  aliases: string[];
  installMode: 'manual' | 'auto';
  installState: 'pending' | 'installed';
  installSpec: string;
  manualActionId: string;
  toolchainRoot: string;
  npmExecutablePath?: string;
  command?: string;
}

export interface DependencyActionPlan {
  status: 'manual-action-required';
  message: string;
  packages: BundledCliManualAction[];
}

/**
 * Result of a dependency check
 */
export interface DependencyCheckResult {
  key: string;  // Manifest dependency key (e.g., "dotnet", "claudeCode")
  name: string;
  type: DependencyType;
  installed: boolean;
  version?: string;
  requiredVersion?: string;
  versionMismatch?: boolean;
  installCommand?: string | Record<string, unknown>; // Support both string and object formats
  checkCommand?: string; // Command to verify installation
  downloadUrl?: string;
  description?: string;
  isChecking?: boolean;  // True while check is in progress
  resolutionSource?: 'bundled-desktop' | 'bundled-dev' | 'system';
  sourcePath?: string;
  primaryAction?: 'install' | 'visit-website' | 'reinstall-desktop' | 'update-desktop' | 'manual-install';
  status?: 'installed' | 'missing' | 'version-mismatch' | 'manual-install-required';
  manualAction?: BundledCliManualAction;
}

/**
 * DependencyManager handles dependency detection and manual-install handoff state.
 */
export class DependencyManager {
  private currentManifest: Manifest | null = null;
  private readonly pathManager = PathManager.getInstance();
  private readonly bundledNodeRuntimeManager = new BundledNodeRuntimeManager(this.pathManager);
  private readonly devNodeRuntimeManager = new DevNodeRuntimeManager();
  private static readonly DESKTOP_DOWNLOAD_URL = 'https://hagicode.com/desktop/#download';
  private static readonly MANUAL_DEPENDENCY_HANDOFF_MESSAGE =
    'Desktop no longer executes dependency installers automatically. Review the dependency status, run the required manual steps outside Desktop, and refresh when finished.';

  constructor(_store?: Store<Record<string, unknown>>) {
    // Constructor kept for compatibility
  }

  /**
   * Set the current manifest for dependency operations
   * @param manifest - The manifest object
   */
  setManifest(manifest: Manifest | null): void {
    this.currentManifest = manifest;
    log.info('[DependencyManager] Manifest set:', manifest?.package.name, manifest?.package.version);
  }

  /**
   * Clear cached check results
   * Call this after installing dependencies or when forcing a refresh
   * Note: Cache mechanism has been removed, but method kept for compatibility
   */
  clearCheckCache(): void {
    log.info('[DependencyManager] Check cache cleared (cache mechanism disabled)');
  }

  getManualDependencyHandoffMessage(): string {
    return DependencyManager.MANUAL_DEPENDENCY_HANDOFF_MESSAGE;
  }

  /**
   * Check all global dependencies.
   * Legacy direct dependency checks remain disabled; version-specific checks use manifest state.
   */
  async checkAllDependencies(): Promise<DependencyCheckResult[]> {
    log.info('[DependencyManager] checkAllDependencies called (global script execution disabled)');
    return [];
  }

  /**
   * Check dependencies from parsed manifest.
   * @param dependencies - Parsed dependencies from manifest
   * @param entryPoint - EntryPoint object from manifest (kept for compatibility, not used)
   * @param onOutput - Optional callback for real-time output (not used)
   * @returns Array of dependency check results
   */
  async checkFromManifest(
    dependencies: ParsedDependency[],
    entryPoint: EntryPoint | null,
    onOutput?: (type: 'stdout' | 'stderr', data: string, dependencyName?: string) => void
  ): Promise<DependencyCheckResult[]> {
    log.info('[DependencyManager] Checking dependencies from manifest');

    return Promise.all(dependencies.map(async (dep) => {
      const bundledRuntimeResult = await this.checkBundledDotnetDependency(dep);
      if (bundledRuntimeResult) {
        return bundledRuntimeResult;
      }

      const bundledToolchainResult = await this.checkBundledToolchainDependency(dep);
      if (bundledToolchainResult) {
        return bundledToolchainResult;
      }

      // Non-bundled dependencies remain manual/external checks in the current flow.
      return {
        key: dep.key,
        name: dep.name,
        type: this.mapDependencyType(dep.key, dep.type),
        installed: false,
        requiredVersion: this.formatRequiredVersion(dep.versionConstraints),
        description: dep.description,
        downloadUrl: dep.installHint,
        status: 'missing',
      };
    }));
  }

  async getDependencyListFromManifest(installPath: string): Promise<DependencyCheckResult[]> {
    log.info('[DependencyManager] Getting dependency list from manifest for:', installPath);

    const manifest = await manifestReader.readManifest(installPath);
    if (!manifest) {
      log.warn('[DependencyManager] No manifest found for install path:', installPath);
      return [];
    }

    const parsedDeps = manifestReader.parseDependencies(manifest);
    return parsedDeps.map(dep => ({
      key: dep.key,
      name: dep.name,
      type: this.mapDependencyType(dep.key, dep.type),
      installed: false,
      requiredVersion: dep.versionConstraints?.exact ||
        (dep.versionConstraints?.min ? `${dep.versionConstraints.min}+` : undefined),
      versionMismatch: false,
      description: dep.description,
      isChecking: true,
      status: 'missing',
    }));
  }

  /**
   * Format version constraints for display
   * @param constraints - Version constraints
   * @returns Formatted version requirement string
   */
  private formatRequiredVersion(constraints: ParsedDependency['versionConstraints']): string {
    if (constraints.exact) {
      return `exactly ${constraints.exact}`;
    }

    const parts: string[] = [];
    if (constraints.min) parts.push(`${constraints.min}+`);
    if (constraints.max) parts.push(`<= ${constraints.max}`);
    if (constraints.recommended) parts.push(`recommended: ${constraints.recommended}`);

    if (parts.length === 0) return 'any';
    return parts.join(', ');
  }

  private quoteManualCommandSegment(segment: string): string {
    if (segment.length === 0) {
      return '""';
    }

    if (process.platform === 'win32') {
      return `"${segment.replace(/"/g, '\\"')}"`;
    }

    return `'${segment.replace(/'/g, `'\\''`)}'`;
  }

  private buildBundledCliManualAction(
    componentId: Exclude<BundledToolchainComponentId, 'node' | 'npm'>,
    component: BundledToolchainComponentStatus,
    bundledStatus: Awaited<ReturnType<BundledNodeRuntimeManager['verify']>>,
  ): BundledCliManualAction | undefined {
    const packageRecord = bundledStatus.manifest?.packages?.[componentId];
    const npmExecutablePath = bundledStatus.components.npm.executablePath;
    if (!packageRecord) {
      return undefined;
    }

    const prefixPath = path.join(bundledStatus.toolchainRoot, 'npm-global');
    const command = npmExecutablePath
      ? [
        this.quoteManualCommandSegment(npmExecutablePath),
        'install',
        '-g',
        '--prefix',
        this.quoteManualCommandSegment(prefixPath),
        this.quoteManualCommandSegment(packageRecord.installSpec),
      ].join(' ')
      : undefined;

    return {
      logicalName: componentId,
      packageName: packageRecord.packageName,
      version: packageRecord.version,
      binName: packageRecord.binName,
      aliases: packageRecord.aliases || [],
      installMode: packageRecord.installMode,
      installState: packageRecord.installState,
      installSpec: packageRecord.installSpec,
      manualActionId: packageRecord.manualActionId,
      toolchainRoot: bundledStatus.toolchainRoot,
      npmExecutablePath,
      command,
    };
  }

  buildManualActionPlan(dependencies: DependencyCheckResult[]): DependencyActionPlan | null {
    const packages = dependencies
      .filter((dependency): dependency is DependencyCheckResult & { manualAction: BundledCliManualAction } => (
        dependency.status === 'manual-install-required' && !!dependency.manualAction
      ))
      .map((dependency) => dependency.manualAction);

    if (packages.length === 0) {
      return null;
    }

    return {
      status: 'manual-action-required',
      message: 'Bundled Node.js and npm are ready, but Desktop-managed CLI packages must be installed manually before they can be used.',
      packages,
    };
  }

  private async checkBundledDotnetDependency(dep: ParsedDependency): Promise<DependencyCheckResult | null> {
    if (dep.key !== 'dotnet' || process.platform !== 'darwin' || !app.isPackaged) {
      return null;
    }

    const platform = this.pathManager.getCurrentPlatform();
    const runtimeRoot = this.pathManager.getPinnedRuntimeRoot(platform);
    const pinnedVersion = resolvePinnedRuntimeTarget(platform).aspNetCoreVersion;
    const runtimeRequirement = resolveAspNetCoreRuntimeRequirement(
      undefined,
      {
        min: dep.versionConstraints.runtime?.min ?? dep.versionConstraints.min,
        max: dep.versionConstraints.runtime?.max ?? dep.versionConstraints.max,
        recommended: dep.versionConstraints.runtime?.recommended ?? dep.versionConstraints.recommended,
        description: dep.description,
      },
      pinnedVersion,
    );
    const bundledRuntimeValidation = await validateBundledRuntimeForPlatform({
      platform,
      runtimeRoot,
      requirement: runtimeRequirement,
      executableName: this.pathManager.getEmbeddedDotnetExecutableName(),
    });

    if (bundledRuntimeValidation.valid) {
      return {
        key: dep.key,
        name: dep.name,
        type: this.mapDependencyType(dep.key, dep.type),
        installed: true,
        version: bundledRuntimeValidation.bundledRuntimeVersion,
        requiredVersion: runtimeRequirement.effectiveLabel,
        description: `Bundled with Desktop at ${runtimeRoot}`,
        resolutionSource: 'bundled-desktop',
        sourcePath: runtimeRoot,
        status: 'installed',
      };
    }

    const primaryAction = bundledRuntimeValidation.remediation === 'update-desktop'
      ? 'update-desktop'
      : 'reinstall-desktop';
    const remediationText = primaryAction === 'update-desktop'
      ? 'Update Desktop to refresh the bundled runtime.'
      : 'Reinstall Desktop to restore the bundled runtime.';

    return {
      key: dep.key,
      name: dep.name,
      type: this.mapDependencyType(dep.key, dep.type),
      installed: false,
      version: bundledRuntimeValidation.bundledRuntimeVersion,
      requiredVersion: runtimeRequirement.effectiveLabel,
      description: `${bundledRuntimeValidation.message ?? 'Bundled Desktop runtime validation failed.'} ${remediationText}`,
      downloadUrl: DependencyManager.DESKTOP_DOWNLOAD_URL,
      resolutionSource: 'bundled-desktop',
      sourcePath: runtimeRoot,
      primaryAction,
      status: 'missing',
    };
  }

  private normalizeToolchainDependencyKey(dep: ParsedDependency): BundledToolchainComponentId | null {
    const normalizedKey = dep.key.toLowerCase();
    const normalizedName = dep.name.toLowerCase();
    if (normalizedKey === 'node' || normalizedName.includes('node.js')) return 'node';
    if (normalizedKey === 'npm' || normalizedName === 'npm') return 'npm';
    if (normalizedKey === 'openspec' || normalizedName.includes('openspec')) return 'openspec';
    if (normalizedKey === 'skills' || normalizedName.includes('skills')) return 'skills';
    if (normalizedKey === 'omniroute' || normalizedName.includes('omniroute')) return 'omniroute';
    return null;
  }

  private async checkBundledToolchainDependency(dep: ParsedDependency): Promise<DependencyCheckResult | null> {
    const componentId = this.normalizeToolchainDependencyKey(dep);
    if (!componentId) {
      return null;
    }

    if (componentId === 'node' || componentId === 'npm') {
      const devRuntimeResult = await this.checkDevNodeRuntimeDependency(dep, componentId);
      if (devRuntimeResult) {
        return devRuntimeResult;
      }
    }

    const bundledStatus = await this.bundledNodeRuntimeManager.verify();
    const component = bundledStatus.components[componentId];
    const requiredVersion = component.requiredVersion ?? this.formatRequiredVersion(dep.versionConstraints);

    if (component.primaryAction === 'manual-install') {
      const manualAction = componentId === 'node' || componentId === 'npm'
        ? undefined
        : this.buildBundledCliManualAction(componentId, component, bundledStatus);
      return {
        key: dep.key,
        name: dep.name,
        type: this.mapDependencyType(dep.key, dep.type),
        installed: false,
        version: component.version,
        requiredVersion,
        versionMismatch: false,
        description: component.message,
        resolutionSource: 'bundled-desktop',
        sourcePath: component.executablePath ?? component.sourcePath,
        primaryAction: 'manual-install',
        status: 'manual-install-required',
        manualAction,
      };
    }

    if (component.installed) {
      const versionMismatch = !this.isBundledToolchainVersionCompatible(componentId, component.version, dep);
      return {
        key: dep.key,
        name: dep.name,
        type: this.mapDependencyType(dep.key, dep.type),
        installed: !versionMismatch,
        version: component.version,
        requiredVersion,
        versionMismatch,
        description: versionMismatch
          ? `Bundled Desktop ${componentId} version does not satisfy ${requiredVersion}. Update Desktop to refresh the managed toolchain.`
          : `Bundled with Desktop at ${component.sourcePath}`,
        resolutionSource: 'bundled-desktop',
        sourcePath: component.executablePath ?? component.sourcePath,
        primaryAction: versionMismatch ? 'update-desktop' : undefined,
        status: versionMismatch ? 'version-mismatch' : 'installed',
      };
    }

    return {
      key: dep.key,
      name: dep.name,
      type: this.mapDependencyType(dep.key, dep.type),
      installed: false,
      version: component.version,
      requiredVersion,
      versionMismatch: false,
      description: `${component.message ?? (bundledStatus.errors.join('; ') || 'Bundled Desktop toolchain validation failed.')} Reinstall or update Desktop to restore the managed toolchain.`,
      downloadUrl: DependencyManager.DESKTOP_DOWNLOAD_URL,
      resolutionSource: 'bundled-desktop',
      sourcePath: component.executablePath ?? component.sourcePath,
      primaryAction: component.primaryAction === 'update-desktop' ? 'update-desktop' : 'reinstall-desktop',
      status: 'missing',
    };
  }

  private async checkDevNodeRuntimeDependency(
    dep: ParsedDependency,
    componentId: Extract<BundledToolchainComponentId, 'node' | 'npm'>,
  ): Promise<DependencyCheckResult | null> {
    const devStatus = await this.devNodeRuntimeManager.verify();
    if (!devStatus.available) {
      return null;
    }

    const version = componentId === 'node' ? devStatus.nodeVersion : devStatus.npmVersion;
    const sourcePath = componentId === 'node' ? devStatus.nodeExecutablePath : devStatus.npmExecutablePath;
    const requiredVersion = this.formatRequiredVersion(dep.versionConstraints);
    const versionMismatch = !this.isBundledToolchainVersionCompatible(componentId, version, dep);

    return {
      key: dep.key,
      name: dep.name,
      type: this.mapDependencyType(dep.key, dep.type),
      installed: !versionMismatch,
      version,
      requiredVersion,
      versionMismatch,
      description: versionMismatch
        ? `Development bundled ${componentId} version does not satisfy ${requiredVersion}. Run npm run install:dev-node-runtime from repos/hagicode-desktop to refresh the managed runtime.`
        : `Development bundled Node runtime at ${devStatus.installRoot}`,
      resolutionSource: 'bundled-dev',
      sourcePath,
      primaryAction: versionMismatch ? 'update-desktop' : undefined,
      status: versionMismatch ? 'version-mismatch' : 'installed',
    };
  }

  private isBundledToolchainVersionCompatible(
    componentId: BundledToolchainComponentId,
    version: string | undefined,
    dep: ParsedDependency,
  ): boolean {
    if (!version) {
      return false;
    }

    if (componentId === 'openspec') {
      return satisfies(version, '>=1.0.0 <2.0.0', { includePrerelease: true });
    }

    if (componentId === 'skills' || componentId === 'omniroute') {
      return true;
    }

    if (dep.versionConstraints.exact) {
      return version === dep.versionConstraints.exact;
    }

    const rangeParts = [];
    if (dep.versionConstraints.min) rangeParts.push(`>=${dep.versionConstraints.min}`);
    if (dep.versionConstraints.max) rangeParts.push(`<${dep.versionConstraints.max}`);
    if (rangeParts.length === 0) {
      return true;
    }

    return satisfies(version, rangeParts.join(' '), { includePrerelease: true });
  }

  /**
   * Map manifest dependency key and type to DependencyType enum
   * @param key - Dependency key from manifest
   * @param type - Dependency type from manifest
   * @returns Mapped DependencyType enum value
   */
  private mapDependencyType(key: string, type: DependencyTypeName): DependencyType {
    // Map based on key for known dependencies
    const keyMapping: Record<string, DependencyType> = {
      'claudeCode': DependencyType.ClaudeCode,
      'dotnet': DependencyType.DotNetRuntime,
      'node': DependencyType.NodeJs,
      'npm': DependencyType.NodeJs, // Treat npm as Node.js dependency
      'openspec': DependencyType.CliTool,
      'skills': DependencyType.CliTool,
      'omniroute': DependencyType.CliTool,
    };

    if (keyMapping[key]) {
      return keyMapping[key];
    }

    // Fallback based on type
    switch (type) {
      case 'npm':
        return DependencyType.ClaudeCode; // Default npm package type
      case 'system-runtime':
        if (key.includes('dotnet') || key.includes('.net')) {
          return DependencyType.DotNetRuntime;
        }
        return DependencyType.NodeJs;
      default:
        return DependencyType.ClaudeCode; // Default fallback
    }
  }

  /**
   * Install dependencies from manifest.
   * Automatic execution is intentionally disabled; callers receive manual-handoff failures.
   * @param manifest - Parsed manifest object
   * @param dependencies - List of dependencies to install (optional, will check all if not provided)
   * @param onProgress - Progress callback
   * @returns Installation result with manual-handoff failures for each dependency
   */
  async installFromManifest(
    manifest: Manifest,
    dependencies?: ParsedDependency[],
    onProgress?: (progress: {
      current: number;
      total: number;
      dependency: string;
      status: 'installing' | 'success' | 'error';
    }) => void,
  ): Promise<{
    success: string[];
    failed: Array<{ dependency: string; error: string }>;
  }> {
    // Update manifest in DependencyManager
    this.setManifest(manifest);

    const results = {
      success: [] as string[],
      failed: [] as Array<{ dependency: string; error: string }>,
    };

    // If dependencies not provided, parse from manifest
    const depsToCheck = dependencies || [];

    if (depsToCheck.length === 0) {
      log.info('[DependencyManager] No dependencies to install');
      return results;
    }

    const handoffMessage = this.getManualDependencyHandoffMessage();
    log.info('[DependencyManager] Dependency installation request deferred to manual handoff');

    for (const [index, dep] of depsToCheck.entries()) {
      results.failed.push({
        dependency: dep.name,
        error: handoffMessage,
      });
      onProgress?.({
        current: index + 1,
        total: depsToCheck.length,
        dependency: dep.name,
        status: 'error',
      });
    }

    // Clear cache after installation attempt
    this.clearCheckCache();

    return results;
  }

  /**
   * Install a single dependency.
   * Automatic execution is intentionally disabled; callers receive a manual-handoff failure.
   * @param dep - Parsed dependency
   * @param entryPoint - EntryPoint object from manifest (kept for compatibility, not used)
   * @param onOutput - Optional callback for real-time output (not used)
   * @returns Installation result with a manual-handoff failure
   */
  async installSingleDependency(
    dep: ParsedDependency,
    entryPoint: EntryPoint | null,
    onOutput?: (type: 'stdout' | 'stderr', data: string) => void
  ): Promise<InstallResult> {
    const handoffMessage = this.getManualDependencyHandoffMessage();
    log.info('[DependencyManager] Single dependency installation request deferred to manual handoff:', dep.name);

    // Clear cache after installation attempt
    this.clearCheckCache();

    return {
      success: false,
      resultSession: {
        exitCode: -1,
        stdout: '',
        stderr: handoffMessage,
        duration: 0,
        timestamp: new Date().toISOString(),
        success: false,
        errorMessage: handoffMessage,
      },
      parsedResult: {
        success: false,
        errorMessage: handoffMessage,
        rawOutput: '',
      },
      installHint: dep.installHint,
    };
  }
}
