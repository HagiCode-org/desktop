import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import log from 'electron-log';
import { clean, compare, valid } from 'semver';
import {
  ConfigManager,
  type VersionAutoUpdateSettings,
} from './config.js';
import {
  StateManager,
  createEmptyVersionUpdateSnapshot,
  type VersionUpdateCachedArchive,
  type VersionUpdateSnapshot,
  type VersionUpdateVersionInfo,
} from './state-manager.js';
import type { InstalledVersion, Version, VersionManager } from './version-manager.js';

const DEFAULT_REFRESH_INTERVAL_MS = 60 * 60 * 1000;

type VersionUpdateManagerEventMap = {
  changed: [VersionUpdateSnapshot];
};

type VersionUpdateManagerLike = Pick<
  VersionManager,
  'getActiveVersion' | 'getCurrentSourceConfig' | 'isPortableVersionMode' | 'listVersions' | 'predownloadVersion'
>;

type StateManagerLike = Pick<StateManager, 'getVersionUpdateSnapshot' | 'setVersionUpdateSnapshot'>;
type ConfigManagerLike = Pick<ConfigManager, 'getVersionAutoUpdateSettings' | 'setVersionAutoUpdateSettings'>;

class TypedEmitter<TEvents extends Record<string, unknown[]>> extends EventEmitter {
  override on<TName extends keyof TEvents & string>(eventName: TName, listener: (...args: TEvents[TName]) => void): this {
    return super.on(eventName, listener);
  }

  override off<TName extends keyof TEvents & string>(eventName: TName, listener: (...args: TEvents[TName]) => void): this {
    return super.off(eventName, listener);
  }

  override emit<TName extends keyof TEvents & string>(eventName: TName, ...args: TEvents[TName]): boolean {
    return super.emit(eventName, ...args);
  }
}

/**
 * VersionUpdateManager keeps a persisted snapshot for the renderer and enforces
 * a count-based retention policy for verified background archives.
 */
export class VersionUpdateManager {
  private readonly versionManager: VersionUpdateManagerLike;
  private readonly stateManager: StateManagerLike;
  private readonly configManager: ConfigManagerLike;
  private readonly events = new TypedEmitter<VersionUpdateManagerEventMap>();
  private refreshPromise: Promise<VersionUpdateSnapshot> | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(options: {
    versionManager: VersionUpdateManagerLike;
    stateManager?: StateManagerLike;
    configManager?: ConfigManagerLike;
  }) {
    this.versionManager = options.versionManager;
    this.stateManager = options.stateManager ?? new StateManager();
    this.configManager = options.configManager ?? new ConfigManager();
  }

  onSnapshotChanged(listener: (snapshot: VersionUpdateSnapshot) => void): () => void {
    this.events.on('changed', listener);
    return () => this.events.off('changed', listener);
  }

  startScheduledRefresh(intervalMs: number = DEFAULT_REFRESH_INTERVAL_MS): void {
    this.stopScheduledRefresh();
    this.refreshTimer = setInterval(() => {
      void this.refreshSnapshot('scheduled');
    }, intervalMs);
  }

  stopScheduledRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  dispose(): void {
    this.stopScheduledRefresh();
    this.events.removeAllListeners();
  }

  getSettings(): VersionAutoUpdateSettings {
    return this.configManager.getVersionAutoUpdateSettings();
  }

  async updateSettings(nextSettings: Partial<VersionAutoUpdateSettings>): Promise<VersionAutoUpdateSettings> {
    const saved = this.configManager.setVersionAutoUpdateSettings(nextSettings);
    await this.refreshSnapshot('settings-updated');
    return saved;
  }

  async getSnapshot(): Promise<VersionUpdateSnapshot> {
    const settings = this.getSettings();
    const snapshot = await this.stateManager.getVersionUpdateSnapshot();
    const reconciled = await this.reconcileSnapshot(snapshot, settings.retainedArchiveCount);

    if (JSON.stringify(snapshot) !== JSON.stringify(reconciled)) {
      await this.persistSnapshot(reconciled);
    }

    return reconciled;
  }

  async refreshSnapshot(reason: string = 'manual'): Promise<VersionUpdateSnapshot> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.refreshSnapshotInternal(reason)
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }

  private async refreshSnapshotInternal(reason: string): Promise<VersionUpdateSnapshot> {
    const settings = this.getSettings();
    const now = new Date().toISOString();
    const currentVersion = this.toVersionInfo(await this.versionManager.getActiveVersion());
    const currentSnapshot = await this.getSnapshot();

    if (!settings.enabled) {
      return this.persistSnapshot({
        ...currentSnapshot,
        status: 'disabled',
        currentVersion,
        latestVersion: null,
        downloadedVersionId: null,
        disabledReason: 'settings-disabled',
        lastCheckedAt: now,
        lastUpdatedAt: now,
        failure: null,
      });
    }

    if (this.versionManager.isPortableVersionMode()) {
      return this.persistSnapshot({
        ...currentSnapshot,
        status: 'disabled',
        currentVersion,
        latestVersion: null,
        downloadedVersionId: null,
        disabledReason: 'portable-mode',
        lastCheckedAt: now,
        lastUpdatedAt: now,
        failure: null,
      });
    }

    if (!this.versionManager.getCurrentSourceConfig()) {
      return this.persistSnapshot({
        ...currentSnapshot,
        status: 'disabled',
        currentVersion,
        latestVersion: null,
        downloadedVersionId: null,
        disabledReason: 'no-package-source',
        lastCheckedAt: now,
        lastUpdatedAt: now,
        failure: null,
      });
    }

    const checkingSnapshot: VersionUpdateSnapshot = {
      ...currentSnapshot,
      status: 'checking',
      currentVersion,
      latestVersion: null,
      downloadedVersionId: null,
      disabledReason: null,
      lastCheckedAt: now,
      lastUpdatedAt: now,
      failure: null,
    };
    await this.persistSnapshot(checkingSnapshot);

    if (!currentVersion) {
      return this.persistSnapshot({
        ...checkingSnapshot,
        status: 'idle',
        lastUpdatedAt: new Date().toISOString(),
      });
    }

    try {
      const versions = await this.versionManager.listVersions();
      const latestVersion = selectLatestCompatibleVersion(versions, currentVersion.version);

      if (!latestVersion) {
        return this.persistSnapshot({
          ...checkingSnapshot,
          status: 'idle',
          latestVersion: null,
          downloadedVersionId: null,
          failure: null,
          lastUpdatedAt: new Date().toISOString(),
        });
      }

      const latestVersionInfo = this.toVersionInfo(latestVersion);
      const downloadingSnapshot: VersionUpdateSnapshot = {
        ...checkingSnapshot,
        status: 'downloading',
        latestVersion: latestVersionInfo,
        lastUpdatedAt: new Date().toISOString(),
      };
      await this.persistSnapshot(downloadingSnapshot);

      const result = await this.versionManager.predownloadVersion(latestVersion.id);
      if (!result.success || !result.cachePath) {
        throw new Error(result.error || 'Failed to predownload latest version');
      }

      const retainedRecord: VersionUpdateCachedArchive = {
        versionId: latestVersion.id,
        version: latestVersion.version,
        packageFilename: latestVersion.packageFilename,
        cachePath: result.cachePath,
        retainedAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
        fileSize: result.fileSize ?? 0,
        sourceType: latestVersion.sourceType,
      };

      const reconciled = await this.reconcileCachedArchives(
        mergeRetainedArchive(downloadingSnapshot.cachedArchives, retainedRecord),
        settings.retainedArchiveCount,
      );

      return this.persistSnapshot({
        ...downloadingSnapshot,
        status: 'ready',
        latestVersion: latestVersionInfo,
        downloadedVersionId: latestVersion.id,
        cachedArchives: reconciled,
        failure: null,
        lastUpdatedAt: new Date().toISOString(),
      });
    } catch (error) {
      log.warn('[VersionUpdateManager] Failed to refresh update snapshot:', {
        reason,
        error: error instanceof Error ? error.message : String(error),
      });

      return this.persistSnapshot({
        ...checkingSnapshot,
        status: 'failed',
        failure: {
          message: error instanceof Error ? error.message : String(error),
          at: new Date().toISOString(),
        },
        lastUpdatedAt: new Date().toISOString(),
      });
    }
  }

  private async reconcileSnapshot(snapshot: VersionUpdateSnapshot, retainedArchiveCount: number): Promise<VersionUpdateSnapshot> {
    const normalized = snapshot ?? createEmptyVersionUpdateSnapshot();
    const cachedArchives = await this.reconcileCachedArchives(normalized.cachedArchives, retainedArchiveCount);
    const latestVersion = normalized.latestVersion;
    const downloadedVersionId = latestVersion && cachedArchives.some((archive) => archive.versionId === latestVersion.id)
      ? latestVersion.id
      : null;

    return {
      ...normalized,
      cachedArchives,
      downloadedVersionId,
      status: downloadedVersionId && normalized.status === 'downloading'
        ? 'ready'
        : normalized.status,
    };
  }

  private async reconcileCachedArchives(
    cachedArchives: VersionUpdateCachedArchive[],
    retainedArchiveCount: number,
  ): Promise<VersionUpdateCachedArchive[]> {
    const records = [...cachedArchives].sort((left, right) => {
      return new Date(left.retainedAt).getTime() - new Date(right.retainedAt).getTime();
    });
    const retained: VersionUpdateCachedArchive[] = [];

    for (const record of records) {
      try {
        await fs.access(record.cachePath);
        retained.push(record);
      } catch {
        await fs.rm(record.cachePath, { force: true }).catch(() => undefined);
      }
    }

    while (retained.length > retainedArchiveCount) {
      const evicted = retained.shift();
      if (!evicted) {
        break;
      }
      await fs.rm(evicted.cachePath, { force: true }).catch(() => undefined);
    }

    return retained;
  }

  private async persistSnapshot(snapshot: VersionUpdateSnapshot): Promise<VersionUpdateSnapshot> {
    await this.stateManager.setVersionUpdateSnapshot(snapshot);
    this.events.emit('changed', snapshot);
    return snapshot;
  }

  private toVersionInfo(version: Pick<InstalledVersion, 'id' | 'version' | 'packageFilename' | 'platform'> | Pick<Version, 'id' | 'version' | 'packageFilename' | 'platform' | 'sourceType'> | null): VersionUpdateVersionInfo | null {
    if (!version) {
      return null;
    }

    return {
      id: version.id,
      version: version.version,
      packageFilename: version.packageFilename,
      platform: version.platform,
      sourceType: 'sourceType' in version ? version.sourceType : undefined,
    };
  }
}

export function selectLatestCompatibleVersion(versions: Version[], currentVersion: string | null | undefined): Version | null {
  const normalizedCurrentVersion = normalizeSemver(currentVersion);
  if (!normalizedCurrentVersion) {
    return null;
  }

  const sortedCandidates = [...versions]
    .filter((version) => normalizeSemver(version.version))
    .sort((left, right) => compareVersions(right.version, left.version));

  return sortedCandidates.find((version) => compareVersions(version.version, normalizedCurrentVersion) > 0) ?? null;
}

function mergeRetainedArchive(
  cachedArchives: VersionUpdateCachedArchive[],
  nextArchive: VersionUpdateCachedArchive,
): VersionUpdateCachedArchive[] {
  return [
    ...cachedArchives.filter((archive) => archive.versionId !== nextArchive.versionId),
    nextArchive,
  ];
}

function compareVersions(left: string, right: string): number {
  const normalizedLeft = normalizeSemver(left);
  const normalizedRight = normalizeSemver(right);

  if (normalizedLeft && normalizedRight) {
    return compare(normalizedLeft, normalizedRight);
  }

  return left.localeCompare(right);
}

function normalizeSemver(version: string | null | undefined): string | null {
  if (!version) {
    return null;
  }

  if (valid(version)) {
    return version;
  }

  return clean(version) ?? null;
}
