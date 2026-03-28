import Store from 'electron-store';
import fs from 'node:fs/promises';
import log from 'electron-log';
import type {
  CacheRetentionSummary,
  SharingAccelerationSettings,
  TrustedCacheRecord,
} from '../../types/sharing-acceleration.js';

interface CacheRetentionStoreSchema {
  records: TrustedCacheRecord[];
}

type TrustedCacheInput = Omit<TrustedCacheRecord, 'verifiedAt' | 'lastUsedAt' | 'expiresAt' | 'seeding'>;

export class CacheRetentionManager {
  private store: Store<CacheRetentionStoreSchema>;

  constructor(store?: Store<CacheRetentionStoreSchema>) {
    this.store = store ?? new Store<CacheRetentionStoreSchema>({
      name: 'sharing-acceleration-cache',
      defaults: {
        records: [],
      },
    });
  }

  listRecords(): TrustedCacheRecord[] {
    return this.store.get('records', []);
  }

  async markTrusted(record: TrustedCacheInput, settings: SharingAccelerationSettings): Promise<TrustedCacheRecord> {
    const now = new Date();
    const nextRecord: TrustedCacheRecord = {
      ...record,
      verifiedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + settings.retentionDays * 24 * 60 * 60 * 1000).toISOString(),
      seeding: settings.enabled && record.seedEligible,
    };

    const records = this.listRecords().filter((existing) => existing.versionId !== record.versionId);
    records.push(nextRecord);
    this.store.set('records', records);
    return nextRecord;
  }

  async discard(versionId: string, cachePath?: string): Promise<void> {
    this.store.set('records', this.listRecords().filter((record) => record.versionId !== versionId));
    if (cachePath) {
      await fs.rm(cachePath, { force: true }).catch(() => undefined);
    }
  }

  async stopAllSeeding(): Promise<void> {
    this.store.set('records', this.listRecords().map((record) => ({ ...record, seeding: false })));
  }

  async prune(settings: SharingAccelerationSettings): Promise<CacheRetentionSummary> {
    const records = [...this.listRecords()]
      .sort((left, right) => new Date(left.lastUsedAt).getTime() - new Date(right.lastUsedAt).getTime());
    const removedEntries: string[] = [];
    const retainedEntries: string[] = [];
    const maxBytes = settings.cacheLimitGb * 1024 * 1024 * 1024;
    let totalBytes = 0;
    const now = Date.now();

    for (const record of records) {
      const expired = new Date(record.expiresAt).getTime() <= now;
      const missing = await fs.access(record.cachePath).then(() => false).catch(() => true);
      if (expired || missing) {
        removedEntries.push(record.versionId);
        await fs.rm(record.cachePath, { force: true }).catch(() => undefined);
        continue;
      }

      totalBytes += record.cacheSize;
      retainedEntries.push(record.versionId);
    }

    const retainedRecords = () => records.filter((record) => retainedEntries.includes(record.versionId));

    while (totalBytes > maxBytes && retainedEntries.length > 0) {
      const evicted = retainedRecords()
        .sort((left, right) => {
          if (left.seedEligible !== right.seedEligible) {
            return left.seedEligible ? 1 : -1;
          }
          return new Date(left.lastUsedAt).getTime() - new Date(right.lastUsedAt).getTime();
        })[0];
      if (!evicted) {
        break;
      }
      retainedEntries.splice(retainedEntries.indexOf(evicted.versionId), 1);
      removedEntries.push(evicted.versionId);
      totalBytes -= evicted.cacheSize;
      await fs.rm(evicted.cachePath, { force: true }).catch(() => undefined);
    }

    const nextRecords = records.filter((record) => retainedEntries.includes(record.versionId)).map((record) => ({
      ...record,
      seeding: settings.enabled && record.seedEligible,
      lastUsedAt: record.lastUsedAt || new Date().toISOString(),
    }));
    this.store.set('records', nextRecords);
    log.info('[CacheRetentionManager] Prune summary:', { totalBytes, removedEntries, retainedEntries });
    return { totalBytes, removedEntries, retainedEntries };
  }
}
