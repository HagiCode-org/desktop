import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import log from 'electron-log';
import { desktopHttpClient, type DesktopHttpClient } from './http-client.js';

export const PROMOTE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const PROMOTE_IMAGE_CONCURRENCY = 2;
const STALE_TEMP_FILE_MS = 10 * 60 * 1000;
const KEY_PATTERN = /^[0-9a-f]{32}$/;
const STORED_NAME_PATTERN = /^([0-9a-f]{32})\.(png|jpg|webp|gif|avif)$/;
const TEMP_NAME_PATTERN = /^\.promote-[0-9a-f]{32}-[0-9a-f-]{36}\.tmp$/;

export interface PromoteImageSource {
  src: string;
  width: unknown;
  height: unknown;
}

export interface PromoteStoredImage {
  fileName: string;
  contentType: string;
}

export interface PromoteImageCacheOptions {
  imageDir: string;
  indexOrigin: string;
  httpClient?: Pick<DesktopHttpClient, 'requestBinary'>;
  budgetMs: number;
  maxBytes?: number;
  now?: () => number;
}

interface ImageType {
  ext: 'png' | 'jpg' | 'webp' | 'gif' | 'avif';
  contentType: string;
}

const CONTENT_TYPES: Record<ImageType['ext'], string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

function startsWithBytes(bytes: Buffer, offset: number, signature: string): boolean {
  return bytes.length >= offset + signature.length
    && bytes.subarray(offset, offset + signature.length).toString('latin1') === signature;
}

export function detectImageType(bytes: Buffer): ImageType | null {
  if (startsWithBytes(bytes, 0, '\x89PNG\r\n\x1a\n')) return { ext: 'png', contentType: CONTENT_TYPES.png };
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { ext: 'jpg', contentType: CONTENT_TYPES.jpg };
  }
  if (startsWithBytes(bytes, 0, 'GIF87a') || startsWithBytes(bytes, 0, 'GIF89a')) {
    return { ext: 'gif', contentType: CONTENT_TYPES.gif };
  }
  if (startsWithBytes(bytes, 0, 'RIFF') && startsWithBytes(bytes, 8, 'WEBP')) {
    return { ext: 'webp', contentType: CONTENT_TYPES.webp };
  }
  if (startsWithBytes(bytes, 4, 'ftyp') && (startsWithBytes(bytes, 8, 'avif') || startsWithBytes(bytes, 8, 'avis'))) {
    return { ext: 'avif', contentType: CONTENT_TYPES.avif };
  }
  return null;
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function resolveImageSource(src: string, indexOrigin: string): URL | null {
  const trimmed = src.trim();
  if (!trimmed || /^[\\/]{2}/.test(trimmed)) return null;
  try {
    const origin = new URL(indexOrigin);
    const url = new URL(trimmed, origin);
    if (url.origin !== origin.origin) return null;
    if (url.username || url.password) return null;
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url;
  } catch {
    return null;
  }
}

export function imageKeyForUrl(url: URL): string {
  return createHash('sha256').update(url.href).digest('hex').slice(0, 32);
}

export class PromoteImageCache {
  private readonly imageDir: string;
  private readonly indexOrigin: string;
  private readonly httpClient: Pick<DesktopHttpClient, 'requestBinary'>;
  private readonly budgetMs: number;
  private readonly maxBytes: number;
  private readonly now: () => number;

  constructor(options: PromoteImageCacheOptions) {
    this.imageDir = options.imageDir;
    this.indexOrigin = options.indexOrigin;
    this.httpClient = options.httpClient ?? desktopHttpClient;
    this.budgetMs = options.budgetMs;
    this.maxBytes = options.maxBytes ?? PROMOTE_IMAGE_MAX_BYTES;
    this.now = options.now ?? Date.now;
  }

  keyForSource(src: string): string | null {
    const url = resolveImageSource(src, this.indexOrigin);
    return url ? imageKeyForUrl(url) : null;
  }

  async ensureImages(sources: readonly PromoteImageSource[]): Promise<Map<string, PromoteStoredImage>> {
    const result = new Map<string, PromoteStoredImage>();
    const pending = new Map<string, { url: URL; key: string }>();

    for (const source of sources) {
      if (!isPositiveInteger(source.width) || !isPositiveInteger(source.height)) continue;
      const url = resolveImageSource(source.src, this.indexOrigin);
      if (!url) {
        log.warn('[PromoteImageCache] Skipped image outside the Index origin');
        continue;
      }
      const key = imageKeyForUrl(url);
      pending.set(key, { url, key });
    }
    if (pending.size === 0) return result;

    let stored: Map<string, string>;
    try {
      await mkdir(this.imageDir, { recursive: true });
      stored = await this.indexStoredFiles();
    } catch (error) {
      log.warn('[PromoteImageCache] Image folder unavailable:', error);
      return result;
    }

    const queue: Array<{ url: URL; key: string }> = [];
    for (const item of pending.values()) {
      const fileName = stored.get(item.key);
      if (fileName) {
        result.set(item.key, { fileName, contentType: contentTypeForFileName(fileName) });
      } else {
        queue.push(item);
      }
    }

    const deadline = this.now() + this.budgetMs;
    const workers = Array.from({ length: Math.min(PROMOTE_IMAGE_CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) return;
        const file = await this.downloadOne(item.url, item.key, deadline);
        if (file) result.set(item.key, file);
      }
    });
    await Promise.all(workers);
    return result;
  }

  async pruneUnreferenced(referencedKeys: ReadonlySet<string>): Promise<void> {
    let names: string[];
    try {
      names = await readdir(this.imageDir);
    } catch {
      return;
    }

    const cutoff = this.now() - STALE_TEMP_FILE_MS;
    for (const name of names) {
      const stored = STORED_NAME_PATTERN.exec(name);
      const isStale = TEMP_NAME_PATTERN.test(name) && await this.isOlderThan(name, cutoff);
      const isUnreferenced = stored !== null && !referencedKeys.has(stored[1]);
      if (!isUnreferenced && !isStale) continue;
      try {
        await unlink(path.join(this.imageDir, name));
      } catch (error) {
        log.warn('[PromoteImageCache] Failed to delete unreferenced image:', error);
      }
    }
  }

  async readImage(key: string, snapshotFiles: ReadonlyMap<string, string>): Promise<{ bytes: Buffer; contentType: string } | null> {
    if (!KEY_PATTERN.test(key)) return null;
    const fileName = snapshotFiles.get(key);
    if (!fileName) return null;
    const match = STORED_NAME_PATTERN.exec(fileName);
    if (!match || match[1] !== key) return null;
    try {
      const bytes = await readFile(path.join(this.imageDir, fileName));
      return { bytes, contentType: contentTypeForFileName(fileName) };
    } catch {
      return null;
    }
  }

  async hasStoredFile(fileName: string): Promise<boolean> {
    if (!STORED_NAME_PATTERN.test(fileName)) return false;
    try {
      await stat(path.join(this.imageDir, fileName));
      return true;
    } catch {
      return false;
    }
  }

  private async indexStoredFiles(): Promise<Map<string, string>> {
    const stored = new Map<string, string>();
    for (const name of await readdir(this.imageDir)) {
      const match = STORED_NAME_PATTERN.exec(name);
      if (match) stored.set(match[1], name);
    }
    return stored;
  }

  private async downloadOne(url: URL, key: string, deadline: number): Promise<PromoteStoredImage | null> {
    const remaining = deadline - this.now();
    if (remaining <= 0) return null;

    try {
      const response = await this.httpClient.requestBinary(url.href, {
        headers: { Accept: 'image/*' },
        redirect: 'error',
        maxBytes: this.maxBytes,
        timeoutMs: remaining,
        validateStatus: (status) => status === 200,
      });
      const type = detectImageType(response.data);
      if (!type) {
        log.warn('[PromoteImageCache] Rejected image with unsupported content');
        return null;
      }

      const fileName = `${key}.${type.ext}`;
      await this.writeAtomically(fileName, response.data);
      return { fileName, contentType: type.contentType };
    } catch (error) {
      log.warn('[PromoteImageCache] Image download skipped:', error);
      return null;
    }
  }

  private async writeAtomically(fileName: string, bytes: Buffer): Promise<void> {
    const tempPath = path.join(this.imageDir, `.promote-${fileName.slice(0, 32)}-${randomUUID()}.tmp`);
    try {
      await writeFile(tempPath, bytes);
      await rename(tempPath, path.join(this.imageDir, fileName));
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      throw error;
    }
  }

  private async isOlderThan(name: string, cutoff: number): Promise<boolean> {
    try {
      return (await stat(path.join(this.imageDir, name))).mtimeMs < cutoff;
    } catch {
      return false;
    }
  }
}

function contentTypeForFileName(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf('.') + 1) as ImageType['ext'];
  return CONTENT_TYPES[ext];
}
