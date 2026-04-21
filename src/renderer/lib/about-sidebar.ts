import { bundledAboutSnapshotPayload } from './generated/aboutSnapshot.js';

export const ABOUT_SNAPSHOT_URL = 'https://index.hagicode.com/about.json';
export const ABOUT_SNAPSHOT_ORIGIN = 'https://index.hagicode.com';
export const ABOUT_SNAPSHOT_VERSION = '1.0.0';
export const ABOUT_SNAPSHOT_REGION_PRIORITIES = ['china-first', 'international-first'] as const;
export const REQUIRED_ABOUT_ENTRY_IDS = [
  'youtube',
  'steam',
  'bilibili',
  'xiaohongshu',
  'douyin-account',
  'douyin-qr',
  'qq-group',
  'feishu-group',
  'discord',
  'wechat-account',
] as const;
export const ABOUT_SECTION_ORDER = ['store', 'community', 'content'] as const;

const STORE_ENTRY_IDS = new Set(['steam']);
const COMMUNITY_ENTRY_IDS = new Set(['qq-group', 'feishu-group', 'discord']);
const ENTRY_ORDER = [
  'feishu-group',
  'qq-group',
  'discord',
  'youtube',
  'product-hunt',
  'steam',
  'bilibili',
  'xiaohongshu',
  'douyin-account',
  'douyin-qr',
  'wechat-account',
  'juejin',
  'zhihu',
  'devto',
  'x',
  'linkedin',
  'infoq',
  'csdn',
  'cnblogs',
  'tencent-cloud',
  'oschina',
  'segmentfault',
  'facebook',
  'xiaoheihe',
] as const;
const ENTRY_PRIORITY = new Map(ENTRY_ORDER.map((id, index) => [id, index]));

export type SidebarAboutLocale = 'zh-CN' | 'en-US';
export type AboutSnapshotRequiredEntryId = (typeof REQUIRED_ABOUT_ENTRY_IDS)[number];
export type AboutSnapshotEntryType = 'link' | 'contact' | 'qr' | 'image';
export type AboutSnapshotRegionPriority = (typeof ABOUT_SNAPSHOT_REGION_PRIORITIES)[number];
export type SidebarAboutSectionId = (typeof ABOUT_SECTION_ORDER)[number];
export type SidebarAboutDataSource = 'snapshot' | 'runtime';

interface AboutSnapshotBaseEntry {
  readonly id: string;
  readonly type: AboutSnapshotEntryType;
  readonly label: string;
  readonly regionPriority: AboutSnapshotRegionPriority;
  readonly description?: string;
}

export interface AboutSnapshotLinkEntry extends AboutSnapshotBaseEntry {
  readonly type: 'link';
  readonly url: string;
}

export interface AboutSnapshotContactEntry extends AboutSnapshotBaseEntry {
  readonly type: 'contact';
  readonly value: string;
  readonly url?: string;
}

export interface AboutSnapshotMediaEntry extends AboutSnapshotBaseEntry {
  readonly type: 'qr' | 'image';
  readonly imageUrl: string;
  readonly resolvedImageUrl: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  readonly url?: string;
}

export type AboutSnapshotEntry =
  | AboutSnapshotLinkEntry
  | AboutSnapshotContactEntry
  | AboutSnapshotMediaEntry;

export interface AboutSnapshotData {
  readonly version: string;
  readonly updatedAt: string;
  readonly entries: readonly AboutSnapshotEntry[];
}

export interface SidebarAboutEntry {
  readonly id: string;
  readonly type: AboutSnapshotEntryType;
  readonly label: string;
  readonly detail: string;
  readonly href?: string;
  readonly value?: string;
  readonly imageUrl?: string;
  readonly alt?: string;
  readonly width?: number;
  readonly height?: number;
}

export interface SidebarAboutSection {
  readonly id: SidebarAboutSectionId;
  readonly entries: readonly SidebarAboutEntry[];
}

export interface SidebarAboutModel {
  readonly source: SidebarAboutDataSource;
  readonly version: string;
  readonly updatedAt: string;
  readonly sections: readonly SidebarAboutSection[];
}

export type SidebarAboutFetchState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly updatedAt: string }
  | { readonly status: 'error'; readonly error: string };

export interface SidebarAboutRefreshResult {
  readonly model: SidebarAboutModel | null;
  readonly fetchState: SidebarAboutFetchState;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value: unknown, fieldName: string): string {
  assert(
    typeof value === 'string' && value.trim().length > 0,
    `Invalid about snapshot payload: ${fieldName} must be a non-empty string`,
  );
  return value;
}

function readOptionalNonEmptyString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return readNonEmptyString(value, fieldName);
}

function readPositiveInteger(value: unknown, fieldName: string): number {
  assert(
    Number.isInteger(value) && Number(value) > 0,
    `Invalid about snapshot payload: ${fieldName} must be a positive integer`,
  );
  return Number(value);
}

function readRegionPriority(value: unknown, fieldName: string): AboutSnapshotRegionPriority {
  const regionPriority = readNonEmptyString(value, fieldName);
  assert(
    ABOUT_SNAPSHOT_REGION_PRIORITIES.includes(regionPriority as AboutSnapshotRegionPriority),
    `Invalid about snapshot payload: ${fieldName} must be ${ABOUT_SNAPSHOT_REGION_PRIORITIES.join(' or ')}`,
  );
  return regionPriority as AboutSnapshotRegionPriority;
}

function readMediaUrl(value: unknown, fieldName: string): string {
  const imageUrl = readNonEmptyString(value, fieldName);
  assert(
    imageUrl.startsWith('/_astro/') || imageUrl.startsWith('http://') || imageUrl.startsWith('https://'),
    `Invalid about snapshot payload: ${fieldName} must be a published asset URL`,
  );
  return imageUrl;
}

function resolveImageUrl(imageUrl: string): string {
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }

  return new URL(imageUrl, ABOUT_SNAPSHOT_ORIGIN).toString();
}

function getHostnameLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function normalizeAboutEntry(
  entry: unknown,
  index: number,
  seenIds: Set<string>,
  remainingIds: Set<AboutSnapshotRequiredEntryId>,
): AboutSnapshotEntry {
  assert(isRecord(entry), `Invalid about snapshot payload: entries[${index}] must be an object`);

  const id = readNonEmptyString(entry.id, `entries[${index}].id`);
  assert(!seenIds.has(id), `Invalid about snapshot payload: duplicate entry id "${id}"`);
  seenIds.add(id);
  remainingIds.delete(id as AboutSnapshotRequiredEntryId);

  const type = readNonEmptyString(entry.type, `${id}.type`);
  assert(
    ['link', 'contact', 'qr', 'image'].includes(type),
    `Invalid about snapshot payload: ${id}.type must be link, contact, qr, or image`,
  );

  const baseEntry = {
    id,
    type: type as AboutSnapshotEntryType,
    label: readNonEmptyString(entry.label, `${id}.label`),
    regionPriority: readRegionPriority(entry.regionPriority, `${id}.regionPriority`),
    description: readOptionalNonEmptyString(entry.description, `${id}.description`),
  };

  if (type === 'link') {
    return {
      ...baseEntry,
      type,
      url: readNonEmptyString(entry.url, `${id}.url`),
    };
  }

  if (type === 'contact') {
    return {
      ...baseEntry,
      type,
      value: readNonEmptyString(entry.value, `${id}.value`),
      url: readOptionalNonEmptyString(entry.url, `${id}.url`),
    };
  }

  const imageUrl = readMediaUrl(entry.imageUrl, `${id}.imageUrl`);

  return {
    ...baseEntry,
    type: type as AboutSnapshotMediaEntry['type'],
    imageUrl,
    resolvedImageUrl: resolveImageUrl(imageUrl),
    width: readPositiveInteger(entry.width, `${id}.width`),
    height: readPositiveInteger(entry.height, `${id}.height`),
    alt: readNonEmptyString(entry.alt, `${id}.alt`),
    url: readOptionalNonEmptyString(entry.url, `${id}.url`),
  };
}

export function normalizeSidebarAboutLocale(locale: string | undefined | null): SidebarAboutLocale {
  return locale?.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
}

export function getLocaleRegionPriority(locale: SidebarAboutLocale): AboutSnapshotRegionPriority {
  return locale === 'zh-CN' ? 'china-first' : 'international-first';
}

export function normalizeAboutSnapshotData(payload: unknown): AboutSnapshotData {
  assert(isRecord(payload), 'Invalid about snapshot payload: root must be an object');
  assert(Array.isArray(payload.entries), 'Invalid about snapshot payload: entries must be an array');

  const version = readNonEmptyString(payload.version, 'version');
  assert(
    version === ABOUT_SNAPSHOT_VERSION,
    `Invalid about snapshot payload: version must be ${ABOUT_SNAPSHOT_VERSION}`,
  );

  const remainingIds = new Set<AboutSnapshotRequiredEntryId>(REQUIRED_ABOUT_ENTRY_IDS);
  const seenIds = new Set<string>();
  const entries = payload.entries.map((entry, index) =>
    normalizeAboutEntry(entry, index, seenIds, remainingIds),
  );

  assert(
    remainingIds.size === 0,
    `Invalid about snapshot payload: missing required entries ${Array.from(remainingIds).join(', ')}`,
  );

  return {
    version,
    updatedAt: readNonEmptyString(payload.updatedAt, 'updatedAt'),
    entries,
  };
}

function sortEntries(locale: SidebarAboutLocale, entries: readonly AboutSnapshotEntry[]): AboutSnapshotEntry[] {
  const preferredRegionPriority = getLocaleRegionPriority(locale);

  return [...entries].sort((left, right) => {
    const leftLocalePriority = left.regionPriority === preferredRegionPriority ? 0 : 1;
    const rightLocalePriority = right.regionPriority === preferredRegionPriority ? 0 : 1;

    if (leftLocalePriority !== rightLocalePriority) {
      return leftLocalePriority - rightLocalePriority;
    }

    const leftPriority = ENTRY_PRIORITY.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightPriority = ENTRY_PRIORITY.get(right.id) ?? Number.MAX_SAFE_INTEGER;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return left.label.localeCompare(right.label, locale === 'zh-CN' ? 'zh-CN' : 'en');
  });
}

function getSectionId(entry: AboutSnapshotEntry): SidebarAboutSectionId {
  if (STORE_ENTRY_IDS.has(entry.id)) {
    return 'store';
  }

  if (COMMUNITY_ENTRY_IDS.has(entry.id)) {
    return 'community';
  }

  return 'content';
}

function mapEntryToSidebarEntry(entry: AboutSnapshotEntry): SidebarAboutEntry {
  if (entry.type === 'link') {
    return {
      id: entry.id,
      type: entry.type,
      label: entry.label,
      detail: entry.description ?? getHostnameLabel(entry.url),
      href: entry.url,
    };
  }

  if (entry.type === 'contact') {
    return {
      id: entry.id,
      type: entry.type,
      label: entry.label,
      detail: entry.description ?? entry.value,
      value: entry.value,
      href: entry.url,
    };
  }

  return {
    id: entry.id,
    type: entry.type,
    label: entry.label,
    detail: entry.description ?? entry.alt,
    href: entry.url ?? entry.resolvedImageUrl,
    imageUrl: entry.resolvedImageUrl,
    alt: entry.alt,
    width: entry.width,
    height: entry.height,
  };
}

export function buildSidebarAboutModel(
  locale: SidebarAboutLocale,
  snapshot: AboutSnapshotData,
  source: SidebarAboutDataSource,
): SidebarAboutModel {
  const sections = ABOUT_SECTION_ORDER.map((sectionId) => {
    const sectionEntries = sortEntries(
      locale,
      snapshot.entries.filter((entry) => getSectionId(entry) === sectionId),
    ).map((entry) => mapEntryToSidebarEntry(entry));

    return {
      id: sectionId,
      entries: sectionEntries,
    };
  }).filter((section) => section.entries.length > 0);

  return {
    source,
    version: snapshot.version,
    updatedAt: snapshot.updatedAt,
    sections,
  };
}

export function hasSidebarAboutEntries(model: SidebarAboutModel | null): boolean {
  return Boolean(model?.sections.some((section) => section.entries.length > 0));
}

export function loadBundledSidebarAbout(locale: SidebarAboutLocale): SidebarAboutModel | null {
  try {
    const snapshot = normalizeAboutSnapshotData(bundledAboutSnapshotPayload);
    return buildSidebarAboutModel(locale, snapshot, 'snapshot');
  } catch (error) {
    console.error('Failed to load bundled about snapshot:', error);
    return null;
  }
}

export function createLoadingSidebarAboutFetchState(): SidebarAboutFetchState {
  return { status: 'loading' };
}

export async function fetchRuntimeSidebarAbout(
  locale: SidebarAboutLocale,
  fetchImpl: typeof fetch = fetch,
): Promise<SidebarAboutRefreshResult> {
  try {
    const response = await fetchImpl(ABOUT_SNAPSHOT_URL, {
      cache: 'no-store',
      headers: {
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      return {
        model: null,
        fetchState: {
          status: 'error',
          error: `HTTP ${response.status}`,
        },
      };
    }

    const snapshot = normalizeAboutSnapshotData(await response.json());
    const model = buildSidebarAboutModel(locale, snapshot, 'runtime');

    return {
      model,
      fetchState: {
        status: 'success',
        updatedAt: model.updatedAt,
      },
    };
  } catch (error) {
    return {
      model: null,
      fetchState: {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
}

export async function refreshSidebarAboutModel(
  locale: SidebarAboutLocale,
  currentModel: SidebarAboutModel | null,
  fetchImpl: typeof fetch = fetch,
): Promise<SidebarAboutRefreshResult> {
  const runtimeResult = await fetchRuntimeSidebarAbout(locale, fetchImpl);

  if (runtimeResult.model) {
    return runtimeResult;
  }

  return {
    model: currentModel,
    fetchState: runtimeResult.fetchState,
  };
}
