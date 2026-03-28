import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import axios from 'axios';
import { HttpIndexPackageSource } from '../package-sources/http-index-source.js';

describe('http index hybrid metadata support', () => {
  it('enables torrent-first for any asset that exposes torrent metadata and preserves latest desktop/server scopes', async () => {
    const originalGet = axios.get;
    axios.get = (async () => ({
      status: 200,
      data: {
        versions: [
          {
            version: '1.2.3',
            assets: [
              {
                name: 'hagicode-1.2.3-linux-x64-nort.zip',
                size: 1024,
                path: '/desktop/hagicode-1.2.3-linux-x64-nort.zip',
                torrentUrl: '/desktop/hagicode-1.2.3-linux-x64-nort.zip.torrent',
                infoHash: 'desktophash',
                webSeeds: ['/desktop/hagicode-1.2.3-linux-x64-nort.zip'],
                sha256: 'desktopsha',
              },
              {
                name: 'hagicode-web-1.2.3-linux-x64-deploy.zip',
                size: 2048,
                path: '/server/hagicode-web-1.2.3-linux-x64-deploy.zip',
                torrentUrl: '/server/hagicode-web-1.2.3-linux-x64-deploy.zip.torrent',
                infoHash: 'serverhash',
                webSeeds: ['/server/hagicode-web-1.2.3-linux-x64-deploy.zip'],
                sha256: 'serversha',
              },
            ],
          },
        ],
        channels: {
          stable: {
            latest: '1.2.3',
            versions: ['1.2.3'],
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
      assert.equal(server.hybrid?.torrentFirst, true);
      assert.equal(server.hybrid?.hasTorrentMetadata, true);
      assert.equal(server.hybrid?.serviceScope, 'latest-server');
    } finally {
      axios.get = originalGet;
    }
  });

  it('ignores non-zip assets when building installable versions', async () => {
    const originalGet = axios.get;
    axios.get = (async () => ({
      status: 200,
      data: {
        versions: [
          {
            version: '1.2.4',
            assets: [
              {
                name: 'hagicode-1.2.4-linux-x64-nort.zip',
                size: 1024,
                path: '/desktop/hagicode-1.2.4-linux-x64-nort.zip',
              },
              {
                name: 'hagicode-1.2.4-linux-x64-nort.zip.sig',
                size: 128,
                path: '/desktop/hagicode-1.2.4-linux-x64-nort.zip.sig',
              },
              {
                name: 'hagicode-web-1.2.4-linux-x64-deploy.tar.gz',
                size: 4096,
                path: '/server/hagicode-web-1.2.4-linux-x64-deploy.tar.gz',
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
      assert.equal(versions[0].packageFilename, 'hagicode-1.2.4-linux-x64-nort.zip');
    } finally {
      axios.get = originalGet;
    }
  });

  it('keeps compatibility with legacy files projections when assets are absent', async () => {
    const originalGet = axios.get;
    axios.get = (async () => ({
      status: 200,
      data: {
        versions: [
          {
            version: '1.2.2',
            files: [
              'https://example.com/hagicode-1.2.2-linux-x64-nort.zip',
            ],
          },
        ],
      },
    })) as typeof axios.get;

    try {
      const source = new HttpIndexPackageSource({ type: 'http-index', indexUrl: 'https://example.com/index.json' });
      const versions = await source.listAvailableVersions();

      assert.equal(versions.length, 1);
      assert.equal(versions[0].packageFilename, 'hagicode-1.2.2-linux-x64-nort.zip');
      assert.equal(versions[0].hybrid?.eligible, false);
      assert.equal(versions[0].hybrid?.legacyHttpFallback, true);
    } finally {
      axios.get = originalGet;
    }
  });
});
