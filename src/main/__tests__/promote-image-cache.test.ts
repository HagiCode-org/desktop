import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { requestBinary } from '../http-client.js';
import { detectImageType, imageKeyForUrl, isPositiveInteger, PromoteImageCache, type PromoteImageTier, resolveImageSource } from '../promote-image-cache.js';

const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(24, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(24, 2)]);
const GIF = Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(24, 3)]);
const PROMOTE_TEST_ORIGIN = 'https://index.hagicode.com';
const WEBP = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.from([0x20, 0, 0, 0]), Buffer.from('WEBP', 'latin1'), Buffer.alloc(16, 4)]);
const AVIF = Buffer.concat([Buffer.from([0, 0, 0, 0x1c]), Buffer.from('ftypavif', 'latin1'), Buffer.alloc(16, 5)]);

interface Route {
  status?: number;
  headers?: Record<string, string>;
  body?: Buffer | string;
  hang?: boolean;
}

interface TestServer {
  origin: string;
  port: number;
  hits: string[];
  close: () => Promise<void>;
}

const temporaryDirectories: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  })));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

async function startServer(routes: Map<string, Route>): Promise<TestServer> {
  const hits: string[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = request.url ?? '/';
    hits.push(url);
    const route = routes.get(url);
    if (route?.hang) return;
    if (!route) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(route.status ?? 200, route.headers ?? {});
    response.end(route.body ?? '');
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    port,
    hits,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}

async function createImageDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'promote-image-cache-'));
  temporaryDirectories.push(root);
  return path.join(root, 'images');
}

function imageRoute(body: Buffer, contentType = 'image/png'): Route {
  return { status: 200, headers: { 'content-type': contentType, 'content-length': String(body.length) }, body };
}

function createCache(
  imageDir: string,
  origin: string,
  overrides: { maxBytes?: number; now?: () => number; budgetMs?: number; tierTimeoutMs?: number } = {},
): PromoteImageCache {
  return new PromoteImageCache({ imageDir, indexOrigin: origin, budgetMs: 15_000, ...overrides });
}

async function listDirectory(directory: string): Promise<string[]> {
  return (await fs.readdir(directory).catch(() => [])).sort();
}

describe('detectImageType', () => {
  it('identifies PNG, JPEG, GIF, WebP and AVIF from the leading bytes', () => {
    assert.deepEqual(detectImageType(PNG), { ext: 'png', contentType: 'image/png' });
    assert.deepEqual(detectImageType(JPEG), { ext: 'jpg', contentType: 'image/jpeg' });
    assert.deepEqual(detectImageType(GIF), { ext: 'gif', contentType: 'image/gif' });
    assert.deepEqual(detectImageType(WEBP), { ext: 'webp', contentType: 'image/webp' });
    assert.deepEqual(detectImageType(AVIF), { ext: 'avif', contentType: 'image/avif' });
  });

  it('rejects SVG, BMP, HTML and empty content', () => {
    assert.equal(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
    assert.equal(detectImageType(Buffer.from('BM\0\0\0\0')), null);
    assert.equal(detectImageType(Buffer.from('<html></html>')), null);
    assert.equal(detectImageType(Buffer.alloc(0)), null);
  });
});

describe('resolveImageSource and keys', () => {
  it('derives a stable 32-character lowercase key from the resolved absolute URL', () => {
    const url = resolveImageSource(' /images/a.png ', 'https://index.hagicode.com');
    assert.equal(url?.href, 'https://index.hagicode.com/images/a.png');
    const key = imageKeyForUrl(url!);
    assert.match(key, /^[0-9a-f]{32}$/);
    assert.equal(key, imageKeyForUrl(new URL('https://index.hagicode.com/images/a.png')));
    assert.notEqual(key, imageKeyForUrl(new URL('https://index.hagicode.com/images/b.png')));
  });

  it('rejects other origins, other ports, other schemes, protocol-relative and credentialed URLs', () => {
    const origin = 'https://index.hagicode.com';
    for (const src of [
      'https://cdn.example.com/a.png',
      'https://index.hagicode.com:8443/a.png',
      'http://index.hagicode.com/a.png',
      '//index.hagicode.com/a.png',
      'https://user:secret@index.hagicode.com/a.png',
      'javascript:alert(1)',
      '',
    ]) {
      assert.equal(resolveImageSource(src, origin), null, src);
    }
  });

  it('accepts only positive integers as dimensions', () => {
    assert.equal(isPositiveInteger(1), true);
    for (const value of [0, -1, 1.5, '1', null, undefined, Number.NaN]) {
      assert.equal(isPositiveInteger(value), false, String(value));
    }
  });
});

describe('PromoteImageCache.ensureImages', () => {
  it('resolves relative sources against the Index origin and stores the image under its key', async () => {
    const server = await startServer(new Map([['/images/a.png', imageRoute(PNG)]]));
    const imageDir = await createImageDir();
    const cache = createCache(imageDir, server.origin);

    const result = await cache.ensureImages([{ src: '/images/a.png', width: 1200, height: 630 }]);

    const key = cache.keyForSource('/images/a.png');
    assert.ok(key);
    assert.deepEqual(result.get(key), { fileName: `${key}.png`, contentType: 'image/png' });
    assert.deepEqual(await fs.readFile(path.join(imageDir, `${key}.png`)), PNG);
    assert.deepEqual(server.hits, ['/images/a.png']);
    await server.close();
  });

  it('rejects other origins and credentialed URLs without sending a request', async () => {
    const server = await startServer(new Map([['/images/a.png', imageRoute(PNG)]]));
    const cache = createCache(await createImageDir(), server.origin);
    const sources = [
      'https://example.com/images/a.png',
      `${server.origin.replace(/:\d+$/, ':1')}/images/a.png`,
      `https://127.0.0.1:${server.port}/images/a.png`,
      `//127.0.0.1:${server.port}/images/a.png`,
      `http://user:pass@127.0.0.1:${server.port}/images/a.png`,
    ];

    const result = await cache.ensureImages(sources.map((src) => ({ src, width: 1, height: 1 })));

    assert.equal(result.size, 0);
    assert.deepEqual(server.hits, []);
    await server.close();
  });

  it('does not follow redirects, neither to the same origin nor to another one', async () => {
    const routes = new Map<string, Route>([
      ['/images/same.png', { status: 302, headers: { location: '/images/a.png' } }],
      ['/images/a.png', imageRoute(PNG)],
    ]);
    const server = await startServer(routes);
    routes.set('/images/other.png', { status: 302, headers: { location: `http://localhost:${server.port}/images/a.png` } });
    const cache = createCache(await createImageDir(), server.origin);

    const result = await cache.ensureImages([
      { src: '/images/same.png', width: 1, height: 1 },
      { src: '/images/other.png', width: 1, height: 1 },
    ]);

    assert.equal(result.size, 0);
    assert.deepEqual(server.hits.sort(), ['/images/other.png', '/images/same.png']);
    await server.close();
  });

  it('rejects non-200 responses', async () => {
    const server = await startServer(new Map([['/images/a.png', { status: 404, headers: { 'content-type': 'image/png' }, body: PNG }]]));
    const imageDir = await createImageDir();

    const result = await createCache(imageDir, server.origin).ensureImages([{ src: '/images/a.png', width: 1, height: 1 }]);

    assert.equal(result.size, 0);
    assert.deepEqual(await listDirectory(imageDir), []);
    await server.close();
  });

  it('aborts an oversize body and stores nothing', async () => {
    const server = await startServer(new Map([['/images/big.png', imageRoute(Buffer.concat([PNG, Buffer.alloc(4096)]))]]));
    const imageDir = await createImageDir();

    const result = await createCache(imageDir, server.origin, { maxBytes: 1024 })
      .ensureImages([{ src: '/images/big.png', width: 1, height: 1 }]);

    assert.equal(result.size, 0);
    assert.deepEqual(await listDirectory(imageDir), []);
    await server.close();
  });

  it('rejects a body labelled as an image whose bytes are not an image', async () => {
    const server = await startServer(new Map([['/images/a.png', imageRoute(Buffer.from('<html>nope</html>'))]]));
    const imageDir = await createImageDir();

    const result = await createCache(imageDir, server.origin).ensureImages([{ src: '/images/a.png', width: 1, height: 1 }]);

    assert.equal(result.size, 0);
    assert.deepEqual(await listDirectory(imageDir), []);
    await server.close();
  });

  it('takes the stored type from the bytes, never from the Content-Type header', async () => {
    const server = await startServer(new Map([
      ['/images/jpeg-as-text.png', imageRoute(JPEG, 'text/plain')],
      ['/images/webp-as-png.png', imageRoute(WEBP, 'image/png')],
    ]));
    const cache = createCache(await createImageDir(), server.origin);

    const result = await cache.ensureImages([
      { src: '/images/jpeg-as-text.png', width: 1, height: 1 },
      { src: '/images/webp-as-png.png', width: 1, height: 1 },
    ]);

    const jpegKey = cache.keyForSource('/images/jpeg-as-text.png')!;
    const webpKey = cache.keyForSource('/images/webp-as-png.png')!;
    assert.deepEqual(result.get(jpegKey), { fileName: `${jpegKey}.jpg`, contentType: 'image/jpeg' });
    assert.deepEqual(result.get(webpKey), { fileName: `${webpKey}.webp`, contentType: 'image/webp' });
    await server.close();
  });

  it('rejects SVG and other image types outside the supported list', async () => {
    const server = await startServer(new Map([
      ['/images/vector.svg', imageRoute(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml')],
      ['/images/bitmap.bmp', imageRoute(Buffer.from('BM\0\0\0\0'), 'image/bmp')],
    ]));
    const imageDir = await createImageDir();

    const result = await createCache(imageDir, server.origin).ensureImages([
      { src: '/images/vector.svg', width: 1, height: 1 },
      { src: '/images/bitmap.bmp', width: 1, height: 1 },
    ]);

    assert.equal(result.size, 0);
    assert.deepEqual(await listDirectory(imageDir), []);
    await server.close();
  });

  it('treats a missing or invalid dimension as absent without a request', async () => {
    const server = await startServer(new Map([['/images/a.png', imageRoute(PNG)]]));
    const imageDir = await createImageDir();

    const result = await createCache(imageDir, server.origin).ensureImages([
      { src: '/images/a.png', width: 0, height: 1 },
      { src: '/images/a.png', width: '1', height: 1 },
      { src: '/images/a.png', width: 1, height: 1.5 },
      { src: '/images/a.png', width: undefined, height: 1 },
    ]);

    assert.equal(result.size, 0);
    assert.deepEqual(server.hits, []);
    await server.close();
  });

  it('reuses a stored file by name without sending a request', async () => {
    const server = await startServer(new Map([['/images/a.png', imageRoute(PNG)]]));
    const imageDir = await createImageDir();
    const cache = createCache(imageDir, server.origin);
    const key = cache.keyForSource('/images/a.png')!;
    await fs.mkdir(imageDir, { recursive: true });
    await fs.writeFile(path.join(imageDir, `${key}.png`), PNG);

    const result = await cache.ensureImages([{ src: '/images/a.png', width: 1, height: 1 }]);

    assert.deepEqual(result.get(key), { fileName: `${key}.png`, contentType: 'image/png' });
    assert.deepEqual(server.hits, []);
    await server.close();
  });

  it('leaves only the final file name in the folder after a successful write', async () => {
    const server = await startServer(new Map([['/images/a.png', imageRoute(PNG)]]));
    const imageDir = await createImageDir();
    const cache = createCache(imageDir, server.origin);

    await cache.ensureImages([{ src: '/images/a.png', width: 1, height: 1 }]);

    assert.deepEqual(await listDirectory(imageDir), [`${cache.keyForSource('/images/a.png')}.png`]);
    await server.close();
  });
});

describe('PromoteImageCache tier chain', () => {
  const chain: PromoteImageTier[] = [
    { src: '/images/a.avif', type: 'image/avif' },
    { src: '/images/a.webp', type: 'image/webp' },
    { src: '/images/a.png' },
  ];

  it('stores the first tier that passes and requests nothing after it', async () => {
    const server = await startServer(new Map([
      ['/images/a.avif', imageRoute(AVIF, 'image/avif')],
      ['/images/a.webp', imageRoute(WEBP, 'image/webp')],
      ['/images/a.png', imageRoute(PNG)],
    ]));
    const imageDir = await createImageDir();
    const cache = createCache(imageDir, server.origin);

    const result = await cache.ensureImages([{ src: '/images/a.png', width: 1, height: 1, tiers: chain }]);

    const key = cache.keyForSource('/images/a.png')!;
    assert.deepEqual(result.get(key), { fileName: `${key}.avif`, contentType: 'image/avif' });
    assert.deepEqual(server.hits, ['/images/a.avif']);
    assert.deepEqual(await listDirectory(imageDir), [`${key}.avif`]);
    await server.close();
  });

  it('falls through a 404 on the first tier to the next one', async () => {
    const server = await startServer(new Map([
      ['/images/a.webp', imageRoute(WEBP, 'image/webp')],
      ['/images/a.png', imageRoute(PNG)],
    ]));
    const cache = createCache(await createImageDir(), server.origin);

    const result = await cache.ensureImages([{ src: '/images/a.png', width: 1, height: 1, tiers: chain }]);

    const key = cache.keyForSource('/images/a.png')!;
    assert.deepEqual(result.get(key), { fileName: `${key}.webp`, contentType: 'image/webp' });
    assert.deepEqual(server.hits, ['/images/a.avif', '/images/a.webp']);
    await server.close();
  });

  it('treats a tier whose bytes do not match its declared type as failed', async () => {
    const server = await startServer(new Map([
      ['/images/a.avif', imageRoute(PNG, 'image/avif')],
      ['/images/a.webp', imageRoute(PNG, 'image/webp')],
      ['/images/a.png', imageRoute(PNG)],
    ]));
    const cache = createCache(await createImageDir(), server.origin);

    const result = await cache.ensureImages([{ src: '/images/a.png', width: 1, height: 1, tiers: chain }]);

    const key = cache.keyForSource('/images/a.png')!;
    assert.deepEqual(result.get(key), { fileName: `${key}.png`, contentType: 'image/png' });
    assert.deepEqual(server.hits, ['/images/a.avif', '/images/a.webp', '/images/a.png']);
    await server.close();
  });

  it('treats a tier above the size cap as failed', async () => {
    const server = await startServer(new Map([
      ['/images/a.avif', imageRoute(Buffer.concat([AVIF, Buffer.alloc(4096)]), 'image/avif')],
      ['/images/a.png', imageRoute(PNG)],
    ]));
    const imageDir = await createImageDir();
    const cache = createCache(imageDir, server.origin, { maxBytes: 1024 });

    const result = await cache.ensureImages([{ src: '/images/a.png', width: 1, height: 1, tiers: chain }]);

    const key = cache.keyForSource('/images/a.png')!;
    assert.deepEqual(result.get(key), { fileName: `${key}.png`, contentType: 'image/png' });
    assert.deepEqual(await listDirectory(imageDir), [`${key}.png`]);
    await server.close();
  });

  it('treats a redirected tier as failed and never follows the redirect', async () => {
    const server = await startServer(new Map([
      ['/images/a.avif', { status: 302, headers: { location: '/images/moved.avif' } }],
      ['/images/moved.avif', imageRoute(AVIF, 'image/avif')],
      ['/images/a.png', imageRoute(PNG)],
    ]));
    const cache = createCache(await createImageDir(), server.origin);

    const result = await cache.ensureImages([{ src: '/images/a.png', width: 1, height: 1, tiers: chain }]);

    const key = cache.keyForSource('/images/a.png')!;
    assert.deepEqual(result.get(key), { fileName: `${key}.png`, contentType: 'image/png' });
    assert.deepEqual(server.hits, ['/images/a.avif', '/images/a.webp', '/images/a.png']);
    await server.close();
  });

  it('drops a tier outside the Index origin without sending a request for it', async () => {
    const server = await startServer(new Map([['/images/a.png', imageRoute(PNG)]]));
    const requested: string[] = [];
    const cache = new PromoteImageCache({
      imageDir: await createImageDir(),
      indexOrigin: server.origin,
      budgetMs: 15_000,
      httpClient: {
        requestBinary: (url, options) => {
          requested.push(url);
          return requestBinary(url, options);
        },
      },
    });

    const result = await cache.ensureImages([{
      src: '/images/a.png',
      width: 1,
      height: 1,
      tiers: [{ src: 'https://cdn.example.com/images/a.avif', type: 'image/avif' }, ...chain.slice(2)],
    }]);

    const key = cache.keyForSource('/images/a.png')!;
    assert.deepEqual(result.get(key), { fileName: `${key}.png`, contentType: 'image/png' });
    assert.deepEqual(requested, [`${server.origin}/images/a.png`]);
    await server.close();
  });

  it('abandons a stalled tier after its share of the budget and still reaches the original', async () => {
    const server = await startServer(new Map<string, Route>([
      ['/images/a.avif', { hang: true }],
      ['/images/a.png', imageRoute(PNG)],
    ]));
    const cache = createCache(await createImageDir(), server.origin, { tierTimeoutMs: 100, budgetMs: 5_000 });

    const result = await cache.ensureImages([{ src: '/images/a.png', width: 1, height: 1, tiers: chain }]);

    const key = cache.keyForSource('/images/a.png')!;
    assert.deepEqual(result.get(key), { fileName: `${key}.png`, contentType: 'image/png' });
    assert.deepEqual(server.hits, ['/images/a.avif', '/images/a.webp', '/images/a.png']);
    await server.close();
  });

  it('stores nothing when every tier fails', async () => {
    const server = await startServer(new Map([['/images/a.png', { status: 500 }]]));
    const imageDir = await createImageDir();

    const result = await createCache(imageDir, server.origin).ensureImages([
      { src: '/images/a.png', width: 1, height: 1, tiers: chain },
    ]);

    assert.equal(result.size, 0);
    assert.deepEqual(await listDirectory(imageDir), []);
    assert.deepEqual(server.hits, ['/images/a.avif', '/images/a.webp', '/images/a.png']);
    await server.close();
  });

  it('reuses a stored file for the key without requesting any tier', async () => {
    const server = await startServer(new Map([
      ['/images/a.avif', imageRoute(AVIF, 'image/avif')],
      ['/images/a.png', imageRoute(PNG)],
    ]));
    const imageDir = await createImageDir();
    const cache = createCache(imageDir, server.origin);
    const key = cache.keyForSource('/images/a.png')!;
    await fs.mkdir(imageDir, { recursive: true });
    await fs.writeFile(path.join(imageDir, `${key}.avif`), AVIF);

    const result = await cache.ensureImages([{ src: '/images/a.png', width: 1, height: 1, tiers: chain }]);

    assert.deepEqual(result.get(key), { fileName: `${key}.avif`, contentType: 'image/avif' });
    assert.deepEqual(server.hits, []);
    await server.close();
  });
});

describe('PromoteImageCache.pruneUnreferenced', () => {
  it('deletes only matching stored names and stale temporary files', async () => {
    const imageDir = await createImageDir();
    await fs.mkdir(imageDir, { recursive: true });
    const now = Date.now();
    const cache = createCache(imageDir, PROMOTE_TEST_ORIGIN, { now: () => now });
    const unreferenced = 'a'.repeat(32);
    const referenced = 'b'.repeat(32);
    const staleTemp = `.promote-${unreferenced}-${randomUUID()}.tmp`;
    const freshTemp = `.promote-${unreferenced}-${randomUUID()}.tmp`;
    const files = [
      `${unreferenced}.png`,
      `${referenced}.webp`,
      `${'c'.repeat(32)}.bmp`,
      `${'D'.repeat(32)}.png`,
      'notes.txt',
      staleTemp,
      freshTemp,
    ];
    for (const file of files) {
      await fs.writeFile(path.join(imageDir, file), 'x');
    }
    const elevenMinutesAgo = new Date(now - 11 * 60 * 1000);
    await fs.utimes(path.join(imageDir, staleTemp), elevenMinutesAgo, elevenMinutesAgo);

    await cache.pruneUnreferenced(new Set([referenced]));

    assert.deepEqual(await listDirectory(imageDir), [
      freshTemp,
      `${'D'.repeat(32)}.png`,
      `${referenced}.webp`,
      `${'c'.repeat(32)}.bmp`,
      'notes.txt',
    ].sort());
  });

  it('does not throw when a delete fails', async () => {
    const imageDir = await createImageDir();
    await fs.mkdir(path.join(imageDir, `${'e'.repeat(32)}.png`), { recursive: true });

    await assert.doesNotReject(createCache(imageDir, PROMOTE_TEST_ORIGIN).pruneUnreferenced(new Set()));
  });

  it('does nothing when the folder does not exist', async () => {
    const imageDir = await createImageDir();

    await assert.doesNotReject(createCache(imageDir, PROMOTE_TEST_ORIGIN).pruneUnreferenced(new Set()));
    assert.deepEqual(await listDirectory(imageDir), []);
  });
});

describe('PromoteImageCache.readImage and hasStoredFile', () => {
  const key = 'f'.repeat(32);

  it('returns the bytes with the stored content type for a key in the snapshot', async () => {
    const imageDir = await createImageDir();
    await fs.mkdir(imageDir, { recursive: true });
    await fs.writeFile(path.join(imageDir, `${key}.png`), PNG);

    const image = await createCache(imageDir, PROMOTE_TEST_ORIGIN).readImage(key, new Map([[key, `${key}.png`]]));

    assert.deepEqual(image, { bytes: PNG, contentType: 'image/png' });
  });

  it('rejects keys that are not 32 lowercase hex characters, even when the snapshot lists them', async () => {
    const imageDir = await createImageDir();
    await fs.mkdir(imageDir, { recursive: true });
    const cache = createCache(imageDir, PROMOTE_TEST_ORIGIN);
    for (const badKey of ['ABC', 'F'.repeat(32), 'g'.repeat(32), '../' + 'a'.repeat(29)]) {
      assert.equal(await cache.readImage(badKey, new Map([[badKey, `${badKey}.png`]])), null, badKey);
    }
  });

  it('rejects a key that is not in the snapshot even when its file exists', async () => {
    const imageDir = await createImageDir();
    await fs.mkdir(imageDir, { recursive: true });
    await fs.writeFile(path.join(imageDir, `${key}.png`), PNG);

    assert.equal(await createCache(imageDir, PROMOTE_TEST_ORIGIN).readImage(key, new Map()), null);
  });

  it('returns null when the stored file is missing', async () => {
    const imageDir = await createImageDir();
    await fs.mkdir(imageDir, { recursive: true });

    assert.equal(await createCache(imageDir, PROMOTE_TEST_ORIGIN).readImage(key, new Map([[key, `${key}.png`]])), null);
  });

  it('builds the path only from a snapshot file name that matches the key', async () => {
    const imageDir = await createImageDir();
    await fs.mkdir(imageDir, { recursive: true });
    const cache = createCache(imageDir, PROMOTE_TEST_ORIGIN);
    await fs.writeFile(path.join(imageDir, `${key}.png`), PNG);

    assert.equal(await cache.readImage(key, new Map([[key, '../escape.png']])), null);
    assert.equal(await cache.readImage(key, new Map([[key, `${'0'.repeat(32)}.png`]])), null);
  });

  it('reports a stored file only for a name that matches the stored pattern', async () => {
    const imageDir = await createImageDir();
    await fs.mkdir(imageDir, { recursive: true });
    await fs.writeFile(path.join(imageDir, `${key}.png`), PNG);
    const cache = createCache(imageDir, PROMOTE_TEST_ORIGIN);

    assert.equal(await cache.hasStoredFile(`${key}.png`), true);
    assert.equal(await cache.hasStoredFile('notes.txt'), false);
    assert.equal(await cache.hasStoredFile(`../${key}.png`), false);
  });
});
