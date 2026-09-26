import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HttpIndexPackageSource } from '../package-sources/http-index-source.js';
import type { DesktopHttpClient, HttpResponse } from '../http-client.js';

function stubHttpClient<T>(data: T): DesktopHttpClient {
  const jsonResponse: HttpResponse<T> = {
    status: 200,
    statusText: 'OK',
    headers: {},
    data,
  };

  return {
    requestJson: async () => jsonResponse as HttpResponse<unknown>,
    requestText: async () => ({ status: 200, statusText: 'OK', headers: {}, data: 'ok' }),
    requestBinary: async () => ({ status: 200, statusText: 'OK', headers: {}, data: Buffer.from('package') }),
  } as DesktopHttpClient;
}

function currentPlatform(): string {
  if (process.platform === 'linux') {
    return process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  }
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'osx-arm64' : 'osx-x64';
  }
  return 'win-x64';
}

const assetName = (version: string) => `hagicode-${version}-${currentPlatform()}-nort.zip`;
const sha256 = 'a'.repeat(64);

describe('HTTP index direct download normalization', () => {
  it('keeps direct structured mirrors and digest while ignoring legacy peer metadata', async () => {
    const filename = assetName('1.2.3');
    const source = new HttpIndexPackageSource(
      { type: 'http-index', indexUrl: 'https://example.com/index.json' },
      stubHttpClient({
        versions: [{
          version: '1.2.3',
          assets: [{
            name: filename,
            size: 2 * 1024 * 1024 * 1024,
            path: `./desktop/${filename}`,
            torrentUrl: `./desktop/${filename}.torrent`,
            infoHash: 'legacy-hash',
            webSeeds: ['https://peer.example.com/file'],
            downloadSources: [
              { kind: 'official', label: 'Official', url: `./desktop/${filename}`, primary: true },
              { kind: 'github-release', label: 'GitHub', url: `https://github.com/releases/${filename}` },
            ],
            sha256,
          }],
        }],
      }),
    );

    const [version] = await source.listAvailableVersions();
    assert.ok(version);
    assert.equal(version.size, 2 * 1024 * 1024 * 1024);
    assert.equal(version.downloadUrl, `https://example.com/desktop/${filename}`);
    assert.equal(version.sha256, sha256);
    assert.deepEqual(version.downloadSources, [
      {
        kind: 'official',
        label: 'Official',
        url: `https://example.com/desktop/${filename}`,
        primary: true,
      },
      {
        kind: 'github-release',
        label: 'GitHub',
        url: `https://github.com/releases/${filename}`,
        primary: false,
      },
    ]);
    assert.equal('torrentUrl' in version, false);
    assert.equal('infoHash' in version, false);
  });

  it('resolves a legacy relative path even when peer fields are present', async () => {
    const filename = assetName('1.2.4');
    const source = new HttpIndexPackageSource(
      { type: 'http-index', indexUrl: 'https://example.com/server/index.json' },
      stubHttpClient({
        versions: [{
          version: '1.2.4',
          assets: [{
            name: filename,
            path: `./official/${filename}`,
            torrentUrl: './legacy.torrent',
            infoHash: 'old',
          }],
        }],
      }),
    );

    const validation = await source.validateConfig();
    const [version] = await source.listAvailableVersions();
    assert.equal(validation.valid, true);
    assert.equal(version?.downloadUrl, `https://example.com/server/official/${filename}`);
    assert.equal(version?.downloadSources?.length, 0);
  });

  it('preserves official regional URLs for region-aware source selection', async () => {
    const filename = assetName('1.2.5');
    const source = new HttpIndexPackageSource(
      { type: 'http-index', indexUrl: 'https://dl.example.com/index.json' },
      stubHttpClient({
        versions: [{
          version: '1.2.5',
          assets: [{
            name: filename,
            directUrl: `https://dl.example.com/${filename}`,
            downloadSources: [{
              kind: 'official',
              url: `https://dl.example.com/${filename}`,
              urls: {
                china: `https://cn.example.com/${filename}`,
                international: `./1.2.5/${filename}`,
              },
            }],
          }],
        }],
      }),
    );

    const [version] = await source.listAvailableVersions();
    assert.deepEqual(version?.downloadSources?.[0]?.urls, {
      china: `https://cn.example.com/${filename}`,
      international: `https://dl.example.com/1.2.5/${filename}`,
    });
  });

  it('skips malformed structured mirrors when a valid legacy URL remains', async () => {
    const filename = assetName('1.2.6');
    const source = new HttpIndexPackageSource(
      { type: 'http-index', indexUrl: 'https://example.com/index.json' },
      stubHttpClient({
        versions: [{
          version: '1.2.6',
          assets: [{
            name: filename,
            directUrl: `https://downloads.example.com/${filename}`,
            downloadSources: [
              { kind: 'unknown', url: 'https://invalid.example.com/file' },
              { kind: 'github-release', url: 'ftp://invalid.example.com/file' },
            ],
          }],
        }],
      }),
    );

    const [version] = await source.listAvailableVersions();
    assert.equal(version?.downloadUrl, `https://downloads.example.com/${filename}`);
    assert.deepEqual(version?.downloadSources, []);
  });

  it('rejects an index asset with no resolvable direct URL', async () => {
    const source = new HttpIndexPackageSource(
      { type: 'http-index', indexUrl: 'https://example.com/index.json' },
      stubHttpClient({
        versions: [{
          version: '9.9.9',
          assets: [{ name: assetName('9.9.9'), torrentUrl: 'https://example.com/file.torrent' }],
        }],
      }),
    );

    const result = await source.validateConfig();
    assert.equal(result.valid, false);
    assert.match(result.error ?? '', /Invalid index file format/);
  });

  it('rejects malformed SHA-256 values rather than skipping integrity verification', async () => {
    const source = new HttpIndexPackageSource(
      { type: 'http-index', indexUrl: 'https://example.com/index.json' },
      stubHttpClient({
        versions: [{
          version: '1.2.7',
          assets: [{ name: assetName('1.2.7'), path: './package.zip', sha256: 'not-a-digest' }],
        }],
      }),
    );

    await assert.rejects(source.listAvailableVersions(), /Invalid SHA-256 digest/);
  });
});
