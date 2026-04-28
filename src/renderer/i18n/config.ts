import { DESKTOP_LANGUAGES } from '../../shared/desktop-languages';

/**
 * i18next Configuration
 *
 * Configuration for the i18next internationalization framework.
 * Sets up default language, fallback language, namespaces, and React integration.
 */

export const i18nConfig = {
  // Default language: Simplified Chinese
  lng: 'zh-CN',

  // Fallback language chain
  fallbackLng: {
    default: ['en-US'],
    'zh-Hant': ['zh-CN', 'en-US'],
    'zh-HK': ['zh-Hant', 'zh-CN', 'en-US'],
    'zh-TW': ['zh-Hant', 'zh-CN', 'en-US'],
    'ja-JP': ['en-US'],
    'ko-KR': ['en-US'],
    'de-DE': ['en-US'],
    'fr-FR': ['en-US'],
    'es-ES': ['en-US'],
    'pt-BR': ['en-US'],
    'ru-RU': ['en-US'],
  },

  // Default namespace
  defaultNS: 'common',

  // Available namespaces
  ns: ['common', 'components', 'pages', 'ui', 'onboarding', 'installation', 'prompt-guidance'],

  // Namespace separator
  nsSeparator: ':',

  // Key separator
  keySeparator: '.',

  // Interpolation configuration
  interpolation: {
    escapeValue: false, // React already escapes values
    formatSeparator: ',',
    format: (value: string, format?: string) => {
      if (format === 'uppercase') return value.toUpperCase();
      if (format === 'lowercase') return value.toLowerCase();
      return value;
    },
  },

  // React specific configuration
  react: {
    useSuspense: false, // Disable Suspense to avoid blocking rendering
    bindI18n: 'languageChanged',
    bindI18nStore: 'added',
    transEmptyNodeValue: '',
    transSupportBasicHtmlNodes: true,
    transKeepBasicHtmlNodesFor: ['br', 'strong', 'i', 'p'],
  },

  // Debug mode (false in production)
  debug: process.env.NODE_ENV === 'development',

  // Save missing translation keys (development mode)
  saveMissing: process.env.NODE_ENV === 'development',
  saveMissingTo: 'current',
  missingKeyHandler: (lng: string, ns: string, key: string) => {
    console.warn(`Missing translation key: ${lng}:${ns}:${key}`);
  },
};

/**
 * Available languages configuration
 */
export const availableLanguages = DESKTOP_LANGUAGES;

export type AvailableLanguageCode = typeof availableLanguages[number]['code'];
