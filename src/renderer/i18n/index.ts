/**
 * i18n Instance Initialization
 *
 * Main i18next instance with configured resources and plugins.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { i18nConfig } from './config';

const localeModules = import.meta.glob('./generated-locales/*/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, Record<string, unknown>>;

const resources = Object.entries(localeModules).reduce<Record<string, Record<string, Record<string, unknown>>>>(
  (acc, [modulePath, namespaceResources]) => {
    const match = modulePath.match(/^\.\/generated-locales\/([^/]+)\/([^/]+)\.json$/);
    if (!match) {
      return acc;
    }

    const [, language, namespace] = match;
    acc[language] ??= {};
    acc[language][namespace] = namespaceResources;
    return acc;
  },
  {},
);

// Initialize i18next
i18n
  .use(initReactI18next) // Pass i18n instance to react-i18next
  .init({
    ...i18nConfig,

    // Translation resources
    resources,
  })
  .then(() => {
    // Log successful initialization for debugging
    console.log('[i18n] Initialized successfully');
    console.log('[i18n] Current language:', i18n.language);
    console.log('[i18n] Available namespaces:', Object.keys(i18n.store.data));
  })
  .catch((error) => {
    console.error('[i18n] Initialization failed:', error);
  });

export default i18n;
