import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { HybridDownloadCoordinator } from '../distribution/hybrid-download-coordinator.js';
import type { DownloadEngineAdapter } from '../distribution/download-engine-adapter.js';
import type { Version } from '../version-manager.js';

const baseSettings = {
  enabled: true,
  uploadLimitMbps: 2,
  cacheLimitGb: 10,
  retentionDays: 7,
  hybridThresholdMb: 100,
  onboardingChoiceRecorded: true,
};

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

describe('HybridDownloadCoordinator', () => {
  it('uses the hybrid engine when metadata is eligible and verifies the cache', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hybrid-download-'));
    const cachePath = path.join(tempRoot, 'hagicode.zip');
    const payload = 'p2p-success';
    const records: string[] = [];

    const engine: DownloadEngineAdapter = {
      async download(_version, destinationPath) {
        await fs.writeFile(destinationPath, payload);
      },
      async stopAll() {},
    };

    const coordinator = new HybridDownloadCoordinator({
      engine,
      settingsStore: { getSettings: () => baseSettings, updateSettings: () => baseSettings } as any,
      cacheRetentionManager: {
        async stopAllSeeding() {},
        async prune() { return { totalBytes: 0, removedEntries: [], retainedEntries: [] }; },
        async markTrusted(record: any) { records.push(record.versionId); return record; },
        async discard() {},
      } as any,
    });

    const version: Version = {
      id: 'v1',
      version: '1.0.0',
      platform: 'win-x64',
      packageFilename: 'hagicode.zip',
      sourceType: 'http-index',
      size: payload.length,
      hybrid: {
        torrentUrl: 'https://example.com/hagicode.torrent',
        infoHash: 'abc',
        webSeeds: ['https://example.com/hagicode.zip'],
        sha256: sha256(payload),
        directUrl: 'https://example.com/hagicode.zip',
        eligible: true,
        legacyHttpFallback: false,
        thresholdBytes: 100 * 1024 * 1024,
        assetKind: 'desktop-latest',
        isLatestDesktopAsset: true,
        isLatestWebAsset: false,
      },
    };

    const result = await coordinator.download(version, cachePath, { downloadPackage: async () => { throw new Error('should not fallback'); }, listAvailableVersions: async () => [] } as any);

    assert.equal(result.policy.useHybrid, true);
    assert.equal(result.verified, true);
    assert.deepEqual(records, ['v1']);
  });

  it('rejects mismatched hashes and discards the cache', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hybrid-download-fail-'));
    const cachePath = path.join(tempRoot, 'hagicode.zip');
    let discarded = false;

    const engine: DownloadEngineAdapter = {
      async download(_version, destinationPath) {
        await fs.writeFile(destinationPath, 'bad-payload');
      },
      async stopAll() {},
    };

    const coordinator = new HybridDownloadCoordinator({
      engine,
      settingsStore: { getSettings: () => baseSettings, updateSettings: () => baseSettings } as any,
      cacheRetentionManager: {
        async stopAllSeeding() {},
        async prune() { return { totalBytes: 0, removedEntries: [], retainedEntries: [] }; },
        async markTrusted(record: any) { return record; },
        async discard(_versionId: string, filePath?: string) { discarded = true; if (filePath) await fs.rm(filePath, { force: true }); },
      } as any,
    });

    const version: Version = {
      id: 'v2',
      version: '1.0.0',
      platform: 'win-x64',
      packageFilename: 'hagicode.zip',
      sourceType: 'http-index',
      size: 10,
      hybrid: {
        torrentUrl: 'https://example.com/hagicode.torrent',
        infoHash: 'abc',
        webSeeds: ['https://example.com/hagicode.zip'],
        sha256: sha256('expected-payload'),
        directUrl: 'https://example.com/hagicode.zip',
        eligible: true,
        legacyHttpFallback: false,
        thresholdBytes: 100 * 1024 * 1024,
        assetKind: 'desktop-latest',
        isLatestDesktopAsset: true,
        isLatestWebAsset: false,
      },
    };

    await assert.rejects(() => coordinator.download(version, cachePath, { downloadPackage: async () => undefined, listAvailableVersions: async () => [] } as any));
    assert.equal(discarded, true);
  });

  it('stops seeding immediately when sharing acceleration is disabled', async () => {
    let stopAllCalled = false;
    let stopSeedingCalled = false;
    const mutableSettings = { ...baseSettings };

    const coordinator = new HybridDownloadCoordinator({
      engine: {
        async download() {},
        async stopAll() { stopAllCalled = true; },
      },
      settingsStore: {
        getSettings: () => mutableSettings,
        updateSettings: (update: any) => Object.assign(mutableSettings, update),
      } as any,
      cacheRetentionManager: {
        async stopAllSeeding() { stopSeedingCalled = true; },
        async prune() { return { totalBytes: 0, removedEntries: [], retainedEntries: [] }; },
        async markTrusted(record: any) { return record; },
        async discard() {},
      } as any,
    });

    await coordinator.disableSharingAcceleration();

    assert.equal(stopAllCalled, true);
    assert.equal(stopSeedingCalled, true);
    assert.equal(mutableSettings.enabled, false);
  });

  it('falls back to HTTP/WebSeed in portable mode and stops active sharing work first', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hybrid-download-portable-'));
    const cachePath = path.join(tempRoot, 'hagicode.zip');
    const payload = 'portable-http-success';
    let engineDownloadCalled = false;
    let engineStopCalled = false;
    let stopSeedingCalled = false;
    let sourceDownloadCalled = false;

    const coordinator = new HybridDownloadCoordinator({
      engine: {
        async download() {
          engineDownloadCalled = true;
        },
        async stopAll() {
          engineStopCalled = true;
        },
      },
      settingsStore: { getSettings: () => baseSettings, updateSettings: () => baseSettings } as any,
      cacheRetentionManager: {
        async stopAllSeeding() {
          stopSeedingCalled = true;
        },
        async prune() {
          return { totalBytes: 0, removedEntries: [], retainedEntries: [] };
        },
        async markTrusted(record: any) {
          return record;
        },
        async discard() {},
      } as any,
    });

    const version: Version = {
      id: 'v3',
      version: '1.0.0',
      platform: 'win-x64',
      packageFilename: 'hagicode.zip',
      sourceType: 'http-index',
      size: payload.length,
      hybrid: {
        torrentUrl: 'https://example.com/hagicode.torrent',
        infoHash: 'def',
        webSeeds: ['https://example.com/hagicode.zip'],
        sha256: sha256(payload),
        directUrl: 'https://example.com/hagicode.zip',
        eligible: true,
        legacyHttpFallback: false,
        thresholdBytes: 100 * 1024 * 1024,
        assetKind: 'desktop-latest',
        isLatestDesktopAsset: true,
        isLatestWebAsset: false,
      },
    };

    const result = await coordinator.download(
      version,
      cachePath,
      {
        async downloadPackage(_version: Version, destinationPath: string) {
          sourceDownloadCalled = true;
          await fs.writeFile(destinationPath, payload);
        },
        async listAvailableVersions() {
          return [];
        },
      } as any,
      undefined,
      {
        settings: {
          ...baseSettings,
          enabled: false,
        },
        distributionMode: 'steam',
      },
    );

    assert.equal(result.policy.useHybrid, false);
    assert.equal(result.policy.reason, 'portable-mode');
    assert.equal(sourceDownloadCalled, true);
    assert.equal(engineDownloadCalled, false);
    assert.equal(stopSeedingCalled, true);
    assert.equal(engineStopCalled, true);
  });
});
