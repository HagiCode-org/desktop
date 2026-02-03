/**
 * i18n Instance Initialization
 *
 * Main i18next instance with configured resources and plugins.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { i18nConfig } from './config';

// Import translation resources
import zhCNCommon from './locales/zh-CN/common.json';
import zhCNComponents from './locales/zh-CN/components.json';
import zhCNPages from './locales/zh-CN/pages.json';

import enUSCommon from './locales/en-US/common.json';
import enUSComponents from './locales/en-US/components.json';
import enUSPages from './locales/en-US/pages.json';

// Initialize i18next
i18n
  .use(initReactI18next) // Pass i18n instance to react-i18next
  .init({
    ...i18nConfig,

    // Translation resources
    resources: {
      'zh-CN': {
        common: zhCNCommon,
        components: zhCNComponents,
        pages: zhCNPages,
      },
      'en-US': {
        common: enUSCommon,
        components: enUSComponents,
        pages: enUSPages,
      },
    },
  });

export default i18n;
