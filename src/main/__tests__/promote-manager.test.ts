import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { HttpTimeoutError, type DesktopHttpClient, type HttpResponse } from '../http-client.js';
import { imageKeyForUrl, PromoteImageCache } from '../promote-image-cache.js';
import {
  PROMOTE_DOCUMENT_TIMEOUT_MS,
  PROMOTE_INDEX_ORIGIN,
  PROMOTE_REFRESH_INTERVAL_MS,
  PROMOTE_STORE_KEY,
  PromoteManager,
  type PromoteSnapshotStore,
} from '../promote-manager.js';

const ORIGIN = PROMOTE_INDEX_ORIGIN;
const MINUTE = 60_000;
const T0 = Date.parse('2026-10-10T00:00:00.000Z');
const CATALOG_URL = `${ORIGIN}/index-catalog.json`;
const FLAGS_URL = `${ORIGIN}/promote.json`;
const CONTENT_URL = `${ORIGIN}/promote_content.json`;
const IMAGE_URL = `${ORIGIN}/images/banner.png`;
const IMAGE_KEY = imageKeyForUrl(new URL('/images/banner.png', ORIGIN));
const PNG = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(32, 7)]);
const AVIF = Buffer.concat([Buffer.from([0, 0, 0, 0x1c]), Buffer.from('ftypavif', 'latin1'), Buffer.alloc(16, 5)]);

type MemoryStore = PromoteSnapshotStore & { values: Map<string, unknown> };

interface Harness {
  clock: { now: number };
  store: MemoryStore;
  imageDir: string;
  jsonRoutes: Map<string, unknown>;
  jsonRequests: string[];
  imageRoutes: Map<string, Buffer | Error>;
  imageRequests: string[];
  onImageRequest?: (url: string) => void;
  now: () => number;
}

interface StoredSnapshot {
  fetchedAt: number;
  attemptedAt: number;
  candidates: Array<{ id: string; image?: { key: string; fileName?: string } }>;
}

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

function createStore(): MemoryStore {
  const values = new Map<string, unknown>();
  return {
    values,
    get: (key) => values.get(key),
    set: (key, value) => {
      values.set(key, JSON.parse(JSON.stringify(value)));
    },
  };
}

function jsonClient(harness: Harness): Pick<DesktopHttpClient, 'requestJson'> {
  return {
    async requestJson<T>(url: string): Promise<HttpResponse<T>> {
      harness.jsonRequests.push(url);
      const route = harness.jsonRoutes.get(url);
      if (route instanceof Error) throw route;
      if (route === undefined) throw new Error(`unexpected document request: ${url}`);
      return { status: 200, statusText: 'OK', headers: {}, data: route as T };
    },
  };
}

function binaryClient(harness: Harness): Pick<DesktopHttpClient, 'requestBinary'> {
  return {
    async requestBinary(url: string): Promise<HttpResponse<Buffer>> {
      harness.imageRequests.push(url);
      harness.onImageRequest?.(url);
      const route = harness.imageRoutes.get(url);
      if (route instanceof Error) throw route;
      if (route === undefined) throw new Error(`unexpected image request: ${url}`);
      return { status: 200, statusText: 'OK', headers: {}, data: route };
    },
  };
}

async function createHarness(): Promise<Harness> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'promote-manager-'));
  temporaryDirectories.push(root);
  const clock = { now: T0 };
  return {
    clock,
    store: createStore(),
    imageDir: path.join(root, 'images'),
    jsonRoutes: new Map<string, unknown>([
      [CATALOG_URL, {
        entries: [
          { id: 'promotion-flags', path: '/promote.json' },
          { id: 'promotion-content', path: '/promote_content.json' },
        ],
      }],
    ]),
    jsonRequests: [],
    imageRoutes: new Map<string, Buffer | Error>([[IMAGE_URL, PNG]]),
    imageRequests: [],
    now: () => clock.now,
  };
}

function createManager(harness: Harness): PromoteManager {
  const imageCache = new PromoteImageCache({
    imageDir: harness.imageDir,
    indexOrigin: ORIGIN,
    httpClient: binaryClient(harness),
    budgetMs: PROMOTE_DOCUMENT_TIMEOUT_MS,
    now: harness.now,
  });
  return new PromoteManager({
    store: harness.store,
    imageCache,
    httpClient: jsonClient(harness),
    indexOrigin: ORIGIN,
    now: harness.now,
  });
}

function setDocuments(harness: Harness, flags: unknown[], contents: unknown[]): void {
  harness.jsonRoutes.set(FLAGS_URL, { promotes: flags });
  harness.jsonRoutes.set(CONTENT_URL, { contents });
}

function flag(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, on: true, platforms: ['hagicode'], ...overrides };
}

function content(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    title: { 'en-US': `${id} title` },
    description: { 'en-US': `${id} description` },
    link: `https://example.com/${id}`,
    ...overrides,
  };
}

function bannerContent(id: string): Record<string, unknown> {
  return content(id, { image: { src: '/images/banner.png', width: 1200, height: 630, alt: 'Banner alt' } });
}

function at(offsetMs: number): string {
  return new Date(T0 + offsetMs).toISOString();
}

function ids(items: Array<{ id: string }>): string[] {
  return items.map((item) => item.id);
}

function storedSnapshot(harness: Harness): StoredSnapshot {
  return harness.store.values.get(PROMOTE_STORE_KEY) as StoredSnapshot;
}

async function exists(file: string): Promise<boolean> {
  return fs.access(file).then(() => true, () => false);
}

async function waitUntil(predicate: () => boolean | Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail('expected condition was not reached');
}

describe('PromoteManager eligibility', () => {
  it('keeps only flags whose platforms list contains the exact hagicode value', async () => {
    const harness = await createHarness();
    setDocuments(harness, [
      flag('kept', { platforms: ['web', 'hagicode'] }),
      flag('web-only', { platforms: ['web'] }),
      flag('wrong-case', { platforms: ['HagiCode'] }),
      flag('longer', { platforms: ['hagicode-desktop'] }),
    ], ['kept', 'web-only', 'wrong-case', 'longer'].map((id) => content(id)));

    assert.deepEqual(ids(await createManager(harness).getItems('en-US')), ['kept']);
  });

  it('skips malformed flags and keeps the rest of the document', async () => {
    const harness = await createHarness();
    const malformed = [
      null,
      'not-a-record',
      flag('string-platforms', { platforms: 'hagicode' }),
      flag('mixed-platforms', { platforms: ['hagicode', 3] }),
      flag('missing-platforms', { platforms: undefined }),
      flag('non-boolean', { on: 'yes' }),
    ];
    setDocuments(harness, [...malformed, flag('valid')], [
      'string-platforms', 'mixed-platforms', 'missing-platforms', 'non-boolean', 'valid',
    ].map((id) => content(id)));

    assert.deepEqual(ids(await createManager(harness).getItems('en-US')), ['valid']);
  });

  it('applies enabled flags and start and end windows at read time', async () => {
    const harness = await createHarness();
    const flags = [
      flag('disabled', { on: false }),
      flag('future', { startTime: at(24 * 60 * MINUTE) }),
      flag('expired', { endTime: at(-MINUTE) }),
      flag('inverted', { startTime: at(MINUTE), endTime: at(0) }),
      flag('unparsable', { startTime: 'soon' }),
      flag('open'),
      flag('windowed', { startTime: at(-MINUTE), endTime: at(MINUTE) }),
    ];
    setDocuments(harness, flags, flags.map((item) => content(String(item.id))));

    assert.deepEqual(ids(await createManager(harness).getItems('en-US')), ['open', 'windowed']);
  });

  it('re-evaluates windows on each read inside the cached hour without a request', async () => {
    const harness = await createHarness();
    setDocuments(harness, [
      flag('starts', { startTime: at(10 * MINUTE) }),
      flag('ends', { endTime: at(30 * MINUTE) }),
    ], [content('starts'), content('ends')]);
    const manager = createManager(harness);

    assert.deepEqual(ids(await manager.getItems('en-US')), ['ends']);
    const requests = harness.jsonRequests.length;
    harness.clock.now = T0 + 11 * MINUTE;
    assert.deepEqual(ids(await manager.getItems('en-US')), ['starts', 'ends']);
    harness.clock.now = T0 + 31 * MINUTE;
    assert.deepEqual(ids(await manager.getItems('en-US')), ['starts']);
    assert.equal(harness.jsonRequests.length, requests);
  });

  it('drops flags without a usable content entry and skips malformed content', async () => {
    const harness = await createHarness();
    setDocuments(harness, [flag('orphan'), flag('blank-title'), flag('no-link'), flag('ok')], [
      content('blank-title', { title: { 'en-US': '   ' } }),
      content('no-link', { link: '' }),
      content('ok'),
    ]);

    assert.deepEqual(ids(await createManager(harness).getItems('en-US')), ['ok']);
  });

  it('drops items whose link is not an absolute http or https URL', async () => {
    const harness = await createHarness();
    const links = ['javascript:alert(1)', 'ftp://example.com/file', 'not a url', 'https://example.com/ok'];
    setDocuments(
      harness,
      links.map((_, index) => flag(`item-${index}`)),
      links.map((link, index) => content(`item-${index}`, { link })),
    );

    assert.deepEqual(ids(await createManager(harness).getItems('en-US')), ['item-3']);
  });

  it('keeps the order of the index flags', async () => {
    const harness = await createHarness();
    const order = ['gamma', 'alpha', 'beta'];
    setDocuments(harness, order.map((id) => flag(id)), ['alpha', 'beta', 'gamma'].map((id) => content(id)));

    assert.deepEqual(ids(await createManager(harness).getItems('en-US')), order);
  });
});

describe('PromoteManager language resolution', () => {
  it('prefers the exact Desktop language', async () => {
    const harness = await createHarness();
    setDocuments(harness, [flag('exact')], [content('exact', {
      title: { 'zh-Hant': '繁體', 'zh-CN': '简体', 'en-US': 'English' },
    })]);

    const [item] = await createManager(harness).getItems('zh-Hant');
    assert.equal(item.title, '繁體');
  });

  it('falls back within the Chinese family in both directions', async () => {
    const harness = await createHarness();
    setDocuments(harness, [flag('simplified-only'), flag('traditional-only')], [
      content('simplified-only', { title: { 'zh-CN': '简体' } }),
      content('traditional-only', { title: { 'zh-Hant': '繁體' } }),
    ]);
    const manager = createManager(harness);

    const traditional = await manager.getItems('zh-Hant');
    assert.deepEqual(traditional.map((item) => item.title), ['简体', '繁體']);
    const simplified = await manager.getItems('zh-CN');
    assert.deepEqual(simplified.map((item) => item.title), ['简体', '繁體']);
  });

  it('falls back to en-US and then to any non-empty value', async () => {
    const harness = await createHarness();
    setDocuments(harness, [flag('english'), flag('french')], [
      content('english', { title: { 'en-US': 'EN', 'zh-CN': 'ZH' } }),
      content('french', { title: { 'fr-FR': 'FR' } }),
    ]);

    const items = await createManager(harness).getItems('ja-JP');
    assert.deepEqual(items.map((item) => item.title), ['EN', 'FR']);
  });

  it('leaves ctaLabel unset when no call to action resolves', async () => {
    const harness = await createHarness();
    setDocuments(harness, [flag('no-cta'), flag('empty-cta'), flag('fallback-cta')], [
      content('no-cta'),
      content('empty-cta', { cta: { 'en-US': ' ' } }),
      content('fallback-cta', { cta: { 'de-DE': 'Mehr erfahren' } }),
    ]);

    const [noCta, emptyCta, fallbackCta] = await createManager(harness).getItems('en-US');
    assert.equal('ctaLabel' in noCta, false);
    assert.equal('ctaLabel' in emptyCta, false);
    assert.equal(fallbackCta.ctaLabel, 'Mehr erfahren');
  });
});

describe('PromoteManager document discovery', () => {
  it('reads the documents named by the catalog', async () => {
    const harness = await createHarness();
    const flagsUrl = `${ORIGIN}/cdn/flags.json`;
    const contentsUrl = `${ORIGIN}/cdn/contents.json`;
    harness.jsonRoutes.set(CATALOG_URL, {
      entries: [
        { id: 'promotion-flags', path: '/cdn/flags.json' },
        { id: 'promotion-content', path: '/cdn/contents.json' },
      ],
    });
    harness.jsonRoutes.set(flagsUrl, { promotes: [flag('cdn')] });
    harness.jsonRoutes.set(contentsUrl, { contents: [content('cdn')] });

    assert.deepEqual(ids(await createManager(harness).getItems('en-US')), ['cdn']);
    assert.deepEqual(harness.jsonRequests, [CATALOG_URL, flagsUrl, contentsUrl]);
  });

  it('falls back to the canonical documents when the catalog is unavailable', async () => {
    const harness = await createHarness();
    harness.jsonRoutes.set(CATALOG_URL, new Error('catalog down'));
    setDocuments(harness, [flag('canonical')], [content('canonical')]);

    assert.deepEqual(ids(await createManager(harness).getItems('en-US')), ['canonical']);
    assert.deepEqual(harness.jsonRequests, [CATALOG_URL, FLAGS_URL, CONTENT_URL]);
  });

  it('ignores catalog paths that leave the Index origin', async () => {
    const harness = await createHarness();
    harness.jsonRoutes.set(CATALOG_URL, {
      entries: [
        { id: 'promotion-flags', path: 'https://evil.example/promote.json' },
        { id: 'promotion-content', path: '//evil.example/promote_content.json' },
      ],
    });
    setDocuments(harness, [flag('safe')], [content('safe')]);

    assert.deepEqual(ids(await createManager(harness).getItems('en-US')), ['safe']);
    assert.deepEqual(harness.jsonRequests, [CATALOG_URL, FLAGS_URL, CONTENT_URL]);
  });
});

describe('PromoteManager one-hour cache', () => {
  it('makes no Index request of any kind inside the hour', async () => {
    const harness = await createHarness();
    setDocuments(harness, [flag('banner')], [bannerContent('banner')]);
    const manager = createManager(harness);

    await manager.getItems('en-US');
    assert.equal(harness.jsonRequests.length, 3);
    assert.equal(harness.imageRequests.length, 1);

    harness.clock.now = T0 + 59 * MINUTE;
    await manager.getItems('en-US');
    harness.clock.now = T0 + 59 * MINUTE + 59_000;
    await manager.getItems('en-US');
    assert.equal(harness.jsonRequests.length, 3);
    assert.equal(harness.imageRequests.length, 1);
  });

  it('serves stored documents and images after a restart without any request', async () => {
    const harness = await createHarness();
    setDocuments(harness, [flag('banner')], [bannerContent('banner')]);
    await createManager(harness).getItems('en-US');

    harness.clock.now = T0 + 10 * MINUTE;
    const items = await createManager(harness).getItems('en-US');

    assert.equal(items[0].image?.key, IMAGE_KEY);
    assert.equal(harness.jsonRequests.length, 3);
    assert.equal(harness.imageRequests.length, 1);
  });

  it('serves stale data at once and refreshes in the background', async () => {
    const harness = await createHarness();
    setDocuments(harness, [flag('news')], [content('news', { title: { 'en-US': 'Old title' } })]);
    const manager = createManager(harness);
    await manager.getItems('en-US');

    setDocuments(harness, [flag('news')], [content('news', { title: { 'en-US': 'New title' } })]);
    harness.clock.now = T0 + 61 * MINUTE;
    const stale = await manager.getItems('en-US');
    assert.equal(stale[0].title, 'Old title');

    await waitUntil(() => storedSnapshot(harness).fetchedAt === T0 + 61 * MINUTE);
    const fresh = await manager.getItems('en-US');
    assert.equal(fresh[0].title, 'New title');
  });

  it('shares one refresh between concurrent callers', async () => {
    const harness = await createHarness();
    setDocuments(harness, [flag('shared')], [content('shared')]);
    const manager = createManager(harness);

    await Promise.all([manager.getItems('en-US'), manager.getItems('en-US')]);
    assert.equal(harness.jsonRequests.length, 3);

    harness.clock.now = T0 + 61 * MINUTE;
    await Promise.all([manager.getItems('en-US'), manager.getItems('en-US')]);
    await waitUntil(() => storedSnapshot(harness).fetchedAt === T0 + 61 * MINUTE);
    assert.equal(harness.jsonRequests.length, 6);
  });

  it('keeps stored data and images when a stale refresh fails and waits a full hour', async () => {
    const harness = await createHarness();
    setDocuments(harness, [flag('kept')], [bannerContent('kept')]);
    const manager = createManager(harness);
    await manager.getItems('en-US');

    harness.jsonRoutes.set(FLAGS_URL, new Error('offline'));
    harness.clock.now = T0 + 61 * MINUTE;
    assert.deepEqual(ids(await manager.getItems('en-US')), ['kept']);
    await waitUntil(() => storedSnapshot(harness).attemptedAt === T0 + 61 * MINUTE);

    const requests = harness.jsonRequests.length + harness.imageRequests.length;
    harness.clock.now = T0 + 62 * MINUTE;
    const items = await manager.getItems('en-US');
    assert.deepEqual(ids(items), ['kept']);
    assert.equal(items[0].image?.key, IMAGE_KEY);
    assert.equal(harness.jsonRequests.length + harness.imageRequests.length, requests);
  });

  it('treats a malformed document as a failed refresh and retries at the next hour boundary', async () => {
    const harness = await createHarness();
    harness.jsonRoutes.set(FLAGS_URL, { promotes: 'nope' });
    harness.jsonRoutes.set(CONTENT_URL, { contents: [] });
    const manager = createManager(harness);

    assert.deepEqual(await manager.getItems('en-US'), []);
    assert.equal(harness.jsonRequests.length, 3);

    harness.clock.now = T0 + 59 * MINUTE;
    await manager.getItems('en-US');
    assert.equal(harness.jsonRequests.length, 3);

    harness.clock.now = T0 + 60 * MINUTE;
    setDocuments(harness, [flag('fixed')], [content('fixed')]);
    assert.deepEqual(ids(await manager.getItems('en-US')), ['fixed']);
    assert.equal(harness.jsonRequests.length, 6);
  });

  it('returns no items on first launch while offline and does not retry inside the hour', async () => {
    const harness = await createHarness();
    harness.jsonRoutes.set(CATALOG_URL, new Error('offline'));
    harness.jsonRoutes.set(FLAGS_URL, new Error('offline'));
    const manager = createManager(harness);

    assert.deepEqual(await manager.getItems('en-US'), []);
    const requests = harness.jsonRequests.length;

    harness.clock.now = T0 + 30 * MINUTE;
    assert.deepEqual(await manager.getItems('en-US'), []);
    assert.equal(harness.jsonRequests.length, requests);

    harness.clock.now = T0 + PROMOTE_REFRESH_INTERVAL_MS;
    await manager.getItems('en-US');
    assert.equal(harness.jsonRequests.length, requests + 2);
  });
});

describe('PromoteManager image tiers', () => {
  const AVIF_URL = `${ORIGIN}/images/banner.avif`;
  const WEBP_URL = `${ORIGIN}/images/banner.webp`;

  function tieredContent(sources: unknown): Record<string, unknown> {
    return content('banner', { image: { src: '/images/banner.png', width: 1200, height: 630, alt: 'Banner alt', sources } });
  }

  it('stores the first passing tier under the original key and keeps the snapshot shape', async () => {
    const harness = await createHarness();
    harness.imageRoutes.set(AVIF_URL, AVIF);
    setDocuments(harness, [flag('banner')], [tieredContent([
      { type: 'image/avif', src: '/images/banner.avif' },
      { type: 'image/webp', src: '/images/banner.webp' },
    ])]);

    const [item] = await createManager(harness).getItems('en-US');

    assert.deepEqual(item.image, { key: IMAGE_KEY, width: 1200, height: 630, alt: 'Banner alt' });
    assert.deepEqual(harness.imageRequests, [AVIF_URL]);
    assert.deepEqual(storedSnapshot(harness).candidates[0].image, {
      key: IMAGE_KEY,
      width: 1200,
      height: 630,
      alt: 'Banner alt',
      fileName: `${IMAGE_KEY}.avif`,
    });
    assert.equal(await exists(path.join(harness.imageDir, `${IMAGE_KEY}.avif`)), true);
  });

  it('falls back to the original when every declared tier fails', async () => {
    const harness = await createHarness();
    setDocuments(harness, [flag('banner')], [tieredContent([
      { type: 'image/avif', src: '/images/banner.avif' },
      { type: 'image/webp', src: '/images/banner.webp' },
    ])]);

    const [item] = await createManager(harness).getItems('en-US');

    assert.equal(item.image?.key, IMAGE_KEY);
    assert.deepEqual(harness.imageRequests, [AVIF_URL, WEBP_URL, IMAGE_URL]);
    assert.equal(storedSnapshot(harness).candidates[0].image?.fileName, `${IMAGE_KEY}.png`);
  });

  it('keeps only tiers with an image type, a source and a usable location', async () => {
    const harness = await createHarness();
    harness.imageRoutes.set(AVIF_URL, AVIF);
    setDocuments(harness, [flag('banner')], [tieredContent([
      { type: 'text/html', src: '/images/banner.html' },
      { type: 'image/avif' },
      'image/avif',
      { type: 'image/webp', src: '   ' },
      { type: 'image/avif', src: 'https://cdn.example.com/banner.avif' },
      { type: ' IMAGE/AVIF ', src: ' /images/banner.avif ' },
    ])]);

    const [item] = await createManager(harness).getItems('en-US');

    assert.equal(item.image?.key, IMAGE_KEY);
    assert.deepEqual(harness.imageRequests, [AVIF_URL]);
    assert.equal(storedSnapshot(harness).candidates[0].image?.fileName, `${IMAGE_KEY}.avif`);
  });

  it('ignores a sources value that is not a list', async () => {
    const harness = await createHarness();
    harness.imageRoutes.set(AVIF_URL, AVIF);
    setDocuments(harness, [flag('banner')], [tieredContent({ type: 'image/avif', src: '/images/banner.avif' })]);

    const [item] = await createManager(harness).getItems('en-US');

    assert.equal(item.image?.key, IMAGE_KEY);
    assert.deepEqual(harness.imageRequests, [IMAGE_URL]);
    assert.equal(storedSnapshot(harness).candidates[0].image?.fileName, `${IMAGE_KEY}.png`);
  });

  it('requests only the original for an image without sources', async () => {
    const harness = await createHarness();
    setDocuments(harness, [flag('banner')], [bannerContent('banner')]);

    const [item] = await createManager(harness).getItems('en-US');

    assert.deepEqual(item.image, { key: IMAGE_KEY, width: 1200, height: 630, alt: 'Banner alt' });
    assert.deepEqual(harness.imageRequests, [IMAGE_URL]);
    assert.deepEqual(storedSnapshot(harness).candidates[0].image, {
      key: IMAGE_KEY,
      width: 1200,
      height: 630,
      alt: 'Banner alt',
      fileName: `${IMAGE_KEY}.png`,
    });
  });
});

describe('PromoteManager image phase', () => {
  it('stores the image before committing so the first response carries it', async () => {
    const harness = await createHarness();
    setDocuments(harness, [flag('banner')], [bannerContent('banner')]);

    const [item] = await createManager(harness).getItems('en-US');

    assert.deepEqual(item.image, { key: IMAGE_KEY, width: 1200, height: 630, alt: 'Banner alt' });
    assert.deepEqual(harness.imageRequests, [IMAGE_URL]);
    assert.equal(storedSnapshot(harness).candidates[0].image?.fileName, `${IMAGE_KEY}.png`);
    assert.equal(await exists(path.join(harness.imageDir, `${IMAGE_KEY}.png`)), true);
  });

  it('sends no image request on a quiet refresh whose files are present', async () => {
    const harness = await createHarness();
    setDocuments(harness, [flag('banner')], [bannerContent('banner')]);
    const manager = createManager(harness);
    await manager.getItems('en-US');

    harness.clock.now = T0 + 61 * MINUTE;
    await manager.getItems('en-US');
    await waitUntil(() => storedSnapshot(harness).fetchedAt === T0 + 61 * MINUTE);

    assert.equal(harness.imageRequests.length, 1);
    assert.equal((await manager.getItems('en-US'))[0].image?.key, IMAGE_KEY);
  });

  it('requests images only for entries that passed the hagicode and pairing rules', async () => {
    const harness = await createHarness();
    harness.imageRoutes.set(`${ORIGIN}/images/web.png`, PNG);
    setDocuments(harness, [flag('kept'), flag('web-only', { platforms: ['web'] }), flag('unpaired')], [
      bannerContent('kept'),
      content('web-only', { image: { src: '/images/web.png', width: 1200, height: 630, alt: '' } }),
    ]);

    await createManager(harness).getItems('en-US');

    assert.deepEqual(harness.imageRequests, [IMAGE_URL]);
  });

  it('downloads the image of an entry whose window has not opened yet', async () => {
    const harness = await createHarness();
    const opensAt = 24 * 60 * MINUTE;
    setDocuments(harness, [flag('upcoming', { startTime: at(opensAt) })], [bannerContent('upcoming')]);
    const manager = createManager(harness);

    assert.deepEqual(await manager.getItems('en-US'), []);
    assert.deepEqual(harness.imageRequests, [IMAGE_URL]);

    harness.clock.now = T0 + opensAt;
    const [item] = await manager.getItems('en-US');
    await waitUntil(() => storedSnapshot(harness).fetchedAt === T0 + opensAt);
    assert.equal(item.id, 'upcoming');
    assert.equal(item.image?.key, IMAGE_KEY);
    assert.equal(harness.imageRequests.length, 1);
  });

  for (const [label, failure] of [
    ['a connection failure', new Error('connection reset')],
    ['a timeout', new HttpTimeoutError(PROMOTE_DOCUMENT_TIMEOUT_MS, IMAGE_URL)],
  ] as const) {
    it(`serves the item without an image after ${label} and still commits the refresh`, async () => {
      const harness = await createHarness();
      harness.imageRoutes.set(IMAGE_URL, failure);
      setDocuments(harness, [flag('banner')], [bannerContent('banner')]);

      const items = await createManager(harness).getItems('en-US');

      assert.deepEqual(ids(items), ['banner']);
      assert.equal(items[0].image, undefined);
      assert.equal(storedSnapshot(harness).fetchedAt, T0);
      assert.equal(storedSnapshot(harness).candidates.length, 1);
    });
  }

  it('retries a failed image on the next refresh', async () => {
    const harness = await createHarness();
    harness.imageRoutes.set(IMAGE_URL, new Error('down'));
    setDocuments(harness, [flag('banner')], [bannerContent('banner')]);
    const manager = createManager(harness);
    assert.equal((await manager.getItems('en-US'))[0].image, undefined);

    harness.imageRoutes.set(IMAGE_URL, PNG);
    harness.clock.now = T0 + 61 * MINUTE;
    await manager.getItems('en-US');
    await waitUntil(() => storedSnapshot(harness).fetchedAt === T0 + 61 * MINUTE);

    assert.equal(harness.imageRequests.length, 2);
    assert.equal((await manager.getItems('en-US'))[0].image?.key, IMAGE_KEY);
  });

  it('shares one download budget across the images of a refresh', async () => {
    const harness = await createHarness();
    harness.onImageRequest = () => {
      harness.clock.now += PROMOTE_DOCUMENT_TIMEOUT_MS;
    };
    for (const name of ['one', 'two', 'three']) {
      harness.imageRoutes.set(`${ORIGIN}/images/${name}.png`, PNG);
    }
    setDocuments(harness, ['one', 'two', 'three'].map((name) => flag(name)), ['one', 'two', 'three'].map((name) =>
      content(name, { image: { src: `/images/${name}.png`, width: 1200, height: 630, alt: '' } }),
    ));

    const items = await createManager(harness).getItems('en-US');

    assert.equal(harness.imageRequests.length, 1);
    assert.equal(items.length, 3);
    assert.equal(items.filter((item) => item.image).length, 1);
  });

  it('prunes images no longer in the committed snapshot and leaves unrelated files alone', async () => {
    const harness = await createHarness();
    setDocuments(harness, [flag('banner')], [bannerContent('banner')]);
    const manager = createManager(harness);
    await manager.getItems('en-US');

    const stray = `${'f'.repeat(32)}.png`;
    await fs.writeFile(path.join(harness.imageDir, stray), PNG);
    await fs.writeFile(path.join(harness.imageDir, 'notes.txt'), 'keep');
    setDocuments(harness, [flag('banner')], [content('banner')]);

    harness.clock.now = T0 + 61 * MINUTE;
    await manager.getItems('en-US');
    await waitUntil(async () => !(await exists(path.join(harness.imageDir, `${IMAGE_KEY}.png`)))
      && !(await exists(path.join(harness.imageDir, stray))));

    assert.deepEqual((await fs.readdir(harness.imageDir)).sort(), ['notes.txt']);
  });

  it('serves an item without an image when its file was removed after the snapshot', async () => {
    const harness = await createHarness();
    setDocuments(harness, [flag('banner')], [bannerContent('banner')]);
    const manager = createManager(harness);
    await manager.getItems('en-US');

    await fs.rm(path.join(harness.imageDir, `${IMAGE_KEY}.png`));
    const requests = harness.jsonRequests.length + harness.imageRequests.length;

    const items = await manager.getItems('en-US');
    assert.deepEqual(ids(items), ['banner']);
    assert.equal(items[0].image, undefined);
    assert.equal(await manager.getImage(IMAGE_KEY), null);
    assert.equal(harness.jsonRequests.length + harness.imageRequests.length, requests);
  });

  it('treats an image descriptor without positive integer dimensions as absent', async () => {
    const harness = await createHarness();
    const image = { src: '/images/banner.png', alt: '' };
    setDocuments(harness, [flag('zero'), flag('text'), flag('fraction')], [
      content('zero', { image: { ...image, width: 0, height: 630 } }),
      content('text', { image: { ...image, width: '1200', height: 630 } }),
      content('fraction', { image: { ...image, width: 1200, height: 1.5 } }),
    ]);

    const items = await createManager(harness).getItems('en-US');

    assert.deepEqual(ids(items), ['zero', 'text', 'fraction']);
    assert.ok(items.every((item) => item.image === undefined));
    assert.deepEqual(harness.imageRequests, []);
  });

  it('never requests an image from outside the Index origin', async () => {
    const harness = await createHarness();
    setDocuments(harness, [flag('cross'), flag('protocol')], [
      content('cross', { image: { src: 'https://cdn.example.com/banner.png', width: 1200, height: 630, alt: '' } }),
      content('protocol', { image: { src: '//evil.example/banner.png', width: 1200, height: 630, alt: '' } }),
    ]);

    const items = await createManager(harness).getItems('en-US');

    assert.deepEqual(ids(items), ['cross', 'protocol']);
    assert.ok(items.every((item) => item.image === undefined));
    assert.deepEqual(harness.imageRequests, []);
  });

  it('returns a data URL for a stored key and null for unknown or malformed keys', async () => {
    const harness = await createHarness();
    setDocuments(harness, [flag('banner')], [bannerContent('banner')]);
    const manager = createManager(harness);
    await manager.getItems('en-US');

    assert.equal(await manager.getImage(IMAGE_KEY), `data:image/png;base64,${PNG.toString('base64')}`);
    assert.equal(await manager.getImage('0'.repeat(32)), null);
    assert.equal(await manager.getImage('../../etc/passwd'), null);
  });
});
