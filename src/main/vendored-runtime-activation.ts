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

interface RuntimeActivationBindings {
  readStatus: () => Promise<VendoredRuntimeStatusSnapshot>;
  validate: (runtimeRoot: string) => Promise<{
    status: VendoredRuntimeStatusSnapshot['status'];
    sourceStatus: VendoredRuntimeStatusSnapshot['sourceStatus'];
    installStatus: VendoredRuntimeStatusSnapshot['installStatus'];
    diagnostics: string[];
  }>;
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
            diagnostics: [...result.missingEntries, ...result.diagnostics],
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
          diagnostics: [...result.missingEntries, ...result.diagnostics],
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

      this.emitProgress(
        runtimeId,
        attemptId,
        'preparing-staging',
        'Preparing writable runtime staging directory.',
        10,
      );
      await fs.mkdir(runtimeHome, { recursive: true });
      await this.syncPackagedRuntimeMarker(packagedMarkerPath, runtimeHome);
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

      this.emitProgress(
        runtimeId,
        attemptId,
        'validating-runtime',
        'Validating extracted runtime layout.',
        92,
      );
      const stagedValidation = await bindings.validate(stagingRoot);
      if (stagedValidation.sourceStatus !== 'available') {
        throw new Error(
          stagedValidation.diagnostics[0]
            ?? 'Packaged vendored runtime source validation failed.',
        );
      }
      if (stagedValidation.installStatus !== 'installed') {
        throw new Error(
          stagedValidation.diagnostics[0]
            ?? 'Extracted vendored runtime failed validation.',
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
      log.warn('[VendoredRuntimeActivationService] activation failed', {
        runtimeId,
        message,
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
