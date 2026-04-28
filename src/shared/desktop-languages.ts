export const DEFAULT_DESKTOP_LANGUAGE = 'zh-CN';

export const SUPPORTED_DESKTOP_LANGUAGE_CODES = [
  'zh-CN',
  'zh-Hant',
  'en-US',
  'ja-JP',
  'ko-KR',
  'de-DE',
  'fr-FR',
  'es-ES',
  'pt-BR',
  'ru-RU',
] as const;

export type DesktopLanguageCode = (typeof SUPPORTED_DESKTOP_LANGUAGE_CODES)[number];

export interface DesktopLanguage {
  readonly code: DesktopLanguageCode;
  readonly name: string;
  readonly nativeName: string;
  readonly shortLabel: string;
  readonly fallbackCodes: readonly DesktopLanguageCode[];
}

export const DESKTOP_LANGUAGES: readonly DesktopLanguage[] = [
  {
    code: 'zh-CN',
    name: 'Simplified Chinese',
    nativeName: '简体中文',
    shortLabel: '中',
    fallbackCodes: ['en-US'],
  },
  {
    code: 'zh-Hant',
    name: 'Traditional Chinese',
    nativeName: '繁體中文',
    shortLabel: '繁',
    fallbackCodes: ['zh-CN', 'en-US'],
  },
  {
    code: 'en-US',
    name: 'English',
    nativeName: 'English',
    shortLabel: 'EN',
    fallbackCodes: ['en-US'],
  },
  {
    code: 'ja-JP',
    name: 'Japanese',
    nativeName: '日本語',
    shortLabel: '日',
    fallbackCodes: ['en-US'],
  },
  {
    code: 'ko-KR',
    name: 'Korean',
    nativeName: '한국어',
    shortLabel: '한',
    fallbackCodes: ['en-US'],
  },
  {
    code: 'de-DE',
    name: 'German',
    nativeName: 'Deutsch',
    shortLabel: 'DE',
    fallbackCodes: ['en-US'],
  },
  {
    code: 'fr-FR',
    name: 'French',
    nativeName: 'Français',
    shortLabel: 'FR',
    fallbackCodes: ['en-US'],
  },
  {
    code: 'es-ES',
    name: 'Spanish',
    nativeName: 'Español',
    shortLabel: 'ES',
    fallbackCodes: ['en-US'],
  },
  {
    code: 'pt-BR',
    name: 'Portuguese (Brazil)',
    nativeName: 'Português (Brasil)',
    shortLabel: 'PT',
    fallbackCodes: ['en-US'],
  },
  {
    code: 'ru-RU',
    name: 'Russian',
    nativeName: 'Русский',
    shortLabel: 'RU',
    fallbackCodes: ['en-US'],
  },
] as const;

const LANGUAGE_BY_CODE = new Map<DesktopLanguageCode, DesktopLanguage>(
  DESKTOP_LANGUAGES.map((language) => [language.code, language]),
);

function canonicalizeLocale(locale: string): string {
  const candidate = locale.trim().replace(/_/g, '-');
  if (!candidate) {
    return '';
  }

  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? candidate;
  } catch {
    return candidate;
  }
}

export function normalizeDesktopLanguageCode(language: string | null | undefined): DesktopLanguageCode | null {
  if (!language) {
    return null;
  }

  const canonical = canonicalizeLocale(language);
  const normalized = canonical.toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === 'zh-hant' || normalized.includes('-hant') || ['zh-tw', 'zh-hk', 'zh-mo'].includes(normalized)) {
    return 'zh-Hant';
  }

  if (normalized === 'zh' || normalized.includes('-hans') || ['zh-cn', 'zh-sg'].includes(normalized)) {
    return 'zh-CN';
  }

  for (const supportedCode of SUPPORTED_DESKTOP_LANGUAGE_CODES) {
    if (supportedCode.toLowerCase() === normalized) {
      return supportedCode;
    }
  }

  const [languagePart] = normalized.split('-');
  switch (languagePart) {
    case 'en':
      return 'en-US';
    case 'ja':
      return 'ja-JP';
    case 'ko':
      return 'ko-KR';
    case 'de':
      return 'de-DE';
    case 'fr':
      return 'fr-FR';
    case 'es':
      return 'es-ES';
    case 'pt':
      return 'pt-BR';
    case 'ru':
      return 'ru-RU';
    default:
      return null;
  }
}

export function resolveDesktopLanguageCode(
  language: string | null | undefined,
  fallback: DesktopLanguageCode = DEFAULT_DESKTOP_LANGUAGE,
): DesktopLanguageCode {
  return normalizeDesktopLanguageCode(language) ?? fallback;
}

export function getDesktopLanguage(language: string | null | undefined): DesktopLanguage {
  const code = resolveDesktopLanguageCode(language);
  return LANGUAGE_BY_CODE.get(code) ?? LANGUAGE_BY_CODE.get(DEFAULT_DESKTOP_LANGUAGE)!;
}

export function getDesktopLanguageShortLabel(language: string | null | undefined): string {
  return getDesktopLanguage(language).shortLabel;
}

export function isChineseDesktopLanguage(language: string | null | undefined): boolean {
  const code = resolveDesktopLanguageCode(language);
  return code === 'zh-CN' || code === 'zh-Hant';
}
