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
  cacheLimitGb: 5,
  retentionDays: 7,
  hybridThresholdMb: 0,
  onboardingChoiceRecorded: true,
};

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function createStructuredSources() {
  return [
    {
      kind: 'official' as const,
      label: 'Official',
      url: 'https://official.example.com/hagicode.zip',
      primary: true,
      webSeed: true,
    },
    {
      kind: 'github-release' as const,
      label: 'GitHub Release',
      url: 'https://github.com/HagiCode-org/hagicode/releases/download/v1.0.0/hagicode.zip',
      primary: false,
      webSeed: true,
    },
  ];
}

function createMultiSourceVersion(payload: string, overrides?: Partial<Version['hybrid']>): Version {
  return {
    id: 'multi-source',
    version: '1.0.0',
    platform: 'win-x64',
    packageFilename: 'hagicode.zip',
    sourceType: 'http-index',
    size: payload.length,
    downloadUrl: 'https://official.example.com/hagicode.zip',
    hybrid: {
      torrentUrl: 'https://example.com/hagicode.torrent',
      infoHash: 'multi',
      webSeeds: ['https://official.example.com/hagicode.zip'],
      downloadSources: createStructuredSources(),
      sha256: sha256(payload),
      directUrl: 'https://official.example.com/hagicode.zip',
      hasTorrentMetadata: true,
      torrentFirst: true,
      eligible: true,
      legacyHttpFallback: false,
      thresholdBytes: 0,
      assetKind: 'desktop-package',
      isLatestDesktopAsset: false,
      isLatestWebAsset: false,
      serviceScope: 'local-cache',
      ...overrides,
    },
  };
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
        hasTorrentMetadata: true,
        torrentFirst: true,
        eligible: true,
        legacyHttpFallback: false,
        thresholdBytes: 0,
        assetKind: 'desktop-latest',
        isLatestDesktopAsset: true,
        isLatestWebAsset: false,
        serviceScope: 'latest-desktop',
      },
    };

    const result = await coordinator.download(version, cachePath, { downloadPackage: async () => { throw new Error('should not fallback'); }, listAvailableVersions: async () => [] } as any);

    assert.equal(result.policy.useHybrid, true);
    assert.equal(result.policy.preferTorrent, true);
    assert.equal(result.policy.serviceScope, 'latest-desktop');
    assert.equal(result.verified, true);
    assert.equal(result.finalMode, 'shared-acceleration');
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
        hasTorrentMetadata: true,
        torrentFirst: true,
        eligible: true,
        legacyHttpFallback: false,
        thresholdBytes: 0,
        assetKind: 'desktop-latest',
        isLatestDesktopAsset: true,
        isLatestWebAsset: false,
        serviceScope: 'latest-desktop',
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
        hasTorrentMetadata: true,
        torrentFirst: true,
        eligible: true,
        legacyHttpFallback: false,
        thresholdBytes: 0,
        assetKind: 'desktop-latest',
        isLatestDesktopAsset: true,
        isLatestWebAsset: false,
        serviceScope: 'latest-desktop',
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
    assert.equal(result.policy.seedEligible, true);
    assert.equal(sourceDownloadCalled, true);
    assert.equal(engineDownloadCalled, false);
    assert.equal(stopSeedingCalled, true);
    assert.equal(engineStopCalled, true);
    assert.equal(result.finalMode, 'source-fallback');
  });

  it('falls back to HTTP/WebSeed automatically when torrent-first fails', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hybrid-download-fallback-'));
    const cachePath = path.join(tempRoot, 'hagicode.zip');
    const payload = 'http-fallback-success';
    const progressMessages: string[] = [];
    let sourceDownloadCalled = false;

    const coordinator = new HybridDownloadCoordinator({
      engine: {
        async download() {
          throw new Error('torrent handshake failed');
        },
        async stopAll() {},
      },
      settingsStore: { getSettings: () => baseSettings, updateSettings: () => baseSettings } as any,
      cacheRetentionManager: {
        async stopAllSeeding() {},
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
      id: 'v4',
      version: '1.0.1',
      platform: 'win-x64',
      packageFilename: 'hagicode.zip',
      sourceType: 'http-index',
      size: payload.length,
      hybrid: {
        torrentUrl: 'https://example.com/hagicode.torrent',
        infoHash: 'ghi',
        webSeeds: ['https://example.com/hagicode.zip'],
        sha256: sha256(payload),
        directUrl: 'https://example.com/hagicode.zip',
        hasTorrentMetadata: true,
        torrentFirst: true,
        eligible: true,
        legacyHttpFallback: false,
        thresholdBytes: 0,
        assetKind: 'desktop-package',
        isLatestDesktopAsset: false,
        isLatestWebAsset: false,
        serviceScope: 'local-cache',
      },
    };

    const result = await coordinator.download(
      version,
      cachePath,
      {
        async downloadPackage(_version: Version, destinationPath: string, onProgress?: any) {
          sourceDownloadCalled = true;
          onProgress?.({
            current: payload.length,
            total: payload.length,
            percentage: 100,
            stage: 'downloading',
            mode: 'http-direct',
            message: 'direct-http',
          });
          await fs.writeFile(destinationPath, payload);
        },
        async listAvailableVersions() {
          return [];
        },
      } as any,
      (progress) => {
        if (progress.message) {
          progressMessages.push(progress.message);
        }
      },
    );

    assert.equal(sourceDownloadCalled, true);
    assert.equal(result.policy.useHybrid, true);
    assert.equal(result.policy.seedEligible, false);
    assert.equal(result.finalMode, 'source-fallback');
    assert.ok(progressMessages.includes('torrent-unavailable-fallback'));
    assert.ok(progressMessages.includes('source-fallback-active'));
  });

  it('prefers official first for CN users when torrent fallback starts', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hybrid-download-cn-'));
    const cachePath = path.join(tempRoot, 'hagicode.zip');
    const payload = 'cn-official-success';
    const attempts: string[] = [];

    const coordinator = new HybridDownloadCoordinator({
      engine: {
        async download() {
          throw new Error('torrent handshake failed');
        },
        async stopAll() {},
      },
      regionDetector: {
        detectWithCache: () => ({
          region: 'CN',
          detectedAt: new Date('2026-04-06T00:00:00.000Z'),
          method: 'locale',
          localeSnapshot: 'zh-Hans-CN',
          rawLocale: 'zh-Hans-CN',
          matchedRule: 'zh-family',
        }),
      },
      settingsStore: { getSettings: () => baseSettings, updateSettings: () => baseSettings } as any,
      cacheRetentionManager: {
        async stopAllSeeding() {},
        async prune() {
          return { totalBytes: 0, removedEntries: [], retainedEntries: [] };
        },
        async markTrusted(record: any) {
          return record;
        },
        async discard() {},
      } as any,
    });

    const result = await coordinator.download(
      createMultiSourceVersion(payload),
      cachePath,
      {
        async downloadPackage(version: Version, destinationPath: string) {
          attempts.push(version.downloadUrl ?? '');
          await fs.writeFile(destinationPath, payload);
        },
        async listAvailableVersions() {
          return [];
        },
      } as any,
    );

    assert.equal(result.finalMode, 'source-fallback');
    assert.deepEqual(attempts, ['https://official.example.com/hagicode.zip']);
  });

  it('prefers GitHub Release first for international HTTP-only installs', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hybrid-download-intl-'));
    const cachePath = path.join(tempRoot, 'hagicode.zip');
    const payload = 'international-github-success';
    const attempts: string[] = [];
    let engineDownloadCalled = false;

    const coordinator = new HybridDownloadCoordinator({
      engine: {
        async download() {
          engineDownloadCalled = true;
        },
        async stopAll() {},
      },
      regionDetector: {
        detectWithCache: () => ({
          region: 'INTERNATIONAL',
          detectedAt: new Date('2026-04-06T00:00:00.000Z'),
          method: 'locale',
          localeSnapshot: 'en-US',
          rawLocale: 'en-US',
          matchedRule: 'default-international',
        }),
      },
      settingsStore: { getSettings: () => baseSettings, updateSettings: () => baseSettings } as any,
      cacheRetentionManager: {
        async stopAllSeeding() {},
        async prune() {
          return { totalBytes: 0, removedEntries: [], retainedEntries: [] };
        },
        async markTrusted(record: any) {
          return record;
        },
        async discard() {},
      } as any,
    });

    const result = await coordinator.download(
      createMultiSourceVersion(payload, {
        torrentUrl: undefined,
        infoHash: undefined,
        hasTorrentMetadata: false,
        torrentFirst: false,
        eligible: false,
        legacyHttpFallback: true,
      }),
      cachePath,
      {
        async downloadPackage(version: Version, destinationPath: string) {
          attempts.push(version.downloadUrl ?? '');
          await fs.writeFile(destinationPath, payload);
        },
        async listAvailableVersions() {
          return [];
        },
      } as any,
    );

    assert.equal(engineDownloadCalled, false);
    assert.equal(result.policy.reason, 'legacy-http');
    assert.equal(result.finalMode, 'source-fallback');
    assert.deepEqual(attempts, ['https://github.com/HagiCode-org/hagicode/releases/download/v1.0.0/hagicode.zip']);
  });

  it('falls back conservatively to official first when region detection is unknown', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hybrid-download-unknown-'));
    const cachePath = path.join(tempRoot, 'hagicode.zip');
    const payload = 'unknown-region-success';
    const attempts: string[] = [];

    const coordinator = new HybridDownloadCoordinator({
      engine: {
        async download() {
          throw new Error('torrent handshake failed');
        },
        async stopAll() {},
      },
      regionDetector: {
        detectWithCache: () => ({
          region: 'INTERNATIONAL',
          detectedAt: new Date('2026-04-06T00:00:00.000Z'),
          method: 'locale',
          localeSnapshot: null,
          rawLocale: null,
          matchedRule: 'error-fallback',
        }),
      },
      settingsStore: { getSettings: () => baseSettings, updateSettings: () => baseSettings } as any,
      cacheRetentionManager: {
        async stopAllSeeding() {},
        async prune() {
          return { totalBytes: 0, removedEntries: [], retainedEntries: [] };
        },
        async markTrusted(record: any) {
          return record;
        },
        async discard() {},
      } as any,
    });

    await coordinator.download(
      createMultiSourceVersion(payload),
      cachePath,
      {
        async downloadPackage(version: Version, destinationPath: string) {
          attempts.push(version.downloadUrl ?? '');
          await fs.writeFile(destinationPath, payload);
        },
        async listAvailableVersions() {
          return [];
        },
      } as any,
    );

    assert.deepEqual(attempts, ['https://official.example.com/hagicode.zip']);
  });

  it('switches to the backup source when the preferred source fails', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hybrid-download-backup-'));
    const cachePath = path.join(tempRoot, 'hagicode.zip');
    const payload = 'backup-source-success';
    const attempts: string[] = [];

    const coordinator = new HybridDownloadCoordinator({
      engine: {
        async download() {
          throw new Error('torrent handshake failed');
        },
        async stopAll() {},
      },
      regionDetector: {
        detectWithCache: () => ({
          region: 'INTERNATIONAL',
          detectedAt: new Date('2026-04-06T00:00:00.000Z'),
          method: 'locale',
          localeSnapshot: 'en-US',
          rawLocale: 'en-US',
          matchedRule: 'default-international',
        }),
      },
      settingsStore: { getSettings: () => baseSettings, updateSettings: () => baseSettings } as any,
      cacheRetentionManager: {
        async stopAllSeeding() {},
        async prune() {
          return { totalBytes: 0, removedEntries: [], retainedEntries: [] };
        },
        async markTrusted(record: any) {
          return record;
        },
        async discard() {},
      } as any,
    });

    const result = await coordinator.download(
      createMultiSourceVersion(payload),
      cachePath,
      {
        async downloadPackage(version: Version, destinationPath: string) {
          attempts.push(version.downloadUrl ?? '');
          if (version.downloadUrl?.includes('github.com')) {
            throw new Error('github timeout');
          }
          await fs.writeFile(destinationPath, payload);
        },
        async listAvailableVersions() {
          return [];
        },
      } as any,
    );

    assert.equal(result.finalMode, 'source-fallback');
    assert.deepEqual(attempts, [
      'https://github.com/HagiCode-org/hagicode/releases/download/v1.0.0/hagicode.zip',
      'https://official.example.com/hagicode.zip',
    ]);
  });

  it('returns one terminal error after both structured sources fail', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hybrid-download-dual-fail-'));
    const cachePath = path.join(tempRoot, 'hagicode.zip');
    const attempts: string[] = [];

    const coordinator = new HybridDownloadCoordinator({
      engine: {
        async download() {
          throw new Error('torrent handshake failed');
        },
        async stopAll() {},
      },
      regionDetector: {
        detectWithCache: () => ({
          region: 'CN',
          detectedAt: new Date('2026-04-06T00:00:00.000Z'),
          method: 'locale',
          localeSnapshot: 'zh-Hans-CN',
          rawLocale: 'zh-Hans-CN',
          matchedRule: 'zh-family',
        }),
      },
      settingsStore: { getSettings: () => baseSettings, updateSettings: () => baseSettings } as any,
      cacheRetentionManager: {
        async stopAllSeeding() {},
        async prune() {
          return { totalBytes: 0, removedEntries: [], retainedEntries: [] };
        },
        async markTrusted(record: any) {
          return record;
        },
        async discard() {},
      } as any,
    });

    await assert.rejects(
      () => coordinator.download(
        createMultiSourceVersion('dual-failure'),
        cachePath,
        {
          async downloadPackage(version: Version) {
            attempts.push(version.downloadUrl ?? '');
            throw new Error(version.downloadUrl?.includes('official') ? 'official offline' : 'github offline');
          },
          async listAvailableVersions() {
            return [];
          },
        } as any,
      ),
      /Attempted order: official -> github-release\. Terminal failure: github offline/,
    );

    assert.deepEqual(attempts, [
      'https://official.example.com/hagicode.zip',
      'https://github.com/HagiCode-org/hagicode/releases/download/v1.0.0/hagicode.zip',
    ]);
  });

  it('uses region-aware source ordering in portable mode without starting torrent', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hybrid-download-portable-order-'));
    const cachePath = path.join(tempRoot, 'hagicode.zip');
    const payload = 'portable-order-success';
    const attempts: string[] = [];
    let engineDownloadCalled = false;
    let engineStopCalled = false;
    let stopSeedingCalled = false;

    const coordinator = new HybridDownloadCoordinator({
      engine: {
        async download() {
          engineDownloadCalled = true;
        },
        async stopAll() {
          engineStopCalled = true;
        },
      },
      regionDetector: {
        detectWithCache: () => ({
          region: 'INTERNATIONAL',
          detectedAt: new Date('2026-04-06T00:00:00.000Z'),
          method: 'locale',
          localeSnapshot: 'en-US',
          rawLocale: 'en-US',
          matchedRule: 'default-international',
        }),
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

    const result = await coordinator.download(
      createMultiSourceVersion(payload),
      cachePath,
      {
        async downloadPackage(version: Version, destinationPath: string) {
          attempts.push(version.downloadUrl ?? '');
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

    assert.equal(result.finalMode, 'source-fallback');
    assert.equal(engineDownloadCalled, false);
    assert.equal(stopSeedingCalled, true);
    assert.equal(engineStopCalled, true);
    assert.deepEqual(attempts, ['https://github.com/HagiCode-org/hagicode/releases/download/v1.0.0/hagicode.zip']);
  });

  it('marks non-latest torrent assets as trusted local cache without seeding scope', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hybrid-download-local-cache-'));
    const cachePath = path.join(tempRoot, 'hagicode.zip');
    const payload = 'local-cache-success';
    let trustedRecord: any;

    const coordinator = new HybridDownloadCoordinator({
      engine: {
        async download(_version, destinationPath) {
          await fs.writeFile(destinationPath, payload);
        },
        async stopAll() {},
      },
      settingsStore: { getSettings: () => baseSettings, updateSettings: () => baseSettings } as any,
      cacheRetentionManager: {
        async stopAllSeeding() {},
        async prune() {
          return { totalBytes: 0, removedEntries: [], retainedEntries: [] };
        },
        async markTrusted(record: any) {
          trustedRecord = record;
          return record;
        },
        async discard() {},
      } as any,
    });

    await coordinator.download({
      id: 'v5',
      version: '1.0.2',
      platform: 'win-x64',
      packageFilename: 'hagicode.zip',
      sourceType: 'http-index',
      size: payload.length,
      hybrid: {
        torrentUrl: 'https://example.com/hagicode.torrent',
        infoHash: 'jkl',
        webSeeds: ['https://example.com/hagicode.zip'],
        sha256: sha256(payload),
        directUrl: 'https://example.com/hagicode.zip',
        hasTorrentMetadata: true,
        torrentFirst: true,
        eligible: true,
        legacyHttpFallback: false,
        thresholdBytes: 0,
        assetKind: 'desktop-package',
        isLatestDesktopAsset: false,
        isLatestWebAsset: false,
        serviceScope: 'local-cache',
      },
    }, cachePath, { downloadPackage: async () => undefined, listAvailableVersions: async () => [] } as any);

    assert.equal(trustedRecord.serviceScope, 'local-cache');
    assert.equal(trustedRecord.seedEligible, false);
  });
});
