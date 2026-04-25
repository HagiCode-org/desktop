import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { HagicoServerClient } from '../server.js';
import { HttpIndexPackageSource } from '../package-sources/http-index-source.js';
import type { DesktopHttpClient, HttpResponse } from '../http-client.js';

function response<T>(data: T, status = 200): HttpResponse<T> {
  return {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: {},
    data,
  };
}

function createHttpClient(overrides: Partial<DesktopHttpClient>): DesktopHttpClient {
  return {
    requestJson: async () => response({}),
    requestText: async () => response(''),
    requestBinary: async () => response(Buffer.alloc(0)),
    ...overrides,
  } as DesktopHttpClient;
}

async function readSource(relativePath: string): Promise<string> {
  return fs.readFile(path.resolve(process.cwd(), relativePath), 'utf-8');
}

describe('migrated network workflows', () => {
  it('loads package indexes and downloads package binaries through the internal HTTP client', async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-http-index-'));
    const cachePath = path.join(tmpDir, 'package.zip');
    const calls: string[] = [];
    const packageBytes = Buffer.from([7, 8, 9]);
    const packageName = process.platform === 'darwin'
      ? `hagicode-1.0.0-${process.arch === 'arm64' ? 'osx-arm64' : 'osx-x64'}-nort.zip`
      : process.platform === 'linux'
        ? `hagicode-1.0.0-${process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64'}-nort.zip`
        : 'hagicode-1.0.0-win-x64-nort.zip';
    const httpClient = createHttpClient({
      requestJson: async <T>(url: string) => {
        calls.push(`json:${url}`);
        return response({
          versions: [
            {
              version: '1.0.0',
              assets: [{ name: packageName, directUrl: 'https://downloads.example.com/package.zip' }],
            },
          ],
        } as T);
      },
      requestBinary: async (url, options) => {
        calls.push(`binary:${url}`);
        options?.onDownloadProgress?.({ loaded: packageBytes.length, total: packageBytes.length });
        return response(packageBytes);
      },
    });

    try {
      const source = new HttpIndexPackageSource({ type: 'http-index', indexUrl: 'https://example.com/index.json' }, httpClient);
      const versions = await source.listAvailableVersions();
      let lastProgress = 0;
      await source.downloadPackage(versions[0], cachePath, (progress) => {
        lastProgress = progress.percentage;
      });

      assert.deepEqual(calls, ['json:https://example.com/index.json', 'binary:https://downloads.example.com/package.zip']);
      assert.deepEqual([...await fs.readFile(cachePath)], [...packageBytes]);
      assert.equal(lastProgress, 100);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('preserves server API paths, methods, and returned status shape', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      calls.push({ url: String(input), method: init?.method ?? 'GET' });
      return new Response(JSON.stringify({ running: true, version: '2.0.0', uptime: 12, startTime: 'now' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const client = new HagicoServerClient({ host: '127.0.0.1', port: 36599, apiKey: 'key' });
      const status = await client.getStatus();
      const started = await client.startServer();

      assert.deepEqual(status, { status: 'running', version: '2.0.0', uptime: 12, startTime: 'now' });
      assert.equal(started, true);
      assert.deepEqual(calls, [
        { url: 'http://127.0.0.1:36599/api/status', method: 'GET' },
        { url: 'http://127.0.0.1:36599/api/server/start', method: 'POST' },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('keeps RSS, legal metadata, and web-service health checks on the internal HTTP client', async () => {
    const rssSource = await readSource('src/main/rss-feed-manager.ts');
    const onboardingSource = await readSource('src/main/onboarding-manager.ts');
    const webServiceSource = await readSource('src/main/web-service-manager.ts');

    assert.match(rssSource, /this\.httpClient\.requestText\(this\.config\.feedUrl/);
    assert.match(onboardingSource, /desktopHttpClient\.requestJson<PublishedLegalDocumentsPayload>\(url/);
    assert.match(webServiceSource, /this\.httpClient\.requestText\(url/);
    const removedClientName = new RegExp(['ax', 'ios'].join(''));
    assert.doesNotMatch(rssSource, removedClientName);
    assert.doesNotMatch(onboardingSource, removedClientName);
    assert.doesNotMatch(webServiceSource, removedClientName);
  });
});
