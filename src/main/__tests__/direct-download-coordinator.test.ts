import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import type { DownloadSource } from '../../types/version-download.js';
import type { PackageSource } from '../package-sources/package-source.js';
import { DirectDownloadCoordinator } from '../distribution/direct-download-coordinator.js';
import type { Version } from '../version-manager.js';

const temporaryDirectories: string[] = [];

async function createCachePath(): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-direct-download-'));
  temporaryDirectories.push(directory);
  return path.join(directory, 'package.zip');
}

function sourceStub(
  attempt: (url: string, cachePath: string) => Promise<void>,
  requests: string[],
): PackageSource {
  return {
    type: 'http-index',
    listAvailableVersions: async () => [],
    downloadPackage: async (version, cachePath) => {
      const url = version.downloadUrl ?? '';
      requests.push(url);
      await attempt(url, cachePath);
    },
  };
}

function version(overrides: Partial<Version> = {}): Version {
  return {
    id: 'hagicode-1.2.3-linux-x64-nort',
    version: '1.2.3',
    platform: 'linux-x64',
    packageFilename: 'hagicode-1.2.3-linux-x64-nort.zip',
    sourceType: 'http-index',
    downloadUrl: 'https://official.example.com/package.zip',
    ...overrides,
  };
}

function source(kind: DownloadSource['kind'], url: string, extra: Partial<DownloadSource> = {}): DownloadSource {
  return { kind, label: kind, url, primary: false, ...extra };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe('DirectDownloadCoordinator', () => {
  it('uses effective service region and retries each direct source once after deleting partial data', async () => {
    const cachePath = await createCachePath();
    const requests: string[] = [];
    const coordinator = new DirectDownloadCoordinator({
      serviceRegionProvider: () => 'CN',
      regionDetector: {
        detectWithCache: () => ({
          region: 'INTERNATIONAL',
          detectedAt: new Date(),
          method: 'locale',
          localeSnapshot: 'en-US',
          rawLocale: 'en-US',
          matchedRule: 'default-international',
        }),
      },
    });
    const packageSource = sourceStub(async (url, targetPath) => {
      if (url.includes('cn.example.com')) {
        await fs.writeFile(targetPath, 'partial');
        throw new Error('mirror unavailable');
      }
      assert.equal(await fs.readFile(targetPath, 'utf8').catch(() => ''), '');
      await fs.writeFile(targetPath, 'complete');
    }, requests);
    const digest = createHash('sha256').update('complete').digest('hex');
    const packageVersion = version({
      sha256: digest,
      downloadSources: [
        source('official', 'https://official.example.com/package.zip', {
          urls: {
            china: 'https://cn.example.com/package.zip',
            international: 'https://official.example.com/package.zip',
          },
          primary: true,
        }),
        source('github-release', 'https://github.example.com/package.zip'),
      ],
    });

    const result = await coordinator.download(packageVersion, cachePath, packageSource);
    assert.deepEqual(requests, [
      'https://cn.example.com/package.zip',
      'https://github.example.com/package.zip',
    ]);
    assert.equal(result.verified, true);
    assert.equal(result.finalMode, 'source-fallback');
    assert.equal(await fs.readFile(cachePath, 'utf8'), 'complete');
  });

  it('uses GitHub before the official source for international users', async () => {
    const cachePath = await createCachePath();
    const requests: string[] = [];
    const coordinator = new DirectDownloadCoordinator({
      regionDetector: {
        detectWithCache: () => ({
          region: 'INTERNATIONAL',
          detectedAt: new Date(),
          method: 'locale',
          localeSnapshot: 'en-US',
          rawLocale: 'en-US',
          matchedRule: 'default-international',
        }),
      },
    });
    const packageSource = sourceStub(async (_url, targetPath) => fs.writeFile(targetPath, 'package'), requests);

    await coordinator.download(version({
      downloadSources: [
        source('official', 'https://official.example.com/package.zip'),
        source('github-release', 'https://github.example.com/package.zip'),
      ],
    }), cachePath, packageSource);

    assert.deepEqual(requests, ['https://github.example.com/package.zip']);
  });

  it('keeps a legacy direct URL ahead of GitHub when no official structured source exists', async () => {
    const cachePath = await createCachePath();
    const requests: string[] = [];
    const packageSource = sourceStub(async (_url, targetPath) => fs.writeFile(targetPath, 'package'), requests);

    await new DirectDownloadCoordinator().download(version({
      downloadUrl: 'https://official.example.com/legacy-package.zip',
      downloadSources: [source('github-release', 'https://github.example.com/package.zip')],
    }), cachePath, packageSource);

    assert.deepEqual(requests, ['https://official.example.com/legacy-package.zip']);
  });

  it('reports all direct source failures and removes the final partial archive', async () => {
    const cachePath = await createCachePath();
    const requests: string[] = [];
    const packageSource = sourceStub(async (_url, targetPath) => {
      await fs.writeFile(targetPath, 'partial');
      throw new Error('unavailable');
    }, requests);
    const packageVersion = version({
      downloadSources: [
        source('official', 'https://official.example.com/package.zip'),
        source('github-release', 'https://github.example.com/package.zip'),
      ],
    });

    await assert.rejects(
      new DirectDownloadCoordinator().download(packageVersion, cachePath, packageSource),
      /All direct download sources failed.*official\.example\.com.*github\.example\.com/,
    );
    assert.deepEqual(requests, [
      'https://official.example.com/package.zip',
      'https://github.example.com/package.zip',
    ]);
    await assert.rejects(fs.access(cachePath));
  });

  it('fails explicitly when the HTTP index record has no direct URL', async () => {
    const cachePath = await createCachePath();
    const requests: string[] = [];
    const packageSource = sourceStub(async () => assert.fail('unexpected download'), requests);

    await assert.rejects(
      new DirectDownloadCoordinator().download(version({ downloadUrl: undefined }), cachePath, packageSource),
      /No direct download URL available/,
    );
    assert.deepEqual(requests, []);
  });

  it('rejects a digest mismatch and removes the untrusted archive', async () => {
    const cachePath = await createCachePath();
    const requests: string[] = [];
    const packageSource = sourceStub(async (_url, targetPath) => fs.writeFile(targetPath, 'untrusted'), requests);

    await assert.rejects(
      new DirectDownloadCoordinator().download(version({ sha256: '0'.repeat(64) }), cachePath, packageSource),
      /sha256 verification failed/,
    );
    await assert.rejects(fs.access(cachePath));
  });

  it('retains a predownload archive after its published digest is verified', async () => {
    const cachePath = await createCachePath();
    const contents = 'verified archive';
    await fs.writeFile(cachePath, contents);
    const digest = createHash('sha256').update(contents).digest('hex');

    const verified = await new DirectDownloadCoordinator().verify(
      version({ sha256: digest }),
      cachePath,
    );

    assert.equal(verified, true);
    assert.equal(await fs.readFile(cachePath, 'utf8'), contents);
  });
});
