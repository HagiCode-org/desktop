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
    'zh-HK': ['zh-CN', 'en-US'],
    'zh-TW': ['zh-CN', 'en-US'],
  },

  // Default namespace
  defaultNS: 'common',

  // Available namespaces
  ns: ['common', 'components', 'pages', 'ui'],

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
export const availableLanguages = [
  {
    code: 'zh-CN',
    name: 'Simplified Chinese',
    nativeName: '简体中文',
    flag: '🇨🇳',
  },
  {
    code: 'en-US',
    name: 'English',
    nativeName: 'English',
    flag: '🇺🇸',
  },
] as const;

export type AvailableLanguageCode = typeof availableLanguages[number]['code'];
