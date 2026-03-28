import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import axios from 'axios';
import { HttpIndexPackageSource } from '../package-sources/http-index-source.js';

function currentPlatform() {
  if (process.platform === 'linux') {
    return process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  }
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'osx-arm64' : 'osx-x64';
  }
  return 'win-x64';
}

function desktopAssetName(version: string) {
  return `hagicode-${version}-${currentPlatform()}-nort.zip`;
}

function serverAssetName(version: string) {
  return `hagicode-web-${version}-${currentPlatform()}-deploy.zip`;
}

describe('http index hybrid metadata support', () => {
  it('enables torrent-first for any asset that exposes torrent metadata and preserves latest desktop/server scopes', async () => {
    const version = '1.2.3';
    const desktopName = desktopAssetName(version);
    const serverName = serverAssetName(version);
    const originalGet = axios.get;
    axios.get = (async () => ({
      status: 200,
      data: {
        versions: [
          {
            version,
            assets: [
              {
                name: desktopName,
                size: 1024,
                path: `./desktop/${desktopName}`,
                torrentUrl: `./desktop/${desktopName}.torrent`,
                infoHash: 'desktophash',
                webSeeds: [`./desktop/${desktopName}`],
                sha256: 'desktopsha',
              },
              {
                name: serverName,
                size: 2048,
                path: `./server/${serverName}`,
                torrentUrl: `./server/${serverName}.torrent`,
                infoHash: 'serverhash',
                webSeeds: [`./server/${serverName}`],
                sha256: 'serversha',
              },
            ],
          },
        ],
        channels: {
          stable: {
            latest: version,
            versions: [version],
          },
        },
      },
    })) as typeof axios.get;

    try {
      const source = new HttpIndexPackageSource({ type: 'http-index', indexUrl: 'https://example.com/index.json' });
      const versions = await source.listAvailableVersions();
      const desktop = versions.find((version) => version.assetKind === 'desktop-latest');
      const server = versions.find((version) => version.assetKind === 'web-latest');

      assert.ok(desktop);
      assert.ok(server);
      assert.equal(desktop.hybrid?.torrentFirst, true);
      assert.equal(desktop.hybrid?.eligible, true);
      assert.equal(desktop.hybrid?.thresholdBytes, 0);
      assert.equal(desktop.hybrid?.serviceScope, 'latest-desktop');
      assert.equal(desktop.downloadUrl, `https://example.com/desktop/${desktopName}`);
      assert.equal(desktop.hybrid?.torrentUrl, `https://example.com/desktop/${desktopName}.torrent`);
      assert.deepEqual(desktop.hybrid?.webSeeds, [`https://example.com/desktop/${desktopName}`]);
      assert.equal(server.hybrid?.torrentFirst, true);
      assert.equal(server.hybrid?.hasTorrentMetadata, true);
      assert.equal(server.hybrid?.serviceScope, 'latest-server');
      assert.equal(server.downloadUrl, `https://example.com/server/${serverName}`);
    } finally {
      axios.get = originalGet;
    }
  });

  it('accepts official-style assets that only provide a relative path and omit optional hybrid metadata', async () => {
    const version = '1.2.5';
    const packageName = desktopAssetName(version);
    const originalGet = axios.get;
    axios.get = (async () => ({
      status: 200,
      data: {
        versions: [
          {
            version,
            assets: [
              {
                name: packageName,
                size: 512,
                path: `./official/${packageName}`,
              },
            ],
          },
        ],
      },
    })) as typeof axios.get;

    try {
      const source = new HttpIndexPackageSource({ type: 'http-index', indexUrl: 'https://example.com/server/index.json' });
      const validation = await source.validateConfig();
      const versions = await source.listAvailableVersions();

      assert.equal(validation.valid, true);
      assert.equal(versions.length, 1);
      assert.equal(versions[0].downloadUrl, `https://example.com/server/official/${packageName}`);
      assert.equal(versions[0].hybrid?.hasTorrentMetadata, false);
      assert.equal(versions[0].hybrid?.legacyHttpFallback, true);
      assert.deepEqual(versions[0].hybrid?.webSeeds, [`https://example.com/server/official/${packageName}`]);
    } finally {
      axios.get = originalGet;
    }
  });

  it('ignores non-zip assets when building installable versions', async () => {
    const version = '1.2.4';
    const packageName = desktopAssetName(version);
    const originalGet = axios.get;
    axios.get = (async () => ({
      status: 200,
      data: {
        versions: [
          {
            version,
            assets: [
              {
                name: packageName,
                size: 1024,
                path: `/desktop/${packageName}`,
              },
              {
                name: `${packageName}.sig`,
                size: 128,
                path: `/desktop/${packageName}.sig`,
              },
              {
                name: serverAssetName(version).replace(/\.zip$/, '.tar.gz'),
                size: 4096,
                path: `/server/${serverAssetName(version).replace(/\.zip$/, '.tar.gz')}`,
              },
            ],
          },
        ],
      },
    })) as typeof axios.get;

    try {
      const source = new HttpIndexPackageSource({ type: 'http-index', indexUrl: 'https://example.com/index.json' });
      const versions = await source.listAvailableVersions();

      assert.equal(versions.length, 1);
      assert.equal(versions[0].packageFilename, packageName);
    } finally {
      axios.get = originalGet;
    }
  });

  it('keeps compatibility with legacy files projections when assets are absent', async () => {
    const version = '1.2.2';
    const packageName = desktopAssetName(version);
    const originalGet = axios.get;
    axios.get = (async () => ({
      status: 200,
      data: {
        versions: [
          {
            version,
            files: [
              `https://example.com/${packageName}`,
            ],
          },
        ],
      },
    })) as typeof axios.get;

    try {
      const source = new HttpIndexPackageSource({ type: 'http-index', indexUrl: 'https://example.com/index.json' });
      const versions = await source.listAvailableVersions();

      assert.equal(versions.length, 1);
      assert.equal(versions[0].packageFilename, packageName);
      assert.equal(versions[0].hybrid?.eligible, false);
      assert.equal(versions[0].hybrid?.legacyHttpFallback, true);
    } finally {
      axios.get = originalGet;
    }
  });

  it('rejects assets that have a name but cannot be resolved to a download target', async () => {
    const originalGet = axios.get;
    axios.get = (async () => ({
      status: 200,
      data: {
        versions: [
          {
            version: '9.9.9',
            assets: [
              {
                name: desktopAssetName('9.9.9'),
                size: 1,
              },
            ],
          },
        ],
      },
    })) as typeof axios.get;

    try {
      const source = new HttpIndexPackageSource({ type: 'http-index', indexUrl: 'https://example.com/index.json' });
      const validation = await source.validateConfig();

      assert.equal(validation.valid, false);
      assert.match(validation.error ?? '', /Invalid index file format/);
    } finally {
      axios.get = originalGet;
    }
  });
});
