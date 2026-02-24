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
import zhCNUi from './locales/zh-CN/ui.json';
import zhCNOnboarding from './locales/zh-CN/onboarding.json';
import zhCNClaude from './locales/zh-CN/claude.json';

import enUSCommon from './locales/en-US/common.json';
import enUSComponents from './locales/en-US/components.json';
import enUSPages from './locales/en-US/pages.json';
import enUSUi from './locales/en-US/ui.json';
import enUSOnboarding from './locales/en-US/onboarding.json';
import enUSClaude from './locales/en-US/claude.json';

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
        ui: zhCNUi,
        onboarding: zhCNOnboarding,
        claude: zhCNClaude,
      },
      'en-US': {
        common: enUSCommon,
        components: enUSComponents,
        pages: enUSPages,
        ui: enUSUi,
        onboarding: enUSOnboarding,
        claude: enUSClaude,
      },
    },
  });

export default i18n;
