import fs from 'node:fs';
import path from 'node:path';

import {
  DEFAULT_STORE_CONFIG_PATH,
  projectRoot as defaultProjectRoot,
  validateStorePackageConfig,
} from './store-package-config.js';

function resolveStoreConfigPath(projectRoot) {
  const configuredPath = String(process.env.HAGICODE_STORE_CONFIG_PATH || '').trim();
  if (!configuredPath) {
    return DEFAULT_STORE_CONFIG_PATH;
  }

  return path.isAbsolute(configuredPath) ? configuredPath : path.resolve(projectRoot, configuredPath);
}

function readJsonFile(targetPath) {
  return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
}

function readStoreConfig(projectRoot = defaultProjectRoot) {
  const storeConfigPath = resolveStoreConfigPath(projectRoot);
  const storeConfig = validateStorePackageConfig(readJsonFile(storeConfigPath));

  return {
    storeConfig,
    storeConfigPath,
  };
}

function readStoreOverlay(projectRoot = defaultProjectRoot) {
  const overlayPath = String(process.env.HAGICODE_STORE_FORGE_CONFIG || '').trim();
  if (!overlayPath) {
    return {
      overlayConfig: null,
      overlayPath: null,
    };
  }

  const resolvedOverlayPath = path.isAbsolute(overlayPath) ? overlayPath : path.resolve(projectRoot, overlayPath);

  return {
    overlayConfig: readJsonFile(resolvedOverlayPath),
    overlayPath: resolvedOverlayPath,
  };
}

function mergeStoreConfig(baseStoreConfig, overlayConfig) {
  if (!overlayConfig || typeof overlayConfig !== 'object') {
    return baseStoreConfig;
  }

  return {
    ...baseStoreConfig,
    packageIdentity: {
      ...baseStoreConfig.packageIdentity,
      ...(overlayConfig.packageIdentity && typeof overlayConfig.packageIdentity === 'object'
        ? overlayConfig.packageIdentity
        : {}),
    },
    msix: {
      ...baseStoreConfig.msix,
      ...(overlayConfig.msix && typeof overlayConfig.msix === 'object' ? overlayConfig.msix : {}),
    },
  };
}

export function loadEffectiveStoreConfig(projectRoot = defaultProjectRoot) {
  const { storeConfig: baseStoreConfig, storeConfigPath } = readStoreConfig(projectRoot);
  const { overlayConfig, overlayPath } = readStoreOverlay(projectRoot);

  return {
    storeConfig: mergeStoreConfig(baseStoreConfig, overlayConfig),
    storeConfigPath,
    overlayConfig,
    overlayPath,
  };
}

export function normalizeWindowsVersion(version) {
  const normalizedVersion = String(version || '0.0.0').trim().replace(/\+.*/, '');
  const [coreVersion, prereleaseVersion = ''] = normalizedVersion.split('-', 2);
  const normalizedParts = coreVersion
    .split('.')
    .filter(Boolean)
    .slice(0, 4)
    .map((part) => {
      const numericPart = part.replace(/[^0-9]/g, '');
      return numericPart || '0';
    });

  while (normalizedParts.length < 3) {
    normalizedParts.push('0');
  }

  if (normalizedParts.length >= 4) {
    return normalizedParts.slice(0, 4).join('.');
  }

  const prereleaseNumberMatch = /(?:^|\.)(\d+)(?:$|\.)/.exec(prereleaseVersion);
  normalizedParts.push(prereleaseNumberMatch ? prereleaseNumberMatch[1] : '0');

  return normalizedParts.join('.');
}

export function mapNodeArchToMsixArch(arch) {
  switch (String(arch || '').trim().toLowerCase()) {
    case 'x64':
    case 'arm64':
    case 'x86':
    case 'arm':
      return arch;
    case 'ia32':
      return 'x86';
    default:
      return 'x64';
  }
}

export function getMsixPaths(projectRoot = defaultProjectRoot) {
  const { storeConfig } = loadEffectiveStoreConfig(projectRoot);

  return {
    manifestTemplatePath: path.join(projectRoot, 'resources', 'msix', 'Package.appxmanifest.template.xml'),
    manifestOutputPath: path.join(projectRoot, '.cache', 'msix', 'Package.appxmanifest'),
    defaultAssetsPath: path.join(projectRoot, 'node_modules', 'electron-windows-msix', 'static', 'assets'),
    customAssetsPath: path.resolve(projectRoot, storeConfig.assetsDirectory),
    generatedAssetsPath: path.join(projectRoot, '.cache', 'msix-assets'),
  };
}

function resolvePath(projectRoot, candidatePath) {
  if (!candidatePath) {
    return '';
  }

  return path.isAbsolute(candidatePath) ? candidatePath : path.join(projectRoot, candidatePath);
}

export function resolveMsixSigningConfig(projectRoot = defaultProjectRoot) {
  const certificatePathFromEnv = String(
    process.env.WINDOWS_CERTIFICATE_FILE || process.env.MSIX_CERTIFICATE_FILE || ''
  ).trim();
  const certificatePassword = String(
    process.env.WINDOWS_CERTIFICATE_PASSWORD || process.env.MSIX_CERTIFICATE_PASSWORD || ''
  ).trim();
  const defaultCertificatePath = path.join(projectRoot, 'devcert.pfx');
  const certificateFile = resolvePath(projectRoot, certificatePathFromEnv)
    || (fs.existsSync(defaultCertificatePath) ? defaultCertificatePath : '');

  if (!certificateFile || !certificatePassword) {
    return {
      sign: false,
    };
  }

  return {
    sign: true,
    windowsSignOptions: {
      certificateFile,
      certificatePassword,
    },
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function resolveMsixManifestConfig({
  projectRoot = defaultProjectRoot,
  productName,
  description,
  version,
  arch,
}) {
  const { storeConfig, overlayConfig } = loadEffectiveStoreConfig(projectRoot);
  const msixConfig = storeConfig.msix;
  const buildVersion = String(process.env.WINDOWS_PACKAGE_VERSION || overlayConfig?.buildVersion || version || '').trim();
  const publisher = String(process.env.WINDOWS_PACKAGE_PUBLISHER || storeConfig.packageIdentity.publisher || '').trim();
  const packageIdentity = String(process.env.WINDOWS_PACKAGE_IDENTITY || storeConfig.packageIdentity.identityName || '').trim();
  const packageDisplayName = String(
    process.env.WINDOWS_PACKAGE_DISPLAY_NAME || storeConfig.packageIdentity.displayName || productName
  ).trim();
  const publisherDisplayName = String(
    process.env.WINDOWS_PACKAGE_PUBLISHER_DISPLAY_NAME || storeConfig.packageIdentity.publisherDisplayName || 'HagiCode'
  ).trim();
  const packageDescription = String(process.env.WINDOWS_PACKAGE_DESCRIPTION || description || productName).trim();
  const packageBackgroundColor = String(
    process.env.WINDOWS_PACKAGE_BACKGROUND_COLOR || storeConfig.packageIdentity.backgroundColor || 'transparent'
  ).trim();
  const packageMinOsVersion = String(
    process.env.WINDOWS_PACKAGE_MIN_VERSION || msixConfig.minVersion || '10.0.19041.0'
  ).trim();
  const packageMaxOsVersionTested = String(
    process.env.WINDOWS_PACKAGE_MAX_TESTED_VERSION || msixConfig.maxVersionTested || packageMinOsVersion
  ).trim();

  return {
    packageIdentity,
    packageDisplayName,
    packageDescription,
    packageVersion: normalizeWindowsVersion(buildVersion),
    publisher,
    publisherDisplayName,
    packageBackgroundColor,
    packageMinOsVersion,
    packageMaxOsVersionTested,
    processorArchitecture: mapNodeArchToMsixArch(arch),
    appExecutable: `${productName}.exe`,
    appDisplayName: packageDisplayName,
    languages: unique(storeConfig.packageIdentity.languages),
    capabilities: unique(['runFullTrust', ...storeConfig.msix.capabilities]),
  };
}
