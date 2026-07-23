import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getMsixPaths,
  resolveMsixSigningConfig,
} from './scripts/msix-config.js';

import {
  restoreForgePackagingResources,
  stageForgePackagingResources,
} from './scripts/forge-packaging-hooks.js';
import { injectPsfIntoPackagedOutputs } from './scripts/psf-support.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const packageWindowsStoreVersion = String(
  packageJson.hagicodeDesktop?.windowsStoreVersion || ''
).trim();
const configuredWindowsStoreVersion = String(
  process.env.HAGICODE_WINDOWS_STORE_VERSION || packageWindowsStoreVersion
).trim();
const hagicodeDesktopMetadata = configuredWindowsStoreVersion
  ? {
      ...(typeof packageJson.hagicodeDesktop === 'object' && packageJson.hagicodeDesktop
        ? packageJson.hagicodeDesktop
        : {}),
      windowsStoreVersion: configuredWindowsStoreVersion,
    }
  : (typeof packageJson.hagicodeDesktop === 'object' && packageJson.hagicodeDesktop
      ? packageJson.hagicodeDesktop
      : undefined);
const productName = packageJson.productName || packageJson.name;
const appId = 'com.newbe36524.hagicode';
const iconBasePath = path.join(__dirname, 'resources', 'icon');
const pngIconPath = path.join(__dirname, 'resources', 'icon.png');
const icnsIconPath = path.join(__dirname, 'resources', 'icon.icns');
const windowsKitPath = String(process.env.WINDOWS_KIT_PATH || '').trim();
const windowsKitVersion = String(process.env.WINDOWS_KIT_VERSION || '').trim();
const { generatedAssetsPath: msixAssetsPath, manifestOutputPath: msixManifestPath } = getMsixPaths(__dirname);
const msixSigningConfig = resolveMsixSigningConfig(__dirname);

function resolveMacSignConfig() {
  if (String(process.env.HAGICODE_ENABLE_MAC_SIGNING || '').trim() !== 'true') {
    return undefined;
  }

  const identity = String(process.env.CSC_NAME || '').trim();

  return {
    hardenedRuntime: true,
    gatekeeperAssess: false,
    ignore: filePath => filePath.includes('/Contents/Resources/extra/runtime'),
    ...(identity ? { identity } : {}),
  };
}

function resolveMacNotarizeConfig() {
  if (String(process.env.HAGICODE_ENABLE_MAC_SIGNING || '').trim() !== 'true') {
    return undefined;
  }

  const appleApiKey = String(process.env.APPLE_API_KEY_PATH || process.env.HAGICODE_APPLE_API_KEY_PATH || '').trim();
  const appleApiKeyId = String(process.env.APPLE_API_KEY_ID || '').trim();
  const appleApiIssuer = String(process.env.APPLE_API_ISSUER || '').trim();

  if (appleApiKey && appleApiKeyId && appleApiIssuer) {
    return {
      appleApiKey,
      appleApiKeyId,
      appleApiIssuer,
    };
  }

  const appleId = String(process.env.APPLE_ID || '').trim();
  const appleIdPassword = String(process.env.APPLE_APP_SPECIFIC_PASSWORD || '').trim();
  const teamId = String(process.env.APPLE_TEAM_ID || '').trim();

  if (appleId && appleIdPassword && teamId) {
    return {
      appleId,
      appleIdPassword,
      teamId,
    };
  }

  return undefined;
}

const macSignConfig = resolveMacSignConfig();
const macNotarizeConfig = resolveMacNotarizeConfig();

export default {
  hooks: {
    async prePackage(_forgeConfig, platform, arch) {
      if (platform !== 'win32') {
        return;
      }

      const { prepareMsixArtifacts } = await import('./scripts/prepare-msix.js');
      await prepareMsixArtifacts({ platform, arch });
    },
    async postPackage(_forgeConfig, packageResult) {
      await injectPsfIntoPackagedOutputs(__dirname, packageResult);
    },
  },
  packagerConfig: {
    asar: true,
    prune: true,
    ...(hagicodeDesktopMetadata ? { extraMetadata: { hagicodeDesktop: hagicodeDesktopMetadata } } : {}),
    appBundleId: appId,
    appCategoryType: 'public.app-category.utilities',
    executableName: productName,
    icon: iconBasePath,
    extraResource: [pngIconPath],
    ignore: [
      /^\/\.cache\//,
      /^\/\.codex$/,
      /^\/\.generated-hagiscript-runtime-manifest\.json$/,
      /^\/\.github\//,
      /^\/\.git\//,
      /^\/\.gitignore$/,
      /^\/\.impeccable\//,
      /^\/build\//,
      /^\/config\//,
      /^\/docs\//,
      /^\/out\//,
      /^\/pkg\//,
      /^\/unsigned-artifacts\//,
      /^\/src\//,
      /^\/README(?:_cn)?\.md$/,
      /^\/AGENTS\.md$/,
      /^\/CLAUDE\.md$/,
      /^\/DESIGN\.md$/,
      /^\/PRODUCT\.md$/,
      /^\/Directory\.Build\.props$/,
      /^\/build\.(?:cmd|ps1|sh)$/,
      /^\/tailwind\.config\.js$/,
      /^\/vite(?:\.preload\.config\.ts|\.config\.mjs)$/,
      /^\/tsconfig(?:\.json|\.node\.json|\.preload\.json)$/,
      /^\/components\.json$/,
      /^\/hagi18n\.yaml$/,
      /^\/resources\/bin($|\/)/,
      /^\/resources\/components($|\/)/,
      /^\/resources\/toolchain($|\/)/,
      /^\/resources\/portable-fixed\/current($|\/)/,
      /^\/scripts\/__tests__($|\/)/,
      /^\/scripts\/(?:build-macos|build-store-package(?:\.test)?|bump-version|bundled-toolchain-contract|check-ts-import-extensions|ci-build|desktop-runtime-hagiscript|desktop-runtime-layout|dev-with-embedded-runtime|dev-with-portable-runtime|download-workflow-artifact|embedded-node-runtime-config(?:\.test)?|embedded-runtime-config|forge-packaging-hooks|generate-about-snapshot|generate-i18n-resources|global-hagiscript|msix-config|non-interactive-integration-test|package-msix|prepare-bundled-toolchain-if-supported|prepare-bundled-toolchain|prepare-embedded-runtime|prepare-msix|prepare-runtime-if-supported|preserve-artifacts|run-electron-app|run-electron-forge|runtime-manifest-store(?:\.test)?|runtime-node-policy(?:\.test)?|runtime-phase-timing|smoke-test|store-package-config|verify-linux-unpacked-package|verify-native-libs|verify-release-archives(?:\.test)?|verify-signature|wait-for-dev-ready)\.(?:js|mjs|d\.ts)$/,
      /^\/src\/renderer\/test-utils($|\/)/,
      /\/__tests__\//,
      /\.test\.[cm]?[jt]s$/,
      /\.spec\.[cm]?[jt]s$/,
      /\.pfx$/i,
      /\.pdb$/i,
      /\.msix$/i,
      /\.map$/,
    ],
    afterCopyExtraResources: [stageForgePackagingResources],
    afterComplete: [restoreForgePackagingResources],
    win32metadata: {
      CompanyName: 'HagiCode',
      FileDescription: productName,
      ProductName: productName,
      InternalName: productName,
      'requested-execution-level': 'asInvoker',
    },
    ...(macSignConfig ? { osxSign: macSignConfig } : {}),
    ...(macNotarizeConfig ? { osxNotarize: macNotarizeConfig } : {}),
  },
  makers: [
    {
      name: '@reforged/maker-appimage',
      platforms: ['linux'],
      config: {
        options: {
          name: 'hagicode-desktop',
          bin: productName,
          productName,
          categories: ['Utility'],
          icon: pngIconPath,
        },
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['linux', 'darwin'],
      config: {},
    },
    {
      name: '@electron-addons/electron-forge-maker-nsis',
      platforms: ['win32'],
      config: {},
    },
    {
      name: '@rabbitholesyndrome/electron-forge-maker-portable',
      platforms: ['win32'],
      config: {
        appId,
      },
    },
    {
      name: '@electron-forge/maker-msix',
      platforms: ['win32'],
      config: {
        appManifest: msixManifestPath,
        packageAssets: msixAssetsPath,
        logLevel: 'warn',
        ...(windowsKitPath ? { windowsKitPath } : {}),
        ...(windowsKitVersion ? { windowsKitVersion } : {}),
        ...msixSigningConfig,
      },
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        icon: icnsIconPath,
      },
    },
  ],
};
