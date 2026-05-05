import {
  resolveDesktopLanguageCode,
  type DesktopLanguageCode,
} from './desktop-languages.js';

export const DEFAULT_RSS_LANGUAGE = 'zh-CN';
export const CHINESE_RSS_FEED_URL = 'https://docs.hagicode.com/blog/rss.zh-CN.xml';
export const TRADITIONAL_CHINESE_RSS_FEED_URL = 'https://docs.hagicode.com/blog/rss.zh-Hant.xml';
export const ENGLISH_RSS_FEED_URL = 'https://docs.hagicode.com/blog/rss.en-US.xml';
export const JAPANESE_RSS_FEED_URL = 'https://docs.hagicode.com/blog/rss.ja-JP.xml';
export const KOREAN_RSS_FEED_URL = 'https://docs.hagicode.com/blog/rss.ko-KR.xml';
export const GERMAN_RSS_FEED_URL = 'https://docs.hagicode.com/blog/rss.de-DE.xml';
export const FRENCH_RSS_FEED_URL = 'https://docs.hagicode.com/blog/rss.fr-FR.xml';
export const SPANISH_RSS_FEED_URL = 'https://docs.hagicode.com/blog/rss.es-ES.xml';
export const PORTUGUESE_RSS_FEED_URL = 'https://docs.hagicode.com/blog/rss.pt-BR.xml';
export const RUSSIAN_RSS_FEED_URL = 'https://docs.hagicode.com/blog/rss.ru-RU.xml';
export const DEFAULT_RSS_FEED_URL = CHINESE_RSS_FEED_URL;

const RSS_FEED_URL_BY_LANGUAGE: Readonly<Record<DesktopLanguageCode, string>> = {
  'zh-CN': CHINESE_RSS_FEED_URL,
  'zh-Hant': TRADITIONAL_CHINESE_RSS_FEED_URL,
  'en-US': ENGLISH_RSS_FEED_URL,
  'ja-JP': JAPANESE_RSS_FEED_URL,
  'ko-KR': KOREAN_RSS_FEED_URL,
  'de-DE': GERMAN_RSS_FEED_URL,
  'fr-FR': FRENCH_RSS_FEED_URL,
  'es-ES': SPANISH_RSS_FEED_URL,
  'pt-BR': PORTUGUESE_RSS_FEED_URL,
  'ru-RU': RUSSIAN_RSS_FEED_URL,
};

export type SupportedRSSLanguage = DesktopLanguageCode;

function normalizeLanguage(language?: string): string {
  return language?.trim() || DEFAULT_RSS_LANGUAGE;
}

export function resolveRSSFeedLanguage(language?: string): SupportedRSSLanguage {
  return resolveDesktopLanguageCode(normalizeLanguage(language));
}

export function resolveRSSFeedUrl(language?: string): string {
  return RSS_FEED_URL_BY_LANGUAGE[resolveRSSFeedLanguage(language)];
}
