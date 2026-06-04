#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getMsixPaths, resolveMsixManifestConfig } from './msix-config.js';
import { resolvePsfBuildConfig } from './psf-support.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const options = {
    platform: process.platform,
    arch: process.arch,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case '--platform':
        options.platform = String(argv[++index] || '').trim();
        break;
      case '--arch':
        options.arch = String(argv[++index] || '').trim();
        break;
      case '--help':
      case '-h':
        console.log(`Usage: node scripts/prepare-msix.js [options]

Options:
  --platform <name>   Target platform, defaults to current platform
  --arch <name>       Target architecture, defaults to current architecture
`);
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function copyMsixAssets(paths) {
  await fsp.rm(paths.generatedAssetsPath, { recursive: true, force: true });
  await fsp.mkdir(path.dirname(paths.generatedAssetsPath), { recursive: true });
  await fsp.cp(paths.defaultAssetsPath, paths.generatedAssetsPath, { recursive: true });

  if (fs.existsSync(paths.customAssetsPath)) {
    await fsp.cp(paths.customAssetsPath, paths.generatedAssetsPath, { recursive: true, force: true });
  }

  const requiredAssets = ['StoreLogo.png', 'Square44x44Logo.png', 'Square150x150Logo.png', 'Wide310x150Logo.png'];

  for (const assetName of requiredAssets) {
    const assetPath = path.join(paths.generatedAssetsPath, assetName);
    if (!fs.existsSync(assetPath)) {
      throw new Error(`Missing required MSIX asset after preparation: ${assetName}`);
    }
  }
}

function renderResourceTags(languages) {
  return languages
    .map((language) => `    <Resource Language="${escapeXml(language)}" />`)
    .join('\n');
}

function renderCapabilityTags(capabilities) {
  const restrictedCapabilities = new Set([
    'runFullTrust',
    'unvirtualizedResources',
  ]);

  return capabilities
    .map((capability) => restrictedCapabilities.has(capability)
      ? `    <rescap:Capability Name="${escapeXml(capability)}" />`
      : `    <Capability Name="${escapeXml(capability)}" />`)
    .join('\n');
}

export function renderMsixManifest(template, manifestConfig) {
  const replacements = {
    PACKAGE_IDENTITY: manifestConfig.packageIdentity,
    PROCESSOR_ARCHITECTURE: manifestConfig.processorArchitecture,
    PACKAGE_VERSION: manifestConfig.packageVersion,
    PUBLISHER: manifestConfig.publisher,
    PACKAGE_DISPLAY_NAME: manifestConfig.packageDisplayName,
    PUBLISHER_DISPLAY_NAME: manifestConfig.publisherDisplayName,
    PACKAGE_DESCRIPTION: manifestConfig.packageDescription,
    PACKAGE_MIN_OS_VERSION: manifestConfig.packageMinOsVersion,
    PACKAGE_MAX_OS_VERSION_TESTED: manifestConfig.packageMaxOsVersionTested,
    APP_EXECUTABLE: manifestConfig.appExecutable,
    APP_DISPLAY_NAME: manifestConfig.appDisplayName,
    PACKAGE_BACKGROUND_COLOR: manifestConfig.packageBackgroundColor,
    RESOURCE_TAGS: renderResourceTags(manifestConfig.languages),
    CAPABILITY_TAGS: renderCapabilityTags(manifestConfig.capabilities),
  };

  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, key) => {
    if (!(key in replacements)) {
      throw new Error(`Missing MSIX manifest replacement for ${key}`);
    }

    return replacements[key];
  });
}

export async function prepareMsixArtifacts({ arch, platform = 'win32' }) {
  if (platform !== 'win32') {
    return;
  }

  const packageJsonPath = path.join(projectRoot, 'package.json');
  const packageJson = JSON.parse(await fsp.readFile(packageJsonPath, 'utf8'));
  const paths = getMsixPaths(projectRoot);
  const manifestConfig = resolveMsixManifestConfig({
    projectRoot,
    productName: packageJson.productName || packageJson.name,
    description: packageJson.description || packageJson.productName || packageJson.name,
    version: packageJson.version,
    arch,
  });
  const psfConfig = resolvePsfBuildConfig(projectRoot, arch);
  const template = await fsp.readFile(paths.manifestTemplatePath, 'utf8');
  const manifest = renderMsixManifest(template, {
    ...manifestConfig,
    appExecutable: psfConfig.enabled ? psfConfig.launcherName : manifestConfig.appExecutable,
  });

  await copyMsixAssets(paths);
  await fsp.mkdir(path.dirname(paths.manifestOutputPath), { recursive: true });
  await fsp.writeFile(paths.manifestOutputPath, manifest);

  console.log(`[msix] prepared manifest ${path.relative(projectRoot, paths.manifestOutputPath)}`);
  console.log(`[msix] prepared assets ${path.relative(projectRoot, paths.generatedAssetsPath)}`);

  if (psfConfig.enabled) {
    console.log(`[psf] manifest entry redirected to ${psfConfig.launcherName}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  await prepareMsixArtifacts(options);
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(`[msix] ${error.message}`);
    process.exit(1);
  });
}
