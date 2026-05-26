import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import log from 'electron-log';
import { PathManager } from './path-manager.js';
import {
  inspectVendoredCodeServerRuntime,
  validateCodeServerRuntime,
} from './code-server-runtime.js';
import {
  inspectVendoredOmniRouteRuntime,
  validateOmniRouteRuntime,
} from './omniroute-runtime.js';
import {
  clearVendoredRuntimeActivationProgress,
  setVendoredRuntimeActivationProgress,
} from './vendored-runtime-activation-state.js';
import { extract7zArchive } from './vendored-runtime-7z.js';
import type {
  VendoredRuntimeActivationProgress,
  VendoredRuntimeId,
  VendoredRuntimeStatusSnapshot,
} from '../types/dependency-management.js';

export interface VendoredRuntimeActivationResult {
  success: boolean;
  status: VendoredRuntimeStatusSnapshot;
  error?: string;
}

interface RuntimeActivationPaths {
  currentRoot: string;
  packagedRoot: string;
  packagedArchivePath: string;
  packagedMarkerPath: string;
  runtimeHome: string;
  stagingRoot: string;
}

interface RuntimeActivationValidationResult {
  status: VendoredRuntimeStatusSnapshot['status'];
  sourceStatus: VendoredRuntimeStatusSnapshot['sourceStatus'];
  installStatus: VendoredRuntimeStatusSnapshot['installStatus'];
  diagnostics: string[];
  missingEntries: string[];
  wrapperPath: string | null;
  entryScriptPath: string | null;
}

interface RuntimeActivationBindings {
  readStatus: () => Promise<VendoredRuntimeStatusSnapshot>;
  validate: (runtimeRoot: string) => Promise<RuntimeActivationValidationResult>;
  paths: RuntimeActivationPaths;
}

function isActivationTerminal(stage: VendoredRuntimeActivationProgress['stage']): boolean {
  return stage === 'completed' || stage === 'failed';
}

export class VendoredRuntimeActivationService {
  private static instance: VendoredRuntimeActivationService | null = null;

  static getInstance(
    pathManager: PathManager = PathManager.getInstance(),
  ): VendoredRuntimeActivationService {
    if (!VendoredRuntimeActivationService.instance) {
      VendoredRuntimeActivationService.instance =
        new VendoredRuntimeActivationService(pathManager);
    }
    return VendoredRuntimeActivationService.instance;
  }

  private readonly pathManager: PathManager;
  private readonly inflight = new Map<
    VendoredRuntimeId,
    Promise<VendoredRuntimeActivationResult>
  >();

  constructor(pathManager: PathManager = PathManager.getInstance()) {
    this.pathManager = pathManager;
  }

  async activate(runtimeId: VendoredRuntimeId): Promise<VendoredRuntimeActivationResult> {
    const existing = this.inflight.get(runtimeId);
    if (existing) {
      return existing;
    }

    const task = this.runActivation(runtimeId)
      .finally(() => {
        this.inflight.delete(runtimeId);
      });
    this.inflight.set(runtimeId, task);
    return task;
  }

  private emitProgress(
    runtimeId: VendoredRuntimeId,
    attemptId: string,
    stage: VendoredRuntimeActivationProgress['stage'],
    message: string,
    percentage?: number,
    error?: string,
  ): VendoredRuntimeActivationProgress {
    const now = new Date().toISOString();
    const event: VendoredRuntimeActivationProgress = {
      runtimeId,
      attemptId,
      stage,
      message,
      percentage,
      startedAt: now,
      updatedAt: now,
      error,
    };
    setVendoredRuntimeActivationProgress(event);
    return event;
  }

  private getBindings(runtimeId: VendoredRuntimeId): RuntimeActivationBindings {
    if (runtimeId === 'code-server') {
      return {
        readStatus: () => inspectVendoredCodeServerRuntime(this.pathManager),
        validate: async (runtimeRoot) => {
          const result = await validateCodeServerRuntime({
            runtimeRoot,
            pathManager: this.pathManager,
            activation: null,
          });
          return {
            status: result.status,
            sourceStatus: result.sourceStatus,
            installStatus: result.installStatus,
            diagnostics: [...result.diagnostics],
            missingEntries: [...result.missingEntries],
            wrapperPath: result.wrapperPath,
            entryScriptPath: result.entryScriptPath,
          };
        },
        paths: {
          currentRoot: this.pathManager.getCodeServerRuntimeRoot(),
          packagedRoot: this.pathManager.getCodeServerPackagedRuntimeRoot(),
          packagedArchivePath: this.pathManager.getCodeServerPackagedArchivePath(),
          packagedMarkerPath: path.join(this.pathManager.getCodeServerPackagedRuntimeRoot(), '.hagicode-runtime.json'),
          runtimeHome: this.pathManager.getCodeServerRuntimeHome(),
          stagingRoot: this.pathManager.getCodeServerRuntimeStagingRoot(),
        },
      };
    }

    return {
      readStatus: () => inspectVendoredOmniRouteRuntime(this.pathManager),
      validate: async (runtimeRoot) => {
        const result = await validateOmniRouteRuntime({
          runtimeRoot,
          pathManager: this.pathManager,
          activation: null,
        });
        return {
          status: result.status,
          sourceStatus: result.sourceStatus,
          installStatus: result.installStatus,
          diagnostics: [...result.diagnostics],
          missingEntries: [...result.missingEntries],
          wrapperPath: result.wrapperPath,
          entryScriptPath: result.entryScriptPath,
        };
      },
      paths: {
        currentRoot: this.pathManager.getOmniRouteRuntimeRoot(),
        packagedRoot: this.pathManager.getOmniRoutePackagedRuntimeRoot(),
        packagedArchivePath: this.pathManager.getOmniRoutePackagedArchivePath(),
        packagedMarkerPath: path.join(this.pathManager.getOmniRoutePackagedRuntimeRoot(), '.hagicode-runtime.json'),
        runtimeHome: this.pathManager.getOmniRouteRuntimeHome(),
        stagingRoot: this.pathManager.getOmniRouteRuntimeStagingRoot(),
      },
    };
  }

  private async runActivation(
    runtimeId: VendoredRuntimeId,
  ): Promise<VendoredRuntimeActivationResult> {
    const attemptId = randomUUID();
    const bindings = this.getBindings(runtimeId);
    const {
      currentRoot,
      packagedArchivePath,
      packagedMarkerPath,
      runtimeHome,
      stagingRoot,
    } = bindings.paths;

    try {
      log.info('[VendoredRuntimeActivationService] activation started', {
        runtimeId,
        attemptId,
        packagedArchivePath,
        packagedMarkerPath,
        runtimeHome,
        stagingRoot,
        currentRoot,
      });

      this.emitProgress(
        runtimeId,
        attemptId,
        'validating-source',
        'Validating packaged runtime archive.',
        5,
      );
      const sourceStatus = await bindings.readStatus();
      if (sourceStatus.sourceStatus !== 'available') {
        throw new Error(
          sourceStatus.diagnostics[0]
            ?? sourceStatus.message
            ?? 'Packaged vendored runtime source is unavailable.',
        );
      }
      if (!sourceStatus.packagedArchivePath) {
        throw new Error('Packaged vendored runtime archive path is missing.');
      }

      log.info('[VendoredRuntimeActivationService] packaged source validated', {
        runtimeId,
        packagedArchivePath: sourceStatus.packagedArchivePath,
        packagedRoot: sourceStatus.packagedRoot,
        packagedMarkerPath: sourceStatus.packagedMarkerPath,
      });

      this.emitProgress(
        runtimeId,
        attemptId,
        'preparing-staging',
        'Preparing writable runtime staging directory.',
        10,
      );
      await fs.mkdir(runtimeHome, { recursive: true });
      await this.syncPackagedRuntimeMarker(packagedMarkerPath, runtimeHome);
      log.info('[VendoredRuntimeActivationService] synced packaged runtime marker', {
        runtimeId,
        packagedMarkerPath,
        runtimeHomeMarkerPath: path.join(runtimeHome, '.hagicode-runtime.json'),
      });
      await fs.rm(stagingRoot, { recursive: true, force: true });
      await fs.mkdir(stagingRoot, { recursive: true });

      this.emitProgress(
        runtimeId,
        attemptId,
        'extracting',
        'Extracting packaged runtime archive.',
        15,
      );
      await extract7zArchive({
        runtimeId,
        archivePath: packagedArchivePath,
        destinationDir: stagingRoot,
        onProgress: (percentage, message) => {
          const normalizedPercentage = typeof percentage === 'number'
            ? Math.min(90, Math.max(15, 15 + Math.round(percentage * 0.6)))
            : undefined;
          this.emitProgress(
            runtimeId,
            attemptId,
            'extracting',
            message,
            normalizedPercentage,
          );
        },
      });
      await this.normalizeExtractedRuntimeRoot(runtimeId, stagingRoot, bindings.validate);
      await this.logRuntimeSnapshot(runtimeId, 'staging-after-extract', stagingRoot);

      this.emitProgress(
        runtimeId,
        attemptId,
        'validating-runtime',
        'Validating extracted runtime layout.',
        92,
      );
      const stagedValidation = await bindings.validate(stagingRoot);
      if (stagedValidation.sourceStatus !== 'available') {
        log.warn('[VendoredRuntimeActivationService] staged source validation failed', {
          runtimeId,
          attemptId,
          stagingRoot,
          missingEntries: stagedValidation.missingEntries,
          diagnostics: stagedValidation.diagnostics,
          wrapperPath: stagedValidation.wrapperPath,
          entryScriptPath: stagedValidation.entryScriptPath,
        });
        await this.logRuntimeSnapshot(runtimeId, 'staging-source-validation-failure', stagingRoot);
        throw new Error(
          this.formatValidationFailure(
            stagedValidation,
            'Packaged vendored runtime source validation failed.',
          ),
        );
      }
      if (stagedValidation.installStatus !== 'installed') {
        log.warn('[VendoredRuntimeActivationService] extracted runtime validation failed', {
          runtimeId,
          attemptId,
          stagingRoot,
          missingEntries: stagedValidation.missingEntries,
          diagnostics: stagedValidation.diagnostics,
          wrapperPath: stagedValidation.wrapperPath,
          entryScriptPath: stagedValidation.entryScriptPath,
        });
        await this.logRuntimeSnapshot(runtimeId, 'staging-install-validation-failure', stagingRoot);
        throw new Error(
          this.formatValidationFailure(
            stagedValidation,
            'Extracted vendored runtime failed validation.',
          ),
        );
      }

      this.emitProgress(
        runtimeId,
        attemptId,
        'swapping-runtime',
        'Promoting extracted runtime to current.',
        97,
      );
      await this.promoteStagedRuntime(currentRoot, stagingRoot);
      await this.logRuntimeSnapshot(runtimeId, 'current-after-promote', currentRoot);

      this.emitProgress(
        runtimeId,
        attemptId,
        'completed',
        'Vendored runtime activation completed.',
        100,
      );
      const snapshot = await bindings.readStatus();
      return {
        success: true,
        status: snapshot,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const [stagingSnapshot, currentSnapshot] = await Promise.all([
        this.collectRuntimeSnapshot(stagingRoot),
        this.collectRuntimeSnapshot(currentRoot),
      ]);
      log.warn('[VendoredRuntimeActivationService] activation failed', {
        runtimeId,
        attemptId,
        message,
        packagedArchivePath,
        packagedMarkerPath,
        runtimeHome,
        stagingRoot,
        currentRoot,
        stagingSnapshot,
        currentSnapshot,
      });
      this.emitProgress(
        runtimeId,
        attemptId,
        'failed',
        'Vendored runtime activation failed.',
        undefined,
        message,
      );
      await fs.rm(bindings.paths.stagingRoot, {
        recursive: true,
        force: true,
      }).catch(() => undefined);
      return {
        success: false,
        status: await bindings.readStatus(),
        error: message,
      };
    }
  }

  private async normalizeExtractedRuntimeRoot(
    runtimeId: VendoredRuntimeId,
    stagingRoot: string,
    validate: RuntimeActivationBindings['validate'],
  ): Promise<void> {
    const topLevelEntries = await fs.readdir(stagingRoot, { withFileTypes: true });
    if (topLevelEntries.length !== 1 || !topLevelEntries[0]?.isDirectory()) {
      return;
    }

    const nestedRoot = path.join(stagingRoot, topLevelEntries[0].name);
    const [rootValidation, nestedValidation] = await Promise.all([
      validate(stagingRoot),
      validate(nestedRoot),
    ]);

    const nestedOnlyMissingMarker = nestedValidation.missingEntries.every(
      (entry) => entry === 'metadata.json|../.hagicode-runtime.json',
    );
    const nestedLooksRunnable = Boolean(
      nestedValidation.wrapperPath || nestedValidation.entryScriptPath,
    );

    if (
      rootValidation.installStatus === 'installed'
      || (!nestedLooksRunnable || !nestedOnlyMissingMarker)
    ) {
      return;
    }

    log.info('[VendoredRuntimeActivationService] hoisting nested extracted runtime root', {
      runtimeId,
      stagingRoot,
      nestedRoot,
      nestedRootName: topLevelEntries[0].name,
      rootMissingEntries: rootValidation.missingEntries,
      nestedMissingEntries: nestedValidation.missingEntries,
    });

    const nestedEntries = await fs.readdir(nestedRoot, { withFileTypes: true });
    for (const entry of nestedEntries) {
      await fs.rename(
        path.join(nestedRoot, entry.name),
        path.join(stagingRoot, entry.name),
      );
    }
    await fs.rm(nestedRoot, { recursive: true, force: true });
  }

  private formatValidationFailure(
    validation: RuntimeActivationValidationResult,
    fallbackMessage: string,
  ): string {
    if (validation.missingEntries.length > 0) {
      return `Extracted vendored runtime is missing required entries: ${validation.missingEntries.join(', ')}`;
    }
    return validation.diagnostics[0] ?? fallbackMessage;
  }

  private async logRuntimeSnapshot(
    runtimeId: VendoredRuntimeId,
    label: string,
    runtimeRoot: string,
  ): Promise<void> {
    const entries = await this.collectRuntimeSnapshot(runtimeRoot);
    log.info('[VendoredRuntimeActivationService] runtime snapshot', {
      runtimeId,
      label,
      runtimeRoot,
      entries,
    });
  }

  private async collectRuntimeSnapshot(
    runtimeRoot: string,
    maxDepth = 4,
    maxEntries = 80,
  ): Promise<string[]> {
    const queue: Array<{ absolutePath: string; relativePath: string; depth: number }> = [];
    const entries: string[] = [];

    const rootExists = await fs.access(runtimeRoot)
      .then(() => true)
      .catch(() => false);
    if (!rootExists) {
      return ['<missing>'];
    }

    queue.push({ absolutePath: runtimeRoot, relativePath: '', depth: 0 });

    while (queue.length > 0 && entries.length < maxEntries) {
      const current = queue.shift();
      if (!current) {
        break;
      }

      let children;
      try {
        children = await fs.readdir(current.absolutePath, { withFileTypes: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        entries.push(`${current.relativePath || '.'} <error: ${message}>`);
        continue;
      }

      children.sort((left, right) => left.name.localeCompare(right.name));
      for (const child of children) {
        const relativePath = current.relativePath
          ? path.join(current.relativePath, child.name)
          : child.name;
        entries.push(child.isDirectory() ? `${relativePath}/` : relativePath);
        if (entries.length >= maxEntries) {
          break;
        }
        if (child.isDirectory() && current.depth + 1 < maxDepth) {
          queue.push({
            absolutePath: path.join(current.absolutePath, child.name),
            relativePath,
            depth: current.depth + 1,
          });
        }
      }
    }

    if (queue.length > 0) {
      entries.push(`... truncated after ${maxEntries} entries`);
    }

    return entries.length > 0 ? entries : ['<empty>'];
  }

  private async syncPackagedRuntimeMarker(
    packagedMarkerPath: string,
    runtimeHome: string,
  ): Promise<void> {
    await fs.copyFile(
      packagedMarkerPath,
      path.join(runtimeHome, '.hagicode-runtime.json'),
    );
  }

  private async promoteStagedRuntime(
    currentRoot: string,
    stagingRoot: string,
  ): Promise<void> {
    const runtimeHome = path.dirname(currentRoot);
    const backupRoot = path.join(
      runtimeHome,
      `.previous-${path.basename(currentRoot)}-${Date.now()}`,
    );
    const currentExists = await fs
      .access(currentRoot)
      .then(() => true)
      .catch(() => false);

    if (currentExists) {
      await fs.rm(backupRoot, { recursive: true, force: true });
      await fs.rename(currentRoot, backupRoot);
    }

    try {
      await fs.rename(stagingRoot, currentRoot);
      if (currentExists) {
        await fs.rm(backupRoot, { recursive: true, force: true });
      }
    } catch (error) {
      if (currentExists) {
        await fs.rename(backupRoot, currentRoot).catch(() => undefined);
      }
      throw error;
    }
  }
}

export function getVendoredRuntimeActivationService(
  pathManager: PathManager = PathManager.getInstance(),
): VendoredRuntimeActivationService {
  return VendoredRuntimeActivationService.getInstance(pathManager);
}

export function isVendoredRuntimeActivationInFlight(
  progress: VendoredRuntimeActivationProgress | null | undefined,
): boolean {
  return Boolean(progress && !isActivationTerminal(progress.stage));
}

export function clearCompletedVendoredRuntimeActivation(
  runtimeId: VendoredRuntimeId,
  progress: VendoredRuntimeActivationProgress | null | undefined,
): void {
  if (progress && isActivationTerminal(progress.stage)) {
    clearVendoredRuntimeActivationProgress(runtimeId);
  }
}
