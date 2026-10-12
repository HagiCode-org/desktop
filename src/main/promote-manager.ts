import log from 'electron-log';
import type { PromoteImage, PromoteItem } from '../types/promote.js';
import { desktopHttpClient, type DesktopHttpClient } from './http-client.js';
import { isPositiveInteger, type PromoteImageCache, type PromoteImageSource, type PromoteImageTier } from './promote-image-cache.js';

export const PROMOTE_INDEX_ORIGIN = 'https://index.hagicode.com';
export const PROMOTE_PLATFORM = 'hagicode';
export const PROMOTE_STORE_KEY = 'promoteSnapshot';
export const PROMOTE_REFRESH_INTERVAL_MS = 60 * 60 * 1000;
export const PROMOTE_DOCUMENT_TIMEOUT_MS = 15_000;

const CATALOG_PATH = '/index-catalog.json';
const CANONICAL_FLAGS_PATH = '/promote.json';
const CANONICAL_CONTENT_PATH = '/promote_content.json';
const FLAGS_CATALOG_ID = 'promotion-flags';
const CONTENT_CATALOG_ID = 'promotion-content';

type JsonRecord = Record<string, unknown>;
type LocalizedText = Record<string, string>;

export interface PromoteCandidateImage {
  key: string;
  width: number;
  height: number;
  alt: string;
  fileName?: string;
}

export interface PromoteCandidate {
  id: string;
  on: boolean;
  startTime?: string;
  endTime?: string;
  title: LocalizedText;
  description: LocalizedText;
  cta?: LocalizedText;
  link: string;
  image?: PromoteCandidateImage;
}

interface PromoteSnapshot {
  fetchedAt: number;
  attemptedAt: number;
  candidates: PromoteCandidate[];
}

interface ImageDescriptor {
  src: string;
  width: unknown;
  height: unknown;
  alt: string;
  sources: PromoteImageTier[];
}

interface PromoteFlag {
  id: string;
  on: boolean;
  startTime?: string;
  endTime?: string;
}

interface PromoteContent {
  id: string;
  title: LocalizedText;
  description: LocalizedText;
  cta?: LocalizedText;
  link: string;
  image?: ImageDescriptor;
}

interface ParsedCandidate extends Omit<PromoteCandidate, 'image'> {
  imageSource?: ImageDescriptor;
}

export interface PromoteSnapshotStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

export interface PromoteManagerOptions {
  store: PromoteSnapshotStore;
  imageCache: PromoteImageCache;
  httpClient?: Pick<DesktopHttpClient, 'requestJson'>;
  indexOrigin?: string;
  storeKey?: string;
  now?: () => number;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function optionalString(value: unknown): string | undefined {
  return nonEmptyString(value) ? value.trim() : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseLocalized(value: unknown): LocalizedText | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).flatMap(([key, text]): Array<[string, string]> =>
    key.trim() && nonEmptyString(text) ? [[key.trim(), text.trim()]] : [],
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function isLocalized(value: unknown): value is LocalizedText {
  return parseLocalized(value) !== undefined;
}

function parseImageTiers(value: unknown): PromoteImageTier[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): PromoteImageTier[] => {
    if (!isRecord(item) || !nonEmptyString(item.type) || !nonEmptyString(item.src)) return [];
    const type = item.type.trim().toLowerCase();
    return type.startsWith('image/') ? [{ src: item.src.trim(), type }] : [];
  });
}

function parseImageDescriptor(value: unknown): ImageDescriptor | undefined {
  if (!isRecord(value) || !nonEmptyString(value.src)) return undefined;
  return {
    src: value.src.trim(),
    width: value.width,
    height: value.height,
    alt: nonEmptyString(value.alt) ? value.alt.trim() : '',
    sources: parseImageTiers(value.sources),
  };
}

function parseHagicodeFlags(payload: unknown): PromoteFlag[] {
  if (!isRecord(payload) || !Array.isArray(payload.promotes)) {
    throw new Error('promote.json has no promotes array');
  }
  return payload.promotes.flatMap((item): PromoteFlag[] => {
    if (!isRecord(item) || !nonEmptyString(item.id) || typeof item.on !== 'boolean') return [];
    const platforms = item.platforms;
    if (!Array.isArray(platforms) || !platforms.every((platform) => typeof platform === 'string')) return [];
    if (!platforms.includes(PROMOTE_PLATFORM)) return [];
    return [{
      id: item.id.trim(),
      on: item.on,
      startTime: optionalString(item.startTime),
      endTime: optionalString(item.endTime),
    }];
  });
}

function parseContents(payload: unknown): Map<string, PromoteContent> {
  if (!isRecord(payload) || !Array.isArray(payload.contents)) {
    throw new Error('promote_content.json has no contents array');
  }
  const contents = new Map<string, PromoteContent>();
  for (const item of payload.contents) {
    if (!isRecord(item) || !nonEmptyString(item.id) || !nonEmptyString(item.link)) continue;
    const title = parseLocalized(item.title);
    const description = parseLocalized(item.description);
    if (!title || !description) continue;
    contents.set(item.id.trim(), {
      id: item.id.trim(),
      title,
      description,
      cta: parseLocalized(item.cta),
      link: item.link.trim(),
      image: parseImageDescriptor(item.image),
    });
  }
  return contents;
}

function pairCandidates(flags: PromoteFlag[], contents: Map<string, PromoteContent>): ParsedCandidate[] {
  return flags.flatMap((flag): ParsedCandidate[] => {
    const content = contents.get(flag.id);
    if (!content) return [];
    return [{
      id: flag.id,
      on: flag.on,
      startTime: flag.startTime,
      endTime: flag.endTime,
      title: content.title,
      description: content.description,
      cta: content.cta,
      link: content.link,
      imageSource: content.image,
    }];
  });
}

function isStoredImage(value: unknown): value is PromoteCandidateImage {
  return isRecord(value)
    && nonEmptyString(value.key)
    && isPositiveInteger(value.width)
    && isPositiveInteger(value.height)
    && typeof value.alt === 'string'
    && (value.fileName === undefined || nonEmptyString(value.fileName));
}

function isStoredCandidate(value: unknown): value is PromoteCandidate {
  return isRecord(value)
    && nonEmptyString(value.id)
    && typeof value.on === 'boolean'
    && isLocalized(value.title)
    && isLocalized(value.description)
    && nonEmptyString(value.link)
    && (value.image === undefined || isStoredImage(value.image));
}

function parseSnapshot(raw: unknown): PromoteSnapshot | null {
  if (!isRecord(raw) || !isFiniteNumber(raw.fetchedAt) || !isFiniteNumber(raw.attemptedAt) || !Array.isArray(raw.candidates)) {
    return null;
  }
  return {
    fetchedAt: raw.fetchedAt,
    attemptedAt: raw.attemptedAt,
    candidates: raw.candidates.filter(isStoredCandidate),
  };
}

function isActive(candidate: PromoteCandidate, now: number): boolean {
  if (!candidate.on) return false;
  const start = candidate.startTime ? Date.parse(candidate.startTime) : null;
  const end = candidate.endTime ? Date.parse(candidate.endTime) : null;
  if ((start !== null && !Number.isFinite(start)) || (end !== null && !Number.isFinite(end))) return false;
  if (start !== null && end !== null && start >= end) return false;
  return (start === null || now >= start) && (end === null || now < end);
}

function safeHttpLink(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

function localeCandidates(language: string): string[] {
  const normalized = language.trim().replace(/_/g, '-').toLowerCase();
  const primary = normalized.split('-')[0] ?? normalized;
  let family: string[] = [primary];
  if (primary === 'zh') {
    const traditional = normalized.includes('hant') || ['zh-tw', 'zh-hk', 'zh-mo'].includes(normalized);
    family = traditional ? ['zh-hant', 'zh-cn', 'zh'] : ['zh-cn', 'zh-hant', 'zh'];
  }
  return [...new Set([normalized, ...family, 'en-us', 'en'])];
}

function localized(text: LocalizedText, language: string): string | undefined {
  const entries = new Map(Object.entries(text).map(([key, value]) => [key.toLowerCase(), value]));
  for (const candidate of localeCandidates(language)) {
    const value = entries.get(candidate);
    if (value) return value;
  }
  return Object.values(text)[0];
}

function findCatalogPath(entries: unknown, id: string): string | undefined {
  if (!Array.isArray(entries)) return undefined;
  const entry = entries.find((item) => isRecord(item) && item.id === id);
  return isRecord(entry) && nonEmptyString(entry.path) ? entry.path.trim() : undefined;
}

export class PromoteManager {
  private readonly store: PromoteSnapshotStore;
  private readonly imageCache: PromoteImageCache;
  private readonly httpClient: Pick<DesktopHttpClient, 'requestJson'>;
  private readonly indexOrigin: string;
  private readonly storeKey: string;
  private readonly now: () => number;
  private inFlight: Promise<void> | null = null;

  constructor(options: PromoteManagerOptions) {
    this.store = options.store;
    this.imageCache = options.imageCache;
    this.httpClient = options.httpClient ?? desktopHttpClient;
    this.indexOrigin = options.indexOrigin ?? PROMOTE_INDEX_ORIGIN;
    this.storeKey = options.storeKey ?? PROMOTE_STORE_KEY;
    this.now = options.now ?? Date.now;
  }

  async getItems(language: string, now = this.now()): Promise<PromoteItem[]> {
    let snapshot = this.readSnapshot();
    if (this.isRefreshDue(snapshot, now)) {
      if (snapshot && snapshot.fetchedAt > 0) {
        void this.refresh();
      } else {
        await this.refresh();
        snapshot = this.readSnapshot();
      }
    }
    if (!snapshot) return [];

    const items: PromoteItem[] = [];
    for (const candidate of snapshot.candidates) {
      const item = await this.toItem(candidate, language, now);
      if (item) items.push(item);
    }
    return items;
  }

  async getImage(key: string): Promise<string | null> {
    const files = new Map<string, string>();
    for (const candidate of this.readSnapshot()?.candidates ?? []) {
      if (candidate.image?.fileName) files.set(candidate.image.key, candidate.image.fileName);
    }
    const image = await this.imageCache.readImage(key, files);
    return image ? `data:${image.contentType};base64,${image.bytes.toString('base64')}` : null;
  }

  private readSnapshot(): PromoteSnapshot | null {
    try {
      return parseSnapshot(this.store.get(this.storeKey));
    } catch (error) {
      log.warn('[PromoteManager] Failed to read stored snapshot:', error);
      return null;
    }
  }

  private writeSnapshot(snapshot: PromoteSnapshot): void {
    this.store.set(this.storeKey, snapshot);
  }

  private isRefreshDue(snapshot: PromoteSnapshot | null, now: number): boolean {
    if (!snapshot) return true;
    return now - Math.max(snapshot.fetchedAt, snapshot.attemptedAt) >= PROMOTE_REFRESH_INTERVAL_MS;
  }

  private refresh(): Promise<void> {
    if (!this.inFlight) {
      this.inFlight = this.runRefresh()
        .catch((error) => log.error('[PromoteManager] Refresh crashed:', error))
        .finally(() => {
          this.inFlight = null;
        });
    }
    return this.inFlight;
  }

  private async runRefresh(): Promise<void> {
    const attemptedAt = this.now();
    try {
      const urls = await this.resolveDocumentUrls();
      const flagsPayload = await this.fetchDocument(urls.flags);
      const contentsPayload = await this.fetchDocument(urls.contents);
      const parsed = pairCandidates(parseHagicodeFlags(flagsPayload), parseContents(contentsPayload));
      const candidates = await this.attachImages(parsed);

      this.writeSnapshot({ fetchedAt: this.now(), attemptedAt, candidates });
      await this.imageCache.pruneUnreferenced(new Set(
        candidates.flatMap((candidate) => (candidate.image?.fileName ? [candidate.image.key] : [])),
      ));
      log.info('[PromoteManager] Refreshed promotions:', { candidates: candidates.length });
    } catch (error) {
      log.warn('[PromoteManager] Refresh failed, keeping stored data:', error);
      const current = this.readSnapshot();
      this.writeSnapshot({
        fetchedAt: current?.fetchedAt ?? 0,
        attemptedAt,
        candidates: current?.candidates ?? [],
      });
    }
  }

  private async fetchDocument(url: string): Promise<unknown> {
    const response = await this.httpClient.requestJson<unknown>(url, { timeoutMs: PROMOTE_DOCUMENT_TIMEOUT_MS });
    return response.data;
  }

  private async resolveDocumentUrls(): Promise<{ flags: string; contents: string }> {
    const canonical = {
      flags: this.toIndexUrl(CANONICAL_FLAGS_PATH) ?? CANONICAL_FLAGS_PATH,
      contents: this.toIndexUrl(CANONICAL_CONTENT_PATH) ?? CANONICAL_CONTENT_PATH,
    };
    try {
      const catalog = await this.httpClient.requestJson<unknown>(
        this.toIndexUrl(CATALOG_PATH) ?? CATALOG_PATH,
        { timeoutMs: PROMOTE_DOCUMENT_TIMEOUT_MS },
      );
      const entries = isRecord(catalog.data) ? catalog.data.entries : undefined;
      return {
        flags: this.toIndexUrl(findCatalogPath(entries, FLAGS_CATALOG_ID)) ?? canonical.flags,
        contents: this.toIndexUrl(findCatalogPath(entries, CONTENT_CATALOG_ID)) ?? canonical.contents,
      };
    } catch (error) {
      log.warn('[PromoteManager] Catalog discovery failed, using canonical paths:', error);
      return canonical;
    }
  }

  private toIndexUrl(path: string | undefined): string | undefined {
    if (!path) return undefined;
    try {
      const origin = new URL(this.indexOrigin);
      const url = new URL(path, origin);
      return url.origin === origin.origin ? url.href : undefined;
    } catch {
      return undefined;
    }
  }

  private async attachImages(parsed: ParsedCandidate[]): Promise<PromoteCandidate[]> {
    const sources: PromoteImageSource[] = [];
    const keyed = parsed.map(({ imageSource, ...candidate }): PromoteCandidate => {
      const width = imageSource?.width;
      const height = imageSource?.height;
      if (!imageSource || !isPositiveInteger(width) || !isPositiveInteger(height)) return candidate;
      const key = this.imageCache.keyForSource(imageSource.src);
      if (!key) return candidate;
      const tiers = [...imageSource.sources.filter((tier) => tier.src !== imageSource.src), { src: imageSource.src }];
      sources.push({ src: imageSource.src, width, height, tiers });
      return { ...candidate, image: { key, width, height, alt: imageSource.alt } };
    });

    const stored = await this.imageCache.ensureImages(sources);
    return keyed.map((candidate) => {
      if (!candidate.image) return candidate;
      const file = stored.get(candidate.image.key);
      return file ? { ...candidate, image: { ...candidate.image, fileName: file.fileName } } : candidate;
    });
  }

  private async toItem(candidate: PromoteCandidate, language: string, now: number): Promise<PromoteItem | null> {
    if (!isActive(candidate, now)) return null;
    const link = safeHttpLink(candidate.link);
    if (!link) return null;
    const title = localized(candidate.title, language);
    const description = localized(candidate.description, language);
    if (!title || !description) return null;
    const ctaLabel = candidate.cta ? localized(candidate.cta, language) : undefined;
    const image = await this.toPromoteImage(candidate.image, title);
    return {
      id: candidate.id,
      title,
      description,
      ...(ctaLabel ? { ctaLabel } : {}),
      link,
      ...(image ? { image } : {}),
    };
  }

  private async toPromoteImage(image: PromoteCandidateImage | undefined, title: string): Promise<PromoteImage | undefined> {
    if (!image?.fileName || !(await this.imageCache.hasStoredFile(image.fileName))) return undefined;
    return {
      key: image.key,
      width: image.width,
      height: image.height,
      alt: image.alt || title,
    };
  }
}
