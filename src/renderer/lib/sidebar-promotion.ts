export const SIDEBAR_PROMOTION_FLAGS_URL = 'https://index.hagicode.com/promote.json';
export const SIDEBAR_PROMOTION_CONTENT_URL = 'https://index.hagicode.com/promote_content.json';
export const SIDEBAR_PROMOTION_ASSET_ORIGIN = 'https://index.hagicode.com';

export type SidebarPromotionLocale = 'zh-CN' | 'en-US';

export interface PromotionFlag {
  readonly id: string;
  readonly enabled: boolean;
  readonly startsAt?: string;
  readonly endsAt?: string;
}

export interface PromotionContent {
  readonly id: string;
  readonly title: Readonly<Record<string, string>>;
  readonly description: Readonly<Record<string, string>>;
  readonly cta?: Readonly<Record<string, string>>;
  readonly link: string;
  readonly image?: SidebarPromotionImage;
}

export interface SidebarPromotionImage {
  readonly src: string;
  readonly alt: string;
  readonly width?: number;
  readonly height?: number;
}

export interface SidebarPromotionModel {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly cta: string;
  readonly link: string;
  readonly image?: SidebarPromotionImage;
}

interface PromotionPayloads {
  readonly flags: readonly PromotionFlag[];
  readonly contents: readonly PromotionContent[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readLocalizedTextMap(value: unknown): Readonly<Record<string, string>> | null {
  if (!isRecord(value)) {
    return null;
  }

  const entries = Object.entries(value)
    .map(([locale, text]) => [locale.trim(), readNonEmptyString(text)] as const)
    .filter((entry): entry is readonly [string, string] => entry[0].length > 0 && entry[1] !== null);

  if (entries.length === 0) {
    return null;
  }

  return Object.fromEntries(entries);
}

function readOptionalLocalizedTextMap(value: unknown): Readonly<Record<string, string>> | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  const textMap = readLocalizedTextMap(value);
  return textMap ?? undefined;
}

function readIsoDate(value: unknown): string | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  const text = readNonEmptyString(value);
  if (!text) {
    return null;
  }

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : text;
}

function readOptionalPositiveInteger(value: unknown): number | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function resolvePromotionImageSrc(src: string): string | null {
  if (isHttpUrl(src)) {
    return src;
  }

  if (src.startsWith('/')) {
    return new URL(src, SIDEBAR_PROMOTION_ASSET_ORIGIN).toString();
  }

  return null;
}

function readOptionalPromotionImage(value: unknown): SidebarPromotionImage | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    return null;
  }

  const src = readNonEmptyString(value.src ?? value.url);
  const resolvedSrc = src ? resolvePromotionImageSrc(src) : null;
  const alt = readNonEmptyString(value.alt) ?? '';
  const width = readOptionalPositiveInteger(value.width);
  const height = readOptionalPositiveInteger(value.height);

  if (!resolvedSrc || width === null || height === null) {
    return null;
  }

  return { src: resolvedSrc, alt, width, height };
}

function readArrayPayload(value: unknown, fieldName: string): readonly unknown[] | null {
  if (Array.isArray(value)) {
    return value;
  }

  if (isRecord(value) && Array.isArray(value[fieldName])) {
    return value[fieldName];
  }

  return null;
}

function readArrayPayloadByNames(value: unknown, fieldNames: readonly string[]): readonly unknown[] | null {
  for (const fieldName of fieldNames) {
    const payload = readArrayPayload(value, fieldName);
    if (payload) {
      return payload;
    }
  }

  return null;
}

export function normalizeSidebarPromotionLocale(language: string | undefined | null): SidebarPromotionLocale {
  const normalized = (language ?? '').toLowerCase();
  return normalized.startsWith('zh') ? 'zh-CN' : 'en-US';
}

export function normalizePromotionFlags(payload: unknown): readonly PromotionFlag[] | null {
  const rawFlags = readArrayPayloadByNames(payload, ['promotions', 'promotes']);
  if (!rawFlags) {
    return null;
  }

  const seenIds = new Set<string>();
  const flags: PromotionFlag[] = [];

  for (const rawFlag of rawFlags) {
    if (!isRecord(rawFlag)) {
      return null;
    }

    const id = readNonEmptyString(rawFlag.id);
    const startsAt = readIsoDate(rawFlag.startsAt ?? rawFlag.startAt ?? rawFlag.startTime);
    const endsAt = readIsoDate(rawFlag.endsAt ?? rawFlag.endAt ?? rawFlag.endTime);
    const enabled = rawFlag.enabled ?? rawFlag.on;

    if (
      !id
      || seenIds.has(id)
      || typeof enabled !== 'boolean'
      || startsAt === null
      || endsAt === null
      || (startsAt && endsAt && Date.parse(startsAt) > Date.parse(endsAt))
    ) {
      return null;
    }

    seenIds.add(id);
    flags.push({ id, enabled, startsAt, endsAt });
  }

  return flags;
}

export function normalizePromotionContents(payload: unknown): readonly PromotionContent[] | null {
  const rawContents = readArrayPayloadByNames(payload, ['contents', 'promotions', 'promotes']);
  if (!rawContents) {
    return null;
  }

  const seenIds = new Set<string>();
  const contents: PromotionContent[] = [];

  for (const rawContent of rawContents) {
    if (!isRecord(rawContent)) {
      return null;
    }

    const id = readNonEmptyString(rawContent.id);
    const title = readLocalizedTextMap(rawContent.title);
    const description = readLocalizedTextMap(rawContent.description);
    const cta = readOptionalLocalizedTextMap(rawContent.cta ?? rawContent.ctaText);
    const link = readNonEmptyString(rawContent.link ?? rawContent.url ?? rawContent.href);
    const image = readOptionalPromotionImage(rawContent.image);

    if (!id || seenIds.has(id) || !title || !description || cta === null || !link || !isHttpUrl(link) || image === null) {
      return null;
    }

    seenIds.add(id);
    contents.push({ id, title, description, cta, link, image });
  }

  return contents;
}

function isFlagActive(flag: PromotionFlag, now: Date): boolean {
  if (!flag.enabled) {
    return false;
  }

  const nowTime = now.getTime();
  if (flag.startsAt && Date.parse(flag.startsAt) > nowTime) {
    return false;
  }

  if (flag.endsAt && Date.parse(flag.endsAt) < nowTime) {
    return false;
  }

  return true;
}

function pickLocalizedText(textMap: Readonly<Record<string, string>>, locale: SidebarPromotionLocale): string | null {
  const shortLocale = locale.split('-')[0] ?? locale;
  const legacyShortLocale = shortLocale === 'zh' ? 'zh' : 'en';

  return textMap[locale]
    ?? textMap[shortLocale]
    ?? textMap[legacyShortLocale]
    ?? Object.values(textMap)[0]
    ?? null;
}

export function resolveActiveSidebarPromotion(
  payloads: PromotionPayloads,
  locale: SidebarPromotionLocale,
  defaultCta: string,
  now: Date = new Date(),
): SidebarPromotionModel | null {
  const contentById = new Map(payloads.contents.map((content) => [content.id, content]));

  for (const flag of payloads.flags) {
    if (!isFlagActive(flag, now)) {
      continue;
    }

    const content = contentById.get(flag.id);
    if (!content) {
      continue;
    }

    const title = pickLocalizedText(content.title, locale);
    const description = pickLocalizedText(content.description, locale);
    const cta = content.cta ? pickLocalizedText(content.cta, locale) : null;

    if (!title || !description) {
      continue;
    }

    return {
      id: flag.id,
      title,
      description,
      cta: cta ?? defaultCta,
      link: content.link,
      image: content.image,
    };
  }

  return null;
}

async function fetchJson(url: string, fetchImpl: typeof fetch): Promise<unknown | null> {
  const response = await fetchImpl(url, {
    cache: 'no-store',
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    return null;
  }

  return response.json();
}

export async function fetchSidebarPromotion(
  locale: SidebarPromotionLocale,
  defaultCta: string,
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<SidebarPromotionModel | null> {
  try {
    const [flagPayload, contentPayload] = await Promise.all([
      fetchJson(SIDEBAR_PROMOTION_FLAGS_URL, fetchImpl),
      fetchJson(SIDEBAR_PROMOTION_CONTENT_URL, fetchImpl),
    ]);
    const flags = normalizePromotionFlags(flagPayload);
    const contents = normalizePromotionContents(contentPayload);

    if (!flags || !contents) {
      return null;
    }

    return resolveActiveSidebarPromotion({ flags, contents }, locale, defaultCta, now);
  } catch {
    return null;
  }
}
