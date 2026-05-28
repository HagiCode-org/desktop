#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const projectRoot = path.resolve(__dirname, '..');
export const DEFAULT_STORE_CONFIG_PATH = path.join(projectRoot, 'config', 'store-package.json');

export const REQUIRED_SERVER_PAYLOAD_PATHS = [
  'manifest.json',
  'config',
  path.join('lib', 'PCode.Web.dll'),
  path.join('lib', 'PCode.Web.runtimeconfig.json'),
  path.join('lib', 'PCode.Web.deps.json'),
];

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  return value;
}

function requireNonEmptyString(value, label) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return normalized;
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') {
    throw new Error(`${label} must be a boolean.`);
  }

  return value;
}

function requireNonEmptyArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }

  return value;
}

function normalizeRelativePath(value, label) {
  const relativePath = requireNonEmptyString(value, label);
  return relativePath.replaceAll('\\', '/');
}

function normalizeStringArray(value, label) {
  return requireNonEmptyArray(value, label).map((entry, index) => requireNonEmptyString(entry, `${label}[${index}]`));
}

function yamlScalar(value) {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  const normalized = String(value);
  if (
    normalized.length === 0 ||
    normalized.startsWith('!') ||
    normalized.startsWith('&') ||
    normalized.startsWith('*') ||
    normalized.startsWith('[') ||
    normalized.startsWith('{') ||
    normalized.startsWith('#') ||
    normalized.startsWith('|') ||
    normalized.startsWith('>') ||
    /^[-?:](?:\s|$)/.test(normalized) ||
    /^\s|\s$/.test(normalized)
  ) {
    return JSON.stringify(normalized);
  }

  return normalized;
}

function renderYamlList(key, values, indent = '    ') {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }

  return [
    `  ${key}:`,
    ...values.map((value) => `${indent}- ${yamlScalar(value)}`),
  ];
}

export function toWindowsPackageVersion(version) {
  const normalized = String(version || '').trim();
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(normalized);
  if (!match) {
    throw new Error(`Unsupported package version for MSIX packaging: ${version}`);
  }

  const prerelease = match[4] || '';
  const prereleaseNumberMatch = /(?:^|\.)(\d+)(?:$|\.)/.exec(prerelease);
  const revision = prereleaseNumberMatch ? Number.parseInt(prereleaseNumberMatch[1], 10) : 0;
  return `${match[1]}.${match[2]}.${match[3]}.${revision}`;
}

export function validateStorePackageConfig(config) {
  requireObject(config, 'storePackageConfig');
  const packageIdentity = requireObject(config.packageIdentity, 'storePackageConfig.packageIdentity');
  const appx = requireObject(config.appx, 'storePackageConfig.appx');

  return {
    schemaVersion: Number(config.schemaVersion || 1),
    sourceElectronBuilderConfigPath: normalizeRelativePath(
      config.sourceElectronBuilderConfigPath,
      'storePackageConfig.sourceElectronBuilderConfigPath'
    ),
    inputDirectory: normalizeRelativePath(config.inputDirectory, 'storePackageConfig.inputDirectory'),
    outputDirectory: normalizeRelativePath(config.outputDirectory, 'storePackageConfig.outputDirectory'),
    stageDirectory: normalizeRelativePath(config.stageDirectory, 'storePackageConfig.stageDirectory'),
    assetsDirectory: normalizeRelativePath(config.assetsDirectory, 'storePackageConfig.assetsDirectory'),
    metadataOutputPath: normalizeRelativePath(config.metadataOutputPath, 'storePackageConfig.metadataOutputPath'),
    runtimeInjectionPath: normalizeRelativePath(
      config.runtimeInjectionPath,
      'storePackageConfig.runtimeInjectionPath'
    ),
    packageIdentity: {
      displayName: requireNonEmptyString(packageIdentity.displayName, 'storePackageConfig.packageIdentity.displayName'),
      publisherDisplayName: requireNonEmptyString(
        packageIdentity.publisherDisplayName,
        'storePackageConfig.packageIdentity.publisherDisplayName'
      ),
      publisher: requireNonEmptyString(packageIdentity.publisher, 'storePackageConfig.packageIdentity.publisher'),
      identityName: requireNonEmptyString(packageIdentity.identityName, 'storePackageConfig.packageIdentity.identityName'),
      backgroundColor: requireNonEmptyString(
        packageIdentity.backgroundColor,
        'storePackageConfig.packageIdentity.backgroundColor'
      ),
      languages: normalizeStringArray(packageIdentity.languages, 'storePackageConfig.packageIdentity.languages'),
      addAutoLaunchExtension: requireBoolean(
        packageIdentity.addAutoLaunchExtension,
        'storePackageConfig.packageIdentity.addAutoLaunchExtension'
      ),
    },
    appx: {
      minVersion: requireNonEmptyString(appx.minVersion, 'storePackageConfig.appx.minVersion'),
      maxVersionTested: requireNonEmptyString(
        appx.maxVersionTested,
        'storePackageConfig.appx.maxVersionTested'
      ),
      capabilities: normalizeStringArray(appx.capabilities, 'storePackageConfig.appx.capabilities'),
    },
  };
}

export async function loadStorePackageConfig(storeConfigPath = DEFAULT_STORE_CONFIG_PATH) {
  const resolvedConfigPath = path.isAbsolute(storeConfigPath)
    ? storeConfigPath
    : path.resolve(projectRoot, storeConfigPath);
  const rawConfig = JSON.parse(await fsp.readFile(resolvedConfigPath, 'utf8'));
  const storeConfig = validateStorePackageConfig(rawConfig);

  return {
    storeConfig,
    storeConfigPath: resolvedConfigPath,
    relativeStoreConfigPath: path.relative(projectRoot, resolvedConfigPath).replaceAll(path.sep, '/'),
  };
}

export function renderStoreElectronBuilderConfig({
  sourceConfigPath,
  storeConfig,
  buildVersion,
  publisherOverride = null,
}) {
  const packageJsonVersion = String(buildVersion).split('.').slice(0, 3).join('.');
  const lines = [
    `extends: ${yamlScalar(sourceConfigPath)}`,
    `buildVersion: ${yamlScalar(buildVersion)}`,
    'extraMetadata:',
    `  version: ${yamlScalar(packageJsonVersion)}`,
    'appx:',
    '  artifactName: ${productName} ${version}.appx',
    `  displayName: ${yamlScalar(storeConfig.packageIdentity.displayName)}`,
    `  publisherDisplayName: ${yamlScalar(storeConfig.packageIdentity.publisherDisplayName)}`,
    `  publisher: ${yamlScalar(publisherOverride ?? storeConfig.packageIdentity.publisher)}`,
    `  identityName: ${yamlScalar(storeConfig.packageIdentity.identityName)}`,
    `  backgroundColor: ${yamlScalar(storeConfig.packageIdentity.backgroundColor)}`,
    ...renderYamlList('languages', storeConfig.packageIdentity.languages),
    `  addAutoLaunchExtension: ${yamlScalar(storeConfig.packageIdentity.addAutoLaunchExtension)}`,
    ...renderYamlList('capabilities', storeConfig.appx.capabilities),
    `  minVersion: ${yamlScalar(storeConfig.appx.minVersion)}`,
    `  maxVersionTested: ${yamlScalar(storeConfig.appx.maxVersionTested)}`,
  ];

  return `${lines.join('\n')}\n`;
}

export async function writeStoreElectronBuilderConfig({
  storeConfigPath = DEFAULT_STORE_CONFIG_PATH,
  outputPath,
  buildVersion,
  publisherOverride = null,
}) {
  const { storeConfig, storeConfigPath: resolvedStoreConfigPath } = await loadStorePackageConfig(storeConfigPath);
  const sourceConfigPath = path.resolve(projectRoot, storeConfig.sourceElectronBuilderConfigPath);
  const resolvedOutputPath = path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(projectRoot, outputPath);

  if (!fs.existsSync(sourceConfigPath)) {
    throw new Error(`Desktop electron-builder config does not exist: ${sourceConfigPath}`);
  }

  const relativeSourceConfigPath = path.relative(path.dirname(resolvedOutputPath), sourceConfigPath).replaceAll(path.sep, '/');
  await fsp.mkdir(path.dirname(resolvedOutputPath), { recursive: true });
  await fsp.writeFile(
    resolvedOutputPath,
    renderStoreElectronBuilderConfig({
      sourceConfigPath: relativeSourceConfigPath || path.basename(sourceConfigPath),
      storeConfig,
      buildVersion,
      publisherOverride,
    }),
    'utf8'
  );

  return {
    outputPath: resolvedOutputPath,
    sourceConfigPath,
    storeConfigPath: resolvedStoreConfigPath,
    storeConfig,
    buildVersion,
  };
}

async function findFirstMatchingDirectory(rootDirectory, matcher) {
  const entries = await fsp.readdir(rootDirectory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const candidatePath = path.join(rootDirectory, entry.name);
    if (await matcher(candidatePath)) {
      return candidatePath;
    }

    const nestedMatch = await findFirstMatchingDirectory(candidatePath, matcher);
    if (nestedMatch) {
      return nestedMatch;
    }
  }

  return null;
}

export async function resolveRuntimeRoot(payloadPath) {
  const resolvedPayloadPath = path.resolve(payloadPath);
  const stats = await fsp.stat(resolvedPayloadPath).catch(() => null);
  if (!stats) {
    throw new Error(`Server payload path does not exist: ${resolvedPayloadPath}`);
  }

  if (!stats.isDirectory()) {
    throw new Error(`Server payload path must be a directory: ${resolvedPayloadPath}`);
  }

  const directManifestPath = path.join(resolvedPayloadPath, 'manifest.json');
  const directDllPath = path.join(resolvedPayloadPath, 'lib', 'PCode.Web.dll');
  if (fs.existsSync(directManifestPath) || fs.existsSync(directDllPath)) {
    return resolvedPayloadPath;
  }

  const nestedRuntimeRoot = await findFirstMatchingDirectory(resolvedPayloadPath, async (candidatePath) => {
    return fs.existsSync(path.join(candidatePath, 'manifest.json')) || fs.existsSync(path.join(candidatePath, 'lib', 'PCode.Web.dll'));
  });

  if (!nestedRuntimeRoot) {
    throw new Error(`Unable to find a server runtime under ${resolvedPayloadPath}`);
  }

  return nestedRuntimeRoot;
}

export async function validateServerPayloadRoot(runtimeRoot, platformId = 'win-x64') {
  const missingPaths = [];
  for (const requiredRelativePath of REQUIRED_SERVER_PAYLOAD_PATHS) {
    if (!fs.existsSync(path.join(runtimeRoot, requiredRelativePath))) {
      missingPaths.push(requiredRelativePath.replaceAll(path.sep, '/'));
    }
  }

  if (missingPaths.length > 0) {
    throw new Error(
      `Server payload for ${platformId} is incomplete under ${runtimeRoot}. Missing: ${missingPaths.join(', ')}`
    );
  }

  return {
    runtimeRoot,
    requiredPaths: REQUIRED_SERVER_PAYLOAD_PATHS.map((entry) => entry.replaceAll(path.sep, '/')),
  };
}

export async function resolveDesktopSourceRef(cwd = projectRoot) {
  try {
    const result = await execa('git', ['rev-parse', 'HEAD'], {
      cwd,
      stdio: 'pipe',
      reject: false,
    });
    return result.exitCode === 0 ? result.stdout.trim() : null;
  } catch {
    return null;
  }
}
