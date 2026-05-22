import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import log from 'electron-log';
import Store from 'electron-store';
import { valid as validSemver } from 'semver';
import { ConfigManager } from './config.js';
import { PathManager } from './path-manager.js';
import { getCommandExecutableName } from './embedded-node-runtime-config.js';
import { resolveCommandLaunch } from './toolchain-launch.js';
import { executeCliStreaming } from './utils/cli-executor.js';
import { injectPortableToolchainEnv, resolvePathEnvKey } from './portable-toolchain-env.js';
import { BundledNodeRuntimeManager } from './bundled-node-runtime-manager.js';
import { inspectVendoredCodeServerRuntime } from './code-server-runtime.js';
import { inspectVendoredOmniRouteRuntime } from './omniroute-runtime.js';
import {
  buildNpmGlobalCommandArtifactPaths,
  type NodeMajorNpmGlobalPaths,
} from './portable-toolchain-paths.js';
import {
  buildHagiscriptSyncArgs,
  buildHagiscriptSyncManifest,
  getHagiscriptInstallTarget,
  type HagiscriptSyncManifest,
} from './hagiscript-sync.js';
import type { BundledNodeRuntimePolicyDecision } from './bundled-node-runtime-policy.js';
import {
  managedNpmPackages,
  findManagedNpmPackage,
  isVendoredRuntimeMutationId,
} from '../shared/npm-managed-packages.js';
import { findVendoredRuntime } from '../shared/vendored-runtimes.js';
import type {
  ManagedNpmPackageDefinition,
  ManagedNpmPackageId,
  ManagedNpmPackageStatusSnapshot,
  DependencyManagementInstallRequest,
  DependencyManagementBatchSyncRequest,
  DependencyManagementBatchSyncResult,
  NpmEnvironmentComponent,
  DependencyManagementEnvironmentStatus,
  NpmMirrorSettings,
  NpmMirrorSettingsInput,
  DependencyManagementOperation,
  DependencyManagementOperationProgress,
  DependencyManagementOperationResult,
  DependencyManagementSnapshot,
  VendoredRuntimeId,
  VendoredRuntimeStatusSnapshot,
} from '../types/dependency-management.js';

interface DependencyManagementServiceOptions {
  pathManager?: PathManager;
  existsSync?: (targetPath: string) => boolean;
  platform?: NodeJS.Platform;
  settingsStore?: Store<DependencyManagementSettingsStoreSchema>;
  configManager?: ConfigManager;
}

interface DependencyManagementSettingsStoreSchema {
  mirrorSettings?: NpmMirrorSettingsInput;
  packageSelectors?: {
    hagiscript?: string;
  };
}

interface CommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface ManagedNpmCommandContext {
  environment: DependencyManagementEnvironmentStatus;
  commandEnv: NodeJS.ProcessEnv;
  executablePath: string | null;
  packageStatus: ManagedNpmPackageStatusSnapshot | null;
}

interface ManagedNpmPackagePaths {
  packageRoot: string;
  executablePath: string;
  commandArtifacts: string[];
}

interface ResolvedInstallRequest {
  packageId: ManagedNpmPackageId;
  selector?: string;
}

type ProgressListener = (event: DependencyManagementOperationProgress) => void;

export type CliDependencyInstallStage =
  | 'environment'
  | 'bootstrap'
  | 'install'
  | 'verification'
  | 'success';

export interface CliManagedPackageVerification {
  packageId: ManagedNpmPackageId;
  status: ManagedNpmPackageStatusSnapshot['status'];
  packageRoot: string | null;
  executablePath: string | null;
  packageRootUnderManagedModules: boolean;
  executableUnderManagedBin: boolean;
  resolvedCommandPath: string | null;
  commandResolvesThroughManagedPath: boolean;
  error?: string;
}

export interface CliDependencyInstallResult {
  success: boolean;
  stage: CliDependencyInstallStage;
  requestedPackageIds: ManagedNpmPackageId[];
  bootstrapPerformed: boolean;
  statuses: ManagedNpmPackageStatusSnapshot[];
  verifications: CliManagedPackageVerification[];
  snapshot: DependencyManagementSnapshot;
  error?: string;
}

export const NPM_MIRROR_REGISTRY_URL = 'https://registry.npmmirror.com/';
export const NPM_DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org/';

const DEFAULT_MIRROR_SETTINGS: NpmMirrorSettingsInput = {
  enabled: false,
};

function stripAnsi(input: string): string {
  return input.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').trim();
}

function firstMeaningfulLine(input: string): string | null {
  const line = stripAnsi(input)
    .split(/\r?\n/)
    .map((part) => part.trim())
    .find((part) => part.length > 0);

  return line ?? null;
}

function extractPercent(message: string): number | undefined {
  const match = message.match(/(?:^|\s)(\d{1,3})%(?:\s|$)/);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : undefined;
}

function normalizeVersionOutput(value: string): string | null {
  const line = firstMeaningfulLine(value);
  return line ? line.replace(/^v/, '') : null;
}

function normalizeHagiscriptSelector(value?: string | null): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const lowered = trimmed.toLowerCase();
  if (lowered === 'latest' || lowered === 'dev') {
    return lowered;
  }

  const normalizedVersion = validSemver(trimmed.replace(/^v(?=\d)/, ''));
  return normalizedVersion ?? null;
}

export class DependencyManagementService {
  private readonly pathManager: PathManager;
  private readonly existsSync: (targetPath: string) => boolean;
  private readonly platform: NodeJS.Platform;
  private readonly settingsStore: Store<DependencyManagementSettingsStoreSchema>;
  private readonly configManager: ConfigManager;
  private readonly bundledNodeRuntimeManager: BundledNodeRuntimeManager;
  private readonly events = new EventEmitter();
  private activeOperation: DependencyManagementOperationProgress | null = null;
  private vendoredRuntimeInspector: (() => Promise<VendoredRuntimeStatusSnapshot[]>) | null = null;

  constructor(options: DependencyManagementServiceOptions = {}) {
    this.pathManager = options.pathManager ?? PathManager.getInstance();
    this.existsSync = options.existsSync ?? fsSync.existsSync;
    this.platform = options.platform ?? process.platform;
    this.configManager = options.configManager ?? new ConfigManager();
    this.bundledNodeRuntimeManager = new BundledNodeRuntimeManager(this.pathManager);
    this.settingsStore = options.settingsStore ?? new Store<DependencyManagementSettingsStoreSchema>({
      name: 'npm-management',
    });
  }

  onProgress(listener: ProgressListener): () => void {
    this.events.on('progress', listener);
    return () => this.events.off('progress', listener);
  }

  setVendoredRuntimeInspector(inspector: (() => Promise<VendoredRuntimeStatusSnapshot[]>) | null): void {
    this.vendoredRuntimeInspector = inspector;
  }

  async getSnapshot(): Promise<DependencyManagementSnapshot> {
    const environment = await this.detectEnvironment();
    const packages = await Promise.all(
      managedNpmPackages.map((definition) => this.detectPackageStatus(this.resolveManagedPackageDefinition(definition.id) ?? definition, environment)),
    );
    const vendoredRuntimes = await this.getVendoredRuntimeSnapshots();
    const mirrorSettings = this.getMirrorSettings();

    return {
      environment,
      packages,
      vendoredRuntimes,
      mirrorSettings,
      activeOperation: this.activeOperation,
      generatedAt: new Date().toISOString(),
    };
  }

  private async getVendoredRuntimeSnapshots(): Promise<VendoredRuntimeStatusSnapshot[]> {
    if (this.vendoredRuntimeInspector) {
      return await this.vendoredRuntimeInspector();
    }

    return await Promise.all([
      this.inspectVendoredRuntimeSafely('code-server', () => inspectVendoredCodeServerRuntime(this.pathManager), this.pathManager.getCodeServerRuntimeRoot()),
      this.inspectVendoredRuntimeSafely('omniroute', () => inspectVendoredOmniRouteRuntime(this.pathManager), this.pathManager.getOmniRouteRuntimeRoot()),
    ]);
  }

  private async inspectVendoredRuntimeSafely(
    runtimeId: VendoredRuntimeId,
    inspector: () => Promise<VendoredRuntimeStatusSnapshot>,
    runtimeRoot: string,
  ): Promise<VendoredRuntimeStatusSnapshot> {
    try {
      return await inspector();
    } catch (error) {
      const definition = findVendoredRuntime(runtimeId);
      if (!definition) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      log.warn('[DependencyManagementService] Vendored runtime inspection failed:', {
        runtimeId,
        message,
      });

      return {
        id: runtimeId,
        definition,
        installStatus: 'failed',
        status: 'damaged',
        version: null,
        runtimeRoot,
        metadataPath: null,
        wrapperPath: null,
        entryScriptPath: null,
        packageId: runtimeId,
        schemaVersion: null,
        bundledNodeRuntime: false,
        managedByDesktop: true,
        primaryAction: process.env.NODE_ENV === 'development' ? 'repair' : 'reinstall-desktop',
        diagnostics: [message],
        health: {
          reachable: false,
          url: null,
          lastCheckedAt: null,
          message,
        },
        message,
      };
    }
  }

  getMirrorSettings(): NpmMirrorSettings {
    if (!this.settingsStore.has('mirrorSettings')) {
      return this.getDefaultMirrorSettings();
    }

    return this.normalizeMirrorSettings(this.settingsStore.get('mirrorSettings'));
  }

  async setMirrorSettings(input: NpmMirrorSettingsInput): Promise<DependencyManagementSnapshot> {
    this.settingsStore.set('mirrorSettings', {
      enabled: Boolean(input.enabled),
    });
    return this.getSnapshot();
  }

  async install(request: string | DependencyManagementInstallRequest): Promise<DependencyManagementOperationResult> {
    const resolvedInstallRequest = this.resolveInstallRequest(request);
    if (!resolvedInstallRequest.success) {
      const snapshot = await this.getSnapshot();
      return {
        success: false,
        packageId: resolvedInstallRequest.packageId,
        operation: 'install',
        error: resolvedInstallRequest.error,
        snapshot,
      };
    }

    return this.runPackageOperation(
      resolvedInstallRequest.definition.id,
      'install',
      resolvedInstallRequest.definition,
      resolvedInstallRequest.selectorToPersist,
    );
  }

  async syncPackages(request: DependencyManagementBatchSyncRequest): Promise<DependencyManagementBatchSyncResult> {
    const validation = this.resolvePackageDefinitions(request.packageIds, 'sync');
    if (!validation.success) {
      const snapshot = await this.getSnapshot();
      return {
        success: false,
        packageIds: request.packageIds,
        operation: 'sync',
        statuses: [],
        error: validation.error,
        snapshot,
      };
    }

    const definitions = validation.definitions.filter((definition) => definition.id !== 'hagiscript');
    if (definitions.length === 0) {
      const snapshot = await this.getSnapshot();
      return {
        success: true,
        packageIds: [],
        operation: 'sync',
        statuses: [],
        snapshot,
      };
    }

    return this.runHagiscriptSync(definitions);
  }

  async installManagedPackagesForCli(packageIds: ManagedNpmPackageId[]): Promise<CliDependencyInstallResult> {
    const validation = this.resolvePackageDefinitions(packageIds, 'sync');
    if (!validation.success) {
      const snapshot = await this.getSnapshot();
      return this.buildCliDependencyInstallResult({
        success: false,
        stage: 'install',
        requestedPackageIds: packageIds,
        bootstrapPerformed: false,
        snapshot,
        error: validation.error,
      });
    }

    const requestedPackageIds = validation.definitions
      .filter((definition) => definition.id !== 'hagiscript')
      .map((definition) => definition.id);
    if (requestedPackageIds.length === 0) {
      const snapshot = await this.getSnapshot();
      return this.buildCliDependencyInstallResult({
        success: false,
        stage: 'install',
        requestedPackageIds,
        bootstrapPerformed: false,
        snapshot,
        error: 'No sync-managed packages were selected.',
      });
    }

    const initialSnapshot = await this.getSnapshot();
    if (!initialSnapshot.environment.available) {
      return this.buildCliDependencyInstallResult({
        success: false,
        stage: 'environment',
        requestedPackageIds,
        bootstrapPerformed: false,
        snapshot: initialSnapshot,
        error: initialSnapshot.environment.error ?? 'Desktop-managed Node/npm environment is unavailable.',
      });
    }

    let bootstrapPerformed = false;
    let snapshot = initialSnapshot;
    const hagiscriptStatus = this.getHagiscriptStatus(snapshot);
    if (hagiscriptStatus?.status !== 'installed' || !hagiscriptStatus.executablePath) {
      bootstrapPerformed = true;
      const bootstrapResult = await this.install('hagiscript');
      snapshot = bootstrapResult.snapshot;
      const refreshedHagiscriptStatus = this.getHagiscriptStatus(snapshot);
      const bootstrapError = bootstrapResult.success
        ? this.validateInstalledPackageForCli('hagiscript', refreshedHagiscriptStatus)
        : bootstrapResult.error ?? 'hagiscript bootstrap install failed.';

      if (bootstrapError) {
        return this.buildCliDependencyInstallResult({
          success: false,
          stage: 'bootstrap',
          requestedPackageIds,
          bootstrapPerformed,
          snapshot,
          error: `hagiscript: ${bootstrapError}`,
        });
      }
    }

    const installResult = await this.syncPackages({ packageIds: requestedPackageIds });
    snapshot = installResult.snapshot;
    if (!installResult.success) {
      return this.buildCliDependencyInstallResult({
        success: false,
        stage: 'install',
        requestedPackageIds,
        bootstrapPerformed,
        snapshot,
        error: installResult.error ?? `Failed to install requested packages: ${requestedPackageIds.join(', ')}`,
      });
    }

    const verificationPackageIds: ManagedNpmPackageId[] = ['hagiscript', ...requestedPackageIds];
    const verifications = await this.verifyManagedPackagesForCli(verificationPackageIds, snapshot);
    const failedVerification = verifications.find((verification) => verification.error);
    if (failedVerification) {
      return {
        success: false,
        stage: 'verification',
        requestedPackageIds,
        bootstrapPerformed,
        statuses: snapshot.packages.filter((item) => verificationPackageIds.includes(item.id)),
        verifications,
        snapshot,
        error: `${failedVerification.packageId}: ${failedVerification.error}`,
      };
    }

    return {
      success: true,
      stage: 'success',
      requestedPackageIds,
      bootstrapPerformed,
      statuses: snapshot.packages.filter((item) => verificationPackageIds.includes(item.id)),
      verifications,
      snapshot,
    };
  }

  async uninstall(packageId: string): Promise<DependencyManagementOperationResult> {
    const definition = findManagedNpmPackage(packageId);
    if (definition?.required) {
      const snapshot = await this.getSnapshot();
      return {
        success: false,
        packageId: definition.id,
        operation: 'uninstall',
        error: `${definition.displayName} is a required managed tool and cannot be removed.`,
        snapshot,
      };
    }

    return this.runPackageOperation(packageId, 'uninstall');
  }

  async getManagedCommandContext(packageId: ManagedNpmPackageId): Promise<ManagedNpmCommandContext> {
    const activationPolicy = await this.getDesktopActivationPolicy();
    const environment = await this.detectEnvironment(activationPolicy);
    const commandEnv = this.buildCommandEnv(activationPolicy, environment.nodeVersion);
    const definition = findManagedNpmPackage(packageId);

    if (!definition) {
      return {
        environment,
        commandEnv,
        executablePath: null,
        packageStatus: null,
      };
    }

    const packageStatus = await this.detectPackageStatus(definition, environment);
    return {
      environment,
      commandEnv,
      executablePath: packageStatus.executablePath,
      packageStatus,
    };
  }

  private buildCliDependencyInstallResult(input: {
    success: boolean;
    stage: CliDependencyInstallStage;
    requestedPackageIds: ManagedNpmPackageId[];
    bootstrapPerformed: boolean;
    snapshot: DependencyManagementSnapshot;
    error?: string;
  }): CliDependencyInstallResult {
    return {
      success: input.success,
      stage: input.stage,
      requestedPackageIds: input.requestedPackageIds,
      bootstrapPerformed: input.bootstrapPerformed,
      statuses: input.snapshot.packages.filter((item) => (
        item.id === 'hagiscript' || input.requestedPackageIds.includes(item.id)
      )),
      verifications: [],
      snapshot: input.snapshot,
      error: input.error,
    };
  }

  private validateInstalledPackageForCli(
    packageId: ManagedNpmPackageId,
    status: ManagedNpmPackageStatusSnapshot | undefined,
  ): string | null {
    if (status?.status !== 'installed') {
      return `package is not installed in Desktop's managed npm prefix.`;
    }

    if (!status.executablePath) {
      return `package is installed but its executable wrapper path is missing.`;
    }

    if (!status.packageRoot) {
      return `package root is missing from the refreshed dependency snapshot.`;
    }

    void packageId;
    return null;
  }

  private isPathUnder(parentPath: string, childPath: string | null | undefined): boolean {
    if (!childPath) {
      return false;
    }

    const normalize = (value: string) => (
      this.platform === 'win32'
        ? path.resolve(value).toLowerCase()
        : path.resolve(value)
    );
    const parent = normalize(parentPath);
    const child = normalize(childPath);
    const relative = path.relative(parent, child);
    return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  }

  private async resolveCommandThroughManagedEnv(
    definition: ManagedNpmPackageDefinition,
    activationPolicy: BundledNodeRuntimePolicyDecision,
    environment: DependencyManagementEnvironmentStatus,
  ): Promise<string | null> {
    const commandEnv = this.buildCommandEnv(activationPolicy, environment.nodeVersion);
    const nodeCommand = this.getNodeExecutablePath(activationPolicy);
    const script = [
      "const fs = require('fs');",
      "const path = require('path');",
      "const name = process.argv[1];",
      "const isWin = process.platform === 'win32';",
      "const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === 'path') || 'PATH';",
      "const pathEntries = String(process.env[pathKey] || '').split(path.delimiter).filter(Boolean);",
      "const extensions = isWin ? String(process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';') : [''];",
      "for (const entry of pathEntries) {",
      "  const candidates = isWin ? extensions.map((ext) => path.join(entry, name + ext.toLowerCase())).concat(extensions.map((ext) => path.join(entry, name + ext.toUpperCase()))) : [path.join(entry, name)];",
      "  for (const candidate of candidates) {",
      "    if (fs.existsSync(candidate)) { process.stdout.write(candidate); process.exit(0); }",
      "  }",
      "}",
      "process.exit(1);",
    ].join('\n');

    const result = await this.runCommand(
      nodeCommand,
      ['-e', script, definition.binName],
      undefined,
      commandEnv,
    );
    if (result.exitCode !== 0) {
      return null;
    }

    return firstMeaningfulLine(result.stdout);
  }

  private async verifyManagedPackagesForCli(
    packageIds: readonly ManagedNpmPackageId[],
    snapshot: DependencyManagementSnapshot,
  ): Promise<CliManagedPackageVerification[]> {
    const activationPolicy = await this.getDesktopActivationPolicy();
    const environment = snapshot.environment;
    const verifications: CliManagedPackageVerification[] = [];

    for (const packageId of packageIds) {
      const definition = findManagedNpmPackage(packageId);
      const status = this.findPackageStatus(snapshot, packageId);
      const packageInstallError = this.validateInstalledPackageForCli(packageId, status);
      const packageRootUnderManagedModules = this.isPathUnder(environment.npmGlobalModulesRoot, status?.packageRoot);
      const executableUnderManagedBin = this.isPathUnder(environment.npmGlobalBinRoot, status?.executablePath);
      const resolvedCommandPath = definition && status?.executablePath
        ? await this.resolveCommandThroughManagedEnv(definition, activationPolicy, environment)
        : null;
      const commandResolvesThroughManagedPath = this.isPathUnder(environment.npmGlobalBinRoot, resolvedCommandPath);
      const locationError = !packageRootUnderManagedModules
        ? `package root is outside Desktop's managed npm modules directory: ${status?.packageRoot ?? '<missing>'}`
        : !executableUnderManagedBin
          ? `executable wrapper is outside Desktop's managed npm bin directory: ${status?.executablePath ?? '<missing>'}`
          : !commandResolvesThroughManagedPath
            ? `Desktop-injected PATH could not resolve ${definition?.binName ?? packageId} from the managed npm bin directory.`
            : undefined;

      verifications.push({
        packageId,
        status: status?.status ?? 'unknown',
        packageRoot: status?.packageRoot ?? null,
        executablePath: status?.executablePath ?? null,
        packageRootUnderManagedModules,
        executableUnderManagedBin,
        resolvedCommandPath,
        commandResolvesThroughManagedPath,
        error: packageInstallError ?? locationError,
      });
    }

    return verifications;
  }

  private normalizeInstallRequest(request: string | DependencyManagementInstallRequest): ResolvedInstallRequest {
    if (typeof request === 'string') {
      return { packageId: request as ManagedNpmPackageId };
    }

    return {
      packageId: request.packageId,
      selector: request.selector?.trim() || undefined,
    };
  }

  private getConfiguredHagiscriptSelector(): string | null {
    return normalizeHagiscriptSelector(this.settingsStore.get('packageSelectors')?.hagiscript);
  }

  private setConfiguredHagiscriptSelector(selector: string | null): void {
    const packageSelectors = this.settingsStore.get('packageSelectors') ?? {};
    if (!selector) {
      const nextSelectors = { ...packageSelectors };
      delete nextSelectors.hagiscript;
      this.settingsStore.set('packageSelectors', nextSelectors);
      return;
    }

    this.settingsStore.set('packageSelectors', {
      ...packageSelectors,
      hagiscript: selector,
    });
  }

  private resolveManagedPackageDefinition(
    packageId: string,
    selectorOverride?: string | null,
  ): ManagedNpmPackageDefinition | null {
    const definition = findManagedNpmPackage(packageId);
    if (!definition || definition.id !== 'hagiscript') {
      return definition;
    }

    const selector = normalizeHagiscriptSelector(selectorOverride ?? this.getConfiguredHagiscriptSelector());
    if (!selector) {
      return definition;
    }

    return {
      ...definition,
      installSpec: `${definition.packageName}@${selector}`,
    };
  }

  private resolveInstallRequest(
    request: string | DependencyManagementInstallRequest,
  ): (
    | { success: true; definition: ManagedNpmPackageDefinition; selectorToPersist?: string }
    | { success: false; packageId: ManagedNpmPackageId; error: string }
  ) {
    const normalizedRequest = this.normalizeInstallRequest(request);

    if (isVendoredRuntimeMutationId(normalizedRequest.packageId)) {
      return {
        success: false,
        packageId: normalizedRequest.packageId,
        error: `${normalizedRequest.packageId} is a Desktop-managed vendored runtime and cannot be mutated through npm package operations.`,
      };
    }

    const definition = findManagedNpmPackage(normalizedRequest.packageId);
    if (!definition) {
      return {
        success: false,
        packageId: normalizedRequest.packageId,
        error: `Unknown managed npm package: ${normalizedRequest.packageId}`,
      };
    }

    if (normalizedRequest.selector && definition.id !== 'hagiscript') {
      return {
        success: false,
        packageId: definition.id,
        error: `${definition.displayName} does not support install selectors.`,
      };
    }

    if (definition.id !== 'hagiscript') {
      return {
        success: true,
        definition,
      };
    }

    if (!normalizedRequest.selector) {
      return {
        success: true,
        definition: this.resolveManagedPackageDefinition(definition.id) ?? definition,
      };
    }

    const normalizedSelector = normalizeHagiscriptSelector(normalizedRequest.selector);
    if (!normalizedSelector) {
      return {
        success: false,
        packageId: definition.id,
        error: `Unsupported hagiscript selector "${normalizedRequest.selector}". Use an exact version, latest, or dev.`,
      };
    }

    return {
      success: true,
      definition: this.resolveManagedPackageDefinition(definition.id, normalizedSelector) ?? definition,
      selectorToPersist: normalizedSelector,
    };
  }

  private resolvePackageDefinitions(
    packageIds: readonly string[],
    operation: DependencyManagementOperation,
  ): { success: true; definitions: ManagedNpmPackageDefinition[] } | { success: false; error: string } {
    const definitions: ManagedNpmPackageDefinition[] = [];
    const seen = new Set<ManagedNpmPackageId>();

    for (const packageId of packageIds) {
      if (isVendoredRuntimeMutationId(packageId)) {
        return {
          success: false,
          error: `${packageId} is a Desktop-managed vendored runtime and cannot be mutated through npm package operations.`,
        };
      }

      const definition = this.resolveManagedPackageDefinition(packageId);
      if (!definition) {
        return { success: false, error: `Unknown managed npm package: ${packageId}` };
      }

      if (operation === 'sync' && definition.installMode !== 'hagiscript-sync') {
        return { success: false, error: `${definition.displayName} cannot be synchronized through hagiscript npm-sync.` };
      }

      if (!seen.has(definition.id)) {
        definitions.push(definition);
        seen.add(definition.id);
      }
    }

    return { success: true, definitions };
  }

  private getNodeMajorNpmGlobalPaths(
    nodeVersion?: string | null,
  ): NodeMajorNpmGlobalPaths {
    return this.pathManager.getNodeMajorNpmGlobalPaths({
      nodeVersion: nodeVersion ?? process.versions.node,
      platform: this.platform,
    });
  }

  private getNpmGlobalPrefix(nodeVersion?: string | null): string {
    return this.getNodeMajorNpmGlobalPaths(nodeVersion).npmGlobalPrefix;
  }

  private getNpmCacheRoot(nodeVersion?: string | null): string {
    return this.getNodeMajorNpmGlobalPaths(nodeVersion).npmCacheRoot;
  }

  private getNpmGlobalBinRoot(npmGlobalPrefix: string, nodeVersion?: string | null): string {
    return this.getNodeMajorNpmGlobalPaths(nodeVersion).npmGlobalPrefix === npmGlobalPrefix
      ? this.getNodeMajorNpmGlobalPaths(nodeVersion).npmGlobalBinRoot
      : this.platform === 'win32' ? npmGlobalPrefix : path.join(npmGlobalPrefix, 'bin');
  }

  private getNpmGlobalModulesRoot(npmGlobalPrefix: string, nodeVersion?: string | null): string {
    return this.getNodeMajorNpmGlobalPaths(nodeVersion).npmGlobalPrefix === npmGlobalPrefix
      ? this.getNodeMajorNpmGlobalPaths(nodeVersion).npmGlobalModulesRoot
      : this.platform === 'win32'
        ? path.join(npmGlobalPrefix, 'node_modules')
        : path.join(npmGlobalPrefix, 'lib', 'node_modules');
  }

  private getManagedPackageInstallPrefix(
    _definition: ManagedNpmPackageDefinition,
    environment: DependencyManagementEnvironmentStatus,
  ): string {
    return environment.npmGlobalPrefix;
  }

  private getManagedPackageBinRoot(
    definition: ManagedNpmPackageDefinition,
    environment: DependencyManagementEnvironmentStatus,
  ): string {
    const installPrefix = this.getManagedPackageInstallPrefix(definition, environment);
    return this.platform === 'win32' ? installPrefix : path.join(installPrefix, 'bin');
  }

  private getManagedPackagePaths(
    definition: ManagedNpmPackageDefinition,
    environment: DependencyManagementEnvironmentStatus,
  ): ManagedNpmPackagePaths {
    const installPrefix = this.getManagedPackageInstallPrefix(definition, environment);
    const packageRoot = path.join(
      this.getNpmGlobalModulesRoot(installPrefix, environment.nodeVersion),
      ...definition.packageName.split('/').filter(Boolean),
    );
    const commandArtifacts = this.getManagedPackageCommandArtifacts(definition, environment);
    const executableName = getCommandExecutableName(this.platform, definition.binName);

    return {
      packageRoot,
      executablePath: path.join(this.getManagedPackageBinRoot(definition, environment), executableName),
      commandArtifacts,
    };
  }

  private getManagedPackageCommandArtifacts(
    definition: ManagedNpmPackageDefinition,
    environment: DependencyManagementEnvironmentStatus,
  ): string[] {
    return buildNpmGlobalCommandArtifactPaths(
      this.getManagedPackageBinRoot(definition, environment),
      definition.binName,
      this.platform,
    );
  }

  private async removeManagedPackageInstallTarget(
    definition: ManagedNpmPackageDefinition,
    environment: DependencyManagementEnvironmentStatus,
  ): Promise<void> {
    const paths = this.getManagedPackagePaths(definition, environment);
    await fs.rm(paths.packageRoot, { recursive: true, force: true });
    await Promise.all(paths.commandArtifacts.map((artifactPath) => fs.rm(artifactPath, { force: true })));
  }

  private normalizeMirrorSettings(input?: Partial<NpmMirrorSettingsInput> | null): NpmMirrorSettings {
    const enabled = Boolean(input?.enabled ?? DEFAULT_MIRROR_SETTINGS.enabled);
    return {
      enabled,
      registryUrl: enabled ? NPM_MIRROR_REGISTRY_URL : null,
    };
  }

  private getDefaultMirrorSettings(): NpmMirrorSettings {
    const language = this.configManager.getAll()?.settings?.language ?? 'zh-CN';
    return this.normalizeMirrorSettings({
      enabled: language === 'zh-CN',
    });
  }

  private buildNpmOperationArgs(
    operation: DependencyManagementOperation,
    environment: DependencyManagementEnvironmentStatus,
    definition: ManagedNpmPackageDefinition,
    registryUrl?: string | null,
  ): string[] {
    const prefixArgs = ['--prefix', environment.npmGlobalPrefix];

    if (operation === 'install') {
      const registryArgs = registryUrl
        ? ['--registry', registryUrl]
        : [];
      return ['install', '-g', ...prefixArgs, ...registryArgs, definition.installSpec];
    }

    return ['uninstall', '-g', ...prefixArgs, definition.packageName];
  }

  private buildHagiscriptSyncArgs(
    environment: DependencyManagementEnvironmentStatus,
    manifestPath: string,
    registryUrl?: string | null,
  ): string[] {
    return buildHagiscriptSyncArgs(environment, manifestPath, registryUrl);
  }

  private buildHagiscriptCommandEnv(
    activationPolicy: BundledNodeRuntimePolicyDecision,
    environment: DependencyManagementEnvironmentStatus,
  ): NodeJS.ProcessEnv {
    const env = this.buildCommandEnv(activationPolicy, environment.nodeVersion);

    env.npm_config_prefix = environment.npmGlobalPrefix;
    env.NPM_CONFIG_PREFIX = environment.npmGlobalPrefix;
    env.npm_config_global_prefix = environment.npmGlobalPrefix;
    env.NPM_CONFIG_GLOBAL_PREFIX = environment.npmGlobalPrefix;

    return env;
  }

  private getHagiscriptInstallTarget(definition: ManagedNpmPackageDefinition): string {
    return getHagiscriptInstallTarget(definition);
  }

  private buildHagiscriptSyncManifest(
    definitions: readonly ManagedNpmPackageDefinition[],
  ): HagiscriptSyncManifest {
    return buildHagiscriptSyncManifest(definitions);
  }

  private async writeHagiscriptSyncManifest(
    definitions: readonly ManagedNpmPackageDefinition[],
  ): Promise<{ manifestDirectory: string; manifestPath: string }> {
    const manifestDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-hagiscript-sync-'));
    const manifestPath = path.join(manifestDirectory, 'manifest.json');
    await fs.writeFile(
      manifestPath,
      JSON.stringify(this.buildHagiscriptSyncManifest(definitions), null, 2),
      'utf8',
    );
    return { manifestDirectory, manifestPath };
  }

  private shouldRetryWithoutMirror(result: CommandResult, operation: DependencyManagementOperation, mirrorSettings: NpmMirrorSettings): boolean {
    return operation === 'install' && Boolean(mirrorSettings.enabled && mirrorSettings.registryUrl) && result.exitCode !== 0;
  }

  private buildOfficialRegistryRetryEnv(environment: DependencyManagementEnvironmentStatus, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const retryCacheRoot = path.join(path.dirname(environment.npmGlobalPrefix), 'npmCache-official');

    return {
      ...baseEnv,
      npm_config_cache: retryCacheRoot,
      npm_config_prefer_online: 'true',
      npm_config_prefer_offline: 'false',
      npm_config_offline: 'false',
    };
  }

  private buildCommandEnv(
    activationPolicy?: BundledNodeRuntimePolicyDecision,
    nodeVersion?: string | null,
  ): NodeJS.ProcessEnv {
    const npmGlobalPaths = this.getNodeMajorNpmGlobalPaths(nodeVersion);
    const nodeRuntimeRoot = this.getNodeRuntimeRoot(activationPolicy);
    const envResult = injectPortableToolchainEnv(process.env, this.pathManager, {
      platform: this.platform,
      existsSync: this.existsSync,
      activationPolicy,
      npmGlobalPaths,
    });
    const pathKey = resolvePathEnvKey(envResult.env, this.platform);
    const pathValue = envResult.env[pathKey];
    const nodeExecutablePath = path.join(
      this.platform === 'win32' ? nodeRuntimeRoot : path.join(nodeRuntimeRoot, 'bin'),
      this.platform === 'win32' ? 'node.exe' : 'node',
    );
    const env: NodeJS.ProcessEnv = {
      ...envResult.env,
      [pathKey]: pathValue,
      npm_config_cache: this.getNpmCacheRoot(nodeVersion),
    };

    if (activationPolicy?.enabled !== false) {
      env.NODE = nodeExecutablePath;
      env.npm_node_execpath = nodeExecutablePath;
      env.npm_execpath = this.getBundledNpmCliPath(nodeRuntimeRoot);
    }

    delete env.npm_config_prefix;
    delete env.NPM_CONFIG_PREFIX;
    delete env.npm_config_global_prefix;
    delete env.NPM_CONFIG_GLOBAL_PREFIX;
    delete env.npm_config_globalconfig;
    delete env.NPM_CONFIG_GLOBALCONFIG;
    delete env.NPM_CONFIG_GLOBAL_CONFIG;

    // npm must see the selected Desktop-owned Node/npm even when the user's PATH contains another Node/npm.
    if (envResult.markerInjected) {
      env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT = this.pathManager.getPortableToolchainRoot();
    } else {
      delete env.HAGICODE_PORTABLE_TOOLCHAIN_ROOT;
    }

    return env;
  }

  private async getDesktopActivationPolicy(): Promise<BundledNodeRuntimePolicyDecision> {
    return this.bundledNodeRuntimeManager.getDesktopActivationPolicy();
  }

  private getNodeExecutablePath(
    activationPolicy: BundledNodeRuntimePolicyDecision,
  ): string {
    if (activationPolicy.enabled) {
      return this.pathManager.getPortableNodeExecutablePath();
    }

    return process.env.npm_node_execpath?.trim() || 'node';
  }

  private getNpmExecutablePath(
    activationPolicy: BundledNodeRuntimePolicyDecision,
  ): string {
    if (activationPolicy.enabled) {
      return this.getBundledNpmCliPath(this.getNodeRuntimeRoot(activationPolicy));
    }

    return 'npm';
  }

  private getBundledNpmCliPath(nodeRuntimeRoot: string): string {
    return this.platform === 'win32'
      ? path.join(nodeRuntimeRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js')
      : path.join(nodeRuntimeRoot, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  }

  private getNodeRuntimeRoot(
    activationPolicy?: BundledNodeRuntimePolicyDecision,
  ): string {
    const inheritedNodeExecutable = process.env.npm_node_execpath?.trim();
    if (activationPolicy?.enabled === false && inheritedNodeExecutable && path.isAbsolute(inheritedNodeExecutable)) {
      return this.platform === 'win32'
        ? path.dirname(inheritedNodeExecutable)
        : path.dirname(path.dirname(inheritedNodeExecutable));
    }

    return this.pathManager.getPortableNodeRoot();
  }

  private async detectEnvironment(
    activationPolicy?: BundledNodeRuntimePolicyDecision,
  ): Promise<DependencyManagementEnvironmentStatus> {
    const effectivePolicy = activationPolicy ?? await this.getDesktopActivationPolicy();
    const toolchainRoot = this.pathManager.getPortableToolchainRoot();
    const nodeRuntimeRoot = this.getNodeRuntimeRoot(effectivePolicy);
    const initialCommandEnv = this.buildCommandEnv(effectivePolicy);
    const node = await this.detectExecutableVersion('node', this.getNodeExecutablePath(effectivePolicy), ['--version'], initialCommandEnv);
    const nodeVersion = node.version ?? process.versions.node;
    const npmGlobalPaths = this.getNodeMajorNpmGlobalPaths(nodeVersion);
    const commandEnv = this.buildCommandEnv(effectivePolicy, nodeVersion);
    const npm = await this.detectNpmVersion(effectivePolicy, commandEnv);
    const available = node.status === 'available';

    return {
      available,
      toolchainRoot,
      nodeRuntimeRoot,
      nodeVersion,
      nodeMajorVersion: npmGlobalPaths.nodeMajorVersion,
      npmGlobalPrefix: npmGlobalPaths.npmGlobalPrefix,
      npmGlobalBinRoot: npmGlobalPaths.npmGlobalBinRoot,
      npmGlobalModulesRoot: npmGlobalPaths.npmGlobalModulesRoot,
      npmCacheRoot: npmGlobalPaths.npmCacheRoot,
      node,
      npm,
      error: available ? undefined : node.message ?? 'Embedded Node environment is unavailable',
    };
  }

  private async detectExecutableVersion(
    label: 'node' | 'npm',
    executablePath: string,
    args: string[],
    env: NodeJS.ProcessEnv,
  ): Promise<NpmEnvironmentComponent> {
    if (path.isAbsolute(executablePath) && !this.existsSync(executablePath)) {
      return {
        status: 'unavailable',
        executablePath,
        version: null,
        message: `${label} executable not found`,
      };
    }

    try {
      const result = await this.runCommand(executablePath, args, undefined, env);
      if (result.exitCode !== 0) {
        return {
          status: 'error',
          executablePath,
          version: null,
          message: firstMeaningfulLine(result.stderr || result.stdout) ?? `${label} exited with code ${result.exitCode}`,
        };
      }

      return {
        status: 'available',
        executablePath,
        version: normalizeVersionOutput(result.stdout || result.stderr),
      };
    } catch (error) {
      return {
        status: 'error',
        executablePath,
        version: null,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private buildNpmExecution(
    activationPolicy: BundledNodeRuntimePolicyDecision,
    args: string[],
  ): { command: string; args: string[]; executablePath: string } {
    const executablePath = this.getNpmExecutablePath(activationPolicy);
    if (activationPolicy.enabled) {
      return {
        command: this.getNodeExecutablePath(activationPolicy),
        args: [executablePath, ...args],
        executablePath,
      };
    }

    return {
      command: executablePath,
      args,
      executablePath,
    };
  }

  private async detectNpmVersion(
    activationPolicy: BundledNodeRuntimePolicyDecision,
    env: NodeJS.ProcessEnv,
  ): Promise<NpmEnvironmentComponent> {
    const execution = this.buildNpmExecution(activationPolicy, ['--version']);

    if (path.isAbsolute(execution.executablePath) && !this.existsSync(execution.executablePath)) {
      return {
        status: 'unavailable',
        executablePath: execution.executablePath,
        version: null,
        message: 'npm executable not found',
      };
    }

    try {
      const result = await this.runCommand(execution.command, execution.args, undefined, env);
      if (result.exitCode !== 0) {
        return {
          status: 'error',
          executablePath: execution.executablePath,
          version: null,
          message: firstMeaningfulLine(result.stderr || result.stdout) ?? `npm exited with code ${result.exitCode}`,
        };
      }

      return {
        status: 'available',
        executablePath: execution.executablePath,
        version: normalizeVersionOutput(result.stdout || result.stderr),
      };
    } catch (error) {
      return {
        status: 'error',
        executablePath: execution.executablePath,
        version: null,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private runNpmCommand(
    activationPolicy: BundledNodeRuntimePolicyDecision,
    args: string[],
    onOutput?: (chunk: string) => void,
    env: NodeJS.ProcessEnv = this.buildCommandEnv(activationPolicy),
  ): Promise<CommandResult> {
    const execution = this.buildNpmExecution(activationPolicy, args);
    return this.runCommand(execution.command, execution.args, onOutput, env);
  }

  private async detectPackageStatus(
    definition: ManagedNpmPackageDefinition,
    environment: DependencyManagementEnvironmentStatus,
  ): Promise<ManagedNpmPackageStatusSnapshot> {
    const { packageRoot, executablePath } = this.getManagedPackagePaths(definition, environment);

    try {
      const raw = await fs.readFile(path.join(packageRoot, 'package.json'), 'utf8');
      const packageJson = JSON.parse(raw) as { version?: unknown };
      const version = typeof packageJson.version === 'string' ? packageJson.version : null;

      return {
        id: definition.id,
        definition,
        status: 'installed',
        version,
        packageRoot,
        executablePath: this.existsSync(executablePath) ? executablePath : null,
        message: !version
          ? 'Installed package has no package.json version'
          : this.existsSync(executablePath)
            ? undefined
            : `Installed package executable is missing at ${executablePath}`,
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return {
          id: definition.id,
          definition,
          status: 'not-installed',
          version: null,
          packageRoot,
          executablePath: null,
        };
      }

      return {
        id: definition.id,
        definition,
        status: 'unknown',
        version: null,
        packageRoot,
        executablePath: this.existsSync(executablePath) ? executablePath : null,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private findPackageStatus(
    snapshot: DependencyManagementSnapshot,
    packageId: ManagedNpmPackageId,
  ): ManagedNpmPackageStatusSnapshot | undefined {
    return snapshot.packages.find((item) => item.id === packageId);
  }

  private getHagiscriptStatus(snapshot: DependencyManagementSnapshot): ManagedNpmPackageStatusSnapshot | undefined {
    return this.findPackageStatus(snapshot, 'hagiscript');
  }

  private validateHagiscriptDependency(snapshot: DependencyManagementSnapshot): string | null {
    const hagiscriptStatus = this.getHagiscriptStatus(snapshot);
    if (!hagiscriptStatus || hagiscriptStatus.status === 'unknown') {
      return 'hagiscript status is unknown. Install or refresh hagiscript before managing other npm packages.';
    }

    if (hagiscriptStatus.status !== 'installed' || !hagiscriptStatus.executablePath) {
      return 'Install hagiscript before managing other npm packages.';
    }

    return null;
  }

  private validatePackageOperationOutcome(
    definition: ManagedNpmPackageDefinition,
    operation: DependencyManagementOperation,
    status: ManagedNpmPackageStatusSnapshot | undefined,
  ): string | null {
    if (operation === 'uninstall') {
      return status?.status === 'not-installed'
        ? null
        : `uninstall ${definition.displayName} completed with exit code 0, but Desktop still detected the package in ${status?.packageRoot ?? 'the managed npm prefix'}.`;
    }

    if (status?.status !== 'installed') {
      return `${operation} ${definition.displayName} completed with exit code 0, but Desktop could not detect the package in ${status?.packageRoot ?? 'the managed npm prefix'}.`;
    }

    if (!status.executablePath) {
      return `${operation} ${definition.displayName} completed, but the managed executable is missing. Expected a runnable ${definition.binName} wrapper in Desktop's npm bin directory.`;
    }

    return null;
  }

  private finalizeOperationSnapshot(snapshot: DependencyManagementSnapshot): DependencyManagementSnapshot {
    return {
      ...snapshot,
      activeOperation: this.activeOperation,
      generatedAt: new Date().toISOString(),
    };
  }

  private async runPackageOperation(
    packageId: string,
    operation: DependencyManagementOperation,
    definitionOverride?: ManagedNpmPackageDefinition,
    hagiscriptSelectorToPersist?: string,
  ): Promise<DependencyManagementOperationResult> {
    if (isVendoredRuntimeMutationId(packageId)) {
      const snapshot = await this.getSnapshot();
      return {
        success: false,
        packageId: packageId as ManagedNpmPackageId,
        operation,
        error: `${packageId} is a Desktop-managed vendored runtime and cannot be mutated through npm package operations.`,
        snapshot,
      };
    }

    const definition = definitionOverride ?? this.resolveManagedPackageDefinition(packageId);
    if (!definition) {
      const snapshot = await this.getSnapshot();
      return {
        success: false,
        packageId: packageId as ManagedNpmPackageId,
        operation,
      error: `Unknown managed npm package: ${packageId}`,
        snapshot,
      };
    }

    if (this.activeOperation) {
      const snapshot = await this.getSnapshot();
      return {
        success: false,
        packageId: definition.id,
        operation,
        error: `Another npm operation is already active for ${this.activeOperation.packageId}`,
        snapshot,
      };
    }

    // Only hagiscript bootstraps through npm directly; every other install is delegated to hagiscript npm-sync.
    if (operation === 'install' && definition.installMode === 'hagiscript-sync') {
      const result = await this.runHagiscriptSync([definition]);
      return {
        success: result.success,
        packageId: definition.id,
        operation: 'install',
        status: this.findPackageStatus(result.snapshot, definition.id),
        error: result.error,
        snapshot: result.snapshot,
      };
    }

    const activationPolicy = await this.getDesktopActivationPolicy();
    const environment = await this.detectEnvironment(activationPolicy);
    if (!environment.available) {
      const snapshot = await this.getSnapshot();
      return {
        success: false,
        packageId: definition.id,
        operation,
        error: environment.error ?? 'Embedded Node/npm environment is unavailable',
        snapshot,
      };
    }

    const mirrorSettings = this.getMirrorSettings();
    const args = this.buildNpmOperationArgs(operation, environment, definition, mirrorSettings.registryUrl);

    const mirrorSuffix = operation === 'install' && mirrorSettings.enabled && mirrorSettings.registryUrl
      ? ` using registry mirror ${mirrorSettings.registryUrl}`
      : '';
    this.emitProgress(definition.id, operation, 'started', `${operation} ${definition.displayName} started${mirrorSuffix}`, 0);

    let success = false;
    let errorMessage: string | undefined;
    try {
      const commandEnv = this.buildCommandEnv(activationPolicy, environment.nodeVersion);
      if (operation === 'install') {
        await this.removeManagedPackageInstallTarget(definition, environment);
      }
      let result = await this.runNpmCommand(activationPolicy, args, (chunk) => {
        const message = firstMeaningfulLine(chunk);
        if (message) {
          this.emitProgress(definition.id, operation, 'output', message, extractPercent(message));
        }
      }, commandEnv);

      if (this.shouldRetryWithoutMirror(result, operation, mirrorSettings)) {
        this.emitProgress(definition.id, operation, 'output', `Registry mirror failed for ${definition.installSpec}; retrying with ${NPM_DEFAULT_REGISTRY_URL}`, undefined);
        await this.removeManagedPackageInstallTarget(definition, environment);
        result = await this.runNpmCommand(
          activationPolicy,
          this.buildNpmOperationArgs(operation, environment, definition, NPM_DEFAULT_REGISTRY_URL),
          (chunk) => {
            const message = firstMeaningfulLine(chunk);
            if (message) {
              this.emitProgress(definition.id, operation, 'output', message, extractPercent(message));
            }
          },
          this.buildOfficialRegistryRetryEnv(environment, commandEnv),
        );
      }

      success = result.exitCode === 0;
      if (!success) {
        errorMessage = firstMeaningfulLine(result.stderr || result.stdout) ?? `npm exited with code ${result.exitCode}`;
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }

    const previousHagiscriptSelector = definition.id === 'hagiscript'
      ? this.getConfiguredHagiscriptSelector()
      : null;
    if (success && definition.id === 'hagiscript' && hagiscriptSelectorToPersist) {
      this.setConfiguredHagiscriptSelector(hagiscriptSelectorToPersist);
    }

    const snapshot = await this.getSnapshot();
    const status = snapshot.packages.find((item) => item.id === definition.id);
    const verificationError = success
      ? this.validatePackageOperationOutcome(definition, operation, status)
      : null;
    if (verificationError) {
      if (definition.id === 'hagiscript' && hagiscriptSelectorToPersist) {
        this.setConfiguredHagiscriptSelector(previousHagiscriptSelector);
      }
      success = false;
      errorMessage = verificationError;
    }

    this.emitProgress(
      definition.id,
      operation,
      success ? 'completed' : 'failed',
      success ? `${operation} ${definition.displayName} completed` : (errorMessage ?? `${operation} ${definition.displayName} failed`),
      success ? 100 : undefined,
    );

    const finalizedSnapshot = this.finalizeOperationSnapshot(snapshot);
    const finalizedStatus = finalizedSnapshot.packages.find((item) => item.id === definition.id);

    return {
      success,
      packageId: definition.id,
      operation,
      status: finalizedStatus,
      error: errorMessage,
      snapshot: finalizedSnapshot,
    };
  }

  private async runHagiscriptSync(
    definitions: readonly ManagedNpmPackageDefinition[],
  ): Promise<DependencyManagementBatchSyncResult> {
    const packageIds = definitions.map((definition) => definition.id);

    if (this.activeOperation) {
      const snapshot = await this.getSnapshot();
      return {
        success: false,
        packageIds,
        operation: 'sync',
        statuses: [],
        error: `Another npm operation is already active for ${this.activeOperation.packageId}`,
        snapshot,
      };
    }

    const activationPolicy = await this.getDesktopActivationPolicy();
    const environment = await this.detectEnvironment(activationPolicy);
    if (!environment.available) {
      const snapshot = await this.getSnapshot();
      return {
        success: false,
        packageIds,
        operation: 'sync',
        statuses: [],
        error: environment.error ?? 'Embedded Node/npm environment is unavailable',
        snapshot,
      };
    }

    const dependencySnapshot = await this.getSnapshot();
    const dependencyError = this.validateHagiscriptDependency(dependencySnapshot);
    if (dependencyError) {
      return {
        success: false,
        packageIds,
        operation: 'sync',
        statuses: [],
        error: dependencyError,
        snapshot: dependencySnapshot,
      };
    }

    const hagiscriptStatus = this.getHagiscriptStatus(dependencySnapshot);
    const hagiscriptExecutablePath = hagiscriptStatus?.executablePath;
    if (!hagiscriptExecutablePath) {
      return {
        success: false,
        packageIds,
        operation: 'sync',
        statuses: [],
        error: 'hagiscript executable path is unavailable. Refresh dependency management status and retry.',
        snapshot: dependencySnapshot,
      };
    }

    const mirrorSettings = this.getMirrorSettings();
    const mirrorSuffix = mirrorSettings.enabled && mirrorSettings.registryUrl
      ? ` using registry mirror ${mirrorSettings.registryUrl}`
      : '';
    for (const definition of definitions) {
      this.emitProgress(definition.id, 'sync', 'started', `sync ${definition.displayName} started${mirrorSuffix}`, 0);
    }

    let success = false;
    let errorMessage: string | undefined;
    let manifestDirectory: string | null = null;
    try {
      const manifest = await this.writeHagiscriptSyncManifest(definitions);
      manifestDirectory = manifest.manifestDirectory;
      const commandEnv = this.buildHagiscriptCommandEnv(activationPolicy, environment);
      const result = await this.runCommand(
        hagiscriptExecutablePath,
        this.buildHagiscriptSyncArgs(environment, manifest.manifestPath, mirrorSettings.registryUrl),
        (chunk) => {
          const message = firstMeaningfulLine(chunk);
          if (message) {
            for (const definition of definitions) {
              this.emitProgress(definition.id, 'sync', 'output', message, extractPercent(message));
            }
          }
        },
        commandEnv,
      );

      success = result.exitCode === 0;
      if (!success) {
        errorMessage = firstMeaningfulLine(result.stderr || result.stdout) ?? `hagiscript npm-sync exited with code ${result.exitCode}`;
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    } finally {
      if (manifestDirectory) {
        await fs.rm(manifestDirectory, { recursive: true, force: true }).catch(() => undefined);
      }
    }

    const snapshot = await this.getSnapshot();
    const statuses = snapshot.packages.filter((item) => packageIds.includes(item.id));
    if (success) {
      const verificationError = definitions
        .map((definition) => this.validatePackageOperationOutcome(
          definition,
          'sync',
          statuses.find((item) => item.id === definition.id),
        ))
        .find((candidate) => candidate !== null);

      if (verificationError) {
        success = false;
        errorMessage = verificationError;
      }
    }

    for (const definition of definitions) {
      this.emitProgress(
        definition.id,
        'sync',
        success ? 'completed' : 'failed',
        success ? `sync ${definition.displayName} completed` : (errorMessage ?? `sync ${definition.displayName} failed`),
        success ? 100 : undefined,
      );
    }

    const finalizedSnapshot = this.finalizeOperationSnapshot(snapshot);
    const finalizedStatuses = finalizedSnapshot.packages.filter((item) => packageIds.includes(item.id));

    return {
      success,
      packageIds,
      operation: 'sync',
      statuses: finalizedStatuses,
      error: errorMessage,
      snapshot: finalizedSnapshot,
    };
  }

  private emitProgress(
    packageId: ManagedNpmPackageId,
    operation: DependencyManagementOperation,
    stage: DependencyManagementOperationProgress['stage'],
    message: string,
    percentage?: number,
  ): void {
    const event: DependencyManagementOperationProgress = {
      packageId,
      operation,
      stage,
      message,
      percentage,
      timestamp: new Date().toISOString(),
    };

    this.activeOperation = stage === 'completed' || stage === 'failed' ? null : event;
    this.events.emit('progress', event);
  }

  private runCommand(
    command: string,
    args: string[],
    onOutput?: (chunk: string) => void,
    env: NodeJS.ProcessEnv = this.buildCommandEnv(),
  ): Promise<CommandResult> {
    const launch = resolveCommandLaunch(command, this.platform);
    return executeCliStreaming({
      command: launch.command,
      args,
      env,
      shell: launch.shell,
      windowsHide: true,
      metadata: { component: 'DependencyManagementService', command },
      onOutput: (_type, chunk) => {
        onOutput?.(chunk);
      },
    }).then((result) => {
      if (result.error?.kind === 'spawn') {
        log.warn('[DependencyManagementService] npm command failed to launch:', result.error.message);
      }

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    });
  }
}

export default DependencyManagementService;
