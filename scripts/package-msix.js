#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';
import { load } from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const WINAPPCLI_VERSION = '0.3.1';
const WINDOWS_PACKAGE_PUBLISHER_ENV = 'WINDOWS_PACKAGE_PUBLISHER';
const REQUIRED_APPX_ASSETS = [
  'StoreLogo.png',
  'Square44x44Logo.png',
  'Square150x150Logo.png',
  'Wide310x150Logo.png',
];

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

function parseArgs(argv) {
  const options = {
    input: path.join(projectRoot, 'pkg', 'win-unpacked'),
    output: path.join(projectRoot, 'pkg'),
    stage: path.join(projectRoot, 'build', 'msix-stage'),
    assets: path.join(projectRoot, 'resources', 'appx'),
    verbose: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--input':
        options.input = path.resolve(projectRoot, argv[++index]);
        break;
      case '--output':
        options.output = path.resolve(projectRoot, argv[++index]);
        break;
      case '--stage':
        options.stage = path.resolve(projectRoot, argv[++index]);
        break;
      case '--assets':
        options.assets = path.resolve(projectRoot, argv[++index]);
        break;
      case '--verbose':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        console.log(`Usage: node scripts/package-msix.js [options]

Options:
  --input <dir>   Source Windows unpacked app directory (default: pkg/win-unpacked)
  --output <dir>  Output directory for the MSIX package (default: pkg)
  --stage <dir>   Temporary staging directory (default: build/msix-stage)
  --assets <dir>  AppX/MSIX asset directory (default: resources/appx)
  --verbose       Print verbose winapp CLI output
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

function toWindowsArch(nodeArch) {
  switch (nodeArch) {
    case 'x64':
      return 'x64';
    case 'arm64':
      return 'arm64';
    case 'ia32':
      return 'x86';
    default:
      throw new Error(`Unsupported Windows architecture for MSIX packaging: ${nodeArch}`);
  }
}

function sanitizeArtifactNameSegment(value) {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function resolveWindowsPackagePublisher(defaultPublisher) {
  const override = String(process.env[WINDOWS_PACKAGE_PUBLISHER_ENV] || '').trim();
  if (!override) {
    return defaultPublisher;
  }

  console.log(`[msix] using appx.publisher override from ${WINDOWS_PACKAGE_PUBLISHER_ENV}`);
  return override;
}

function normalizeApplicationId(value) {
  const raw = String(value || '')
    .split('.')
    .map((segment) => segment.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean)
    .map((segment) => {
      if (/^[A-Za-z]/.test(segment)) {
        return segment;
      }
      return `H${segment}`;
    });

  if (raw.length === 0) {
    return 'HagicodeDesktop';
  }

  return raw.join('.');
}

export function resolveProducedMsixFileName({ desiredFileName, packageVersion, arch, fileNames }) {
  const desiredBaseName = path.basename(desiredFileName);
  const desiredStem = desiredBaseName.replace(/\.msix$/i, '');
  const candidates = Array.isArray(fileNames) ? fileNames.filter(Boolean) : [];
  const expectedNames = new Set([
    desiredBaseName,
    `${desiredBaseName}_${packageVersion}_${arch}.msix`,
    `${desiredStem}_${packageVersion}_${arch}.msix`,
  ]);

  return candidates.find((fileName) => expectedNames.has(fileName)) || null;
}


function renderCapabilities(capabilities) {
  const tags = [];
  for (const capability of capabilities) {
    if (capability === 'runFullTrust') {
      tags.push(`    <rescap:Capability Name="${escapeXml(capability)}" />`);
      continue;
    }

    tags.push(`    <Capability Name="${escapeXml(capability)}" />`);
  }

  return tags.join('\n');
}

export function renderMsixManifest({
  identityName,
  publisher,
  version,
  arch,
  displayName,
  publisherDisplayName,
  description,
  executable,
  applicationId,
  backgroundColor,
  languages,
  capabilities,
  minVersion,
  maxVersionTested,
}) {
  const resourceTags = languages.map((language) => `    <Resource Language="${escapeXml(language)}" />`).join('\n');
  const capabilityTags = renderCapabilities(capabilities);

  return `<?xml version="1.0" encoding="utf-8"?>
<Package
  xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap rescap">
  <Identity Name="${escapeXml(identityName)}" Publisher="${escapeXml(publisher)}" Version="${escapeXml(version)}" ProcessorArchitecture="${escapeXml(arch)}" />
  <Properties>
    <DisplayName>${escapeXml(displayName)}</DisplayName>
    <PublisherDisplayName>${escapeXml(publisherDisplayName)}</PublisherDisplayName>
    <Description>${escapeXml(description)}</Description>
    <Logo>Assets\\StoreLogo.png</Logo>
  </Properties>
  <Resources>
${resourceTags}
  </Resources>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="${escapeXml(minVersion)}" MaxVersionTested="${escapeXml(maxVersionTested)}" />
  </Dependencies>
  <Capabilities>
${capabilityTags}
  </Capabilities>
  <Applications>
    <Application Id="${escapeXml(applicationId)}" Executable="${escapeXml(executable)}" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements
        DisplayName="${escapeXml(displayName)}"
        Description="${escapeXml(description)}"
        BackgroundColor="${escapeXml(backgroundColor)}"
        Square150x150Logo="Assets\\Square150x150Logo.png"
        Square44x44Logo="Assets\\Square44x44Logo.png">
        <uap:DefaultTile Wide310x150Logo="Assets\\Wide310x150Logo.png" />
      </uap:VisualElements>
    </Application>
  </Applications>
</Package>
`;
}

async function ensureRequiredFilesExist(paths) {
  for (const targetPath of paths) {
    try {
      await fsp.access(targetPath, fs.constants.R_OK);
    } catch {
      throw new Error(`Required file or directory is missing: ${targetPath}`);
    }
  }
}

async function resolveExecutableName(inputDir, productName) {
  const preferredPath = path.join(inputDir, `${productName}.exe`);
  if (fs.existsSync(preferredPath)) {
    return path.basename(preferredPath);
  }

  const rootEntries = await fsp.readdir(inputDir, { withFileTypes: true });
  const exeNames = rootEntries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.exe'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  if (exeNames.length === 1) {
    return exeNames[0];
  }

  throw new Error(`Unable to determine the packaged desktop executable in ${inputDir}`);
}

async function copyAssets(sourceAssetsDir, targetAssetsDir) {
  await fsp.mkdir(targetAssetsDir, { recursive: true });
  for (const fileName of REQUIRED_APPX_ASSETS) {
    await fsp.copyFile(path.join(sourceAssetsDir, fileName), path.join(targetAssetsDir, fileName));
  }
}

async function loadProjectMetadata() {
  const [packageJsonContent, builderConfigContent] = await Promise.all([
    fsp.readFile(path.join(projectRoot, 'package.json'), 'utf8'),
    fsp.readFile(path.join(projectRoot, 'electron-builder.yml'), 'utf8'),
  ]);

  return {
    packageJson: JSON.parse(packageJsonContent),
    builderConfig: load(builderConfigContent),
  };
}

export async function packageMsix(rawOptions = {}) {
  if (process.platform !== 'win32') {
    throw new Error('MSIX packaging requires a Windows host because winapp CLI is published only for win32.');
  }

  const options = {
    ...parseArgs([]),
    ...rawOptions,
  };

  await ensureRequiredFilesExist([options.input, options.assets]);

  const { packageJson, builderConfig } = await loadProjectMetadata();
  const appxConfig = builderConfig.appx || {};
  const productName = builderConfig.productName || packageJson.productName || packageJson.name;
  const executable = await resolveExecutableName(options.input, productName);
  const version = toWindowsPackageVersion(packageJson.version);
  const arch = toWindowsArch(process.arch);
  const identityName = appxConfig.identityName || builderConfig.appId || packageJson.name;
  const publisher = resolveWindowsPackagePublisher(appxConfig.publisher);

  if (!publisher) {
    throw new Error('electron-builder appx.publisher is required for MSIX packaging.');
  }

  const publisherDisplayName = appxConfig.publisherDisplayName || packageJson.author?.name || 'HagiCode';
  const description = packageJson.description || productName;
  const languages = Array.isArray(appxConfig.languages) && appxConfig.languages.length > 0 ? appxConfig.languages : ['en-US'];
  const capabilitySet = new Set(Array.isArray(appxConfig.capabilities) ? appxConfig.capabilities : []);
  capabilitySet.add('runFullTrust');

  await fsp.rm(options.stage, { recursive: true, force: true });
  await fsp.mkdir(options.stage, { recursive: true });

  const stageAppDir = path.join(options.stage, 'app');
  await fsp.cp(options.input, stageAppDir, { recursive: true });
  await copyAssets(options.assets, path.join(stageAppDir, 'Assets'));

  const manifestPath = path.join(stageAppDir, 'Package.appxmanifest');
  const manifestContent = renderMsixManifest({
    identityName,
    publisher,
    version,
    arch,
    displayName: appxConfig.displayName || productName,
    publisherDisplayName,
    description,
    executable,
    applicationId: normalizeApplicationId(identityName),
    backgroundColor: appxConfig.backgroundColor || 'transparent',
    languages,
    capabilities: [...capabilitySet],
    minVersion: appxConfig.minVersion || '10.0.19041.0',
    maxVersionTested: appxConfig.maxVersionTested || appxConfig.minVersion || '10.0.19041.0',
  });
  await fsp.writeFile(manifestPath, manifestContent, 'utf8');

  await fsp.mkdir(options.output, { recursive: true });
  const artifactBaseName = sanitizeArtifactNameSegment(productName) || 'hagicode-desktop';
  const msixFileName = `${artifactBaseName}-${packageJson.version}-${arch}.msix`;
  const artifactPath = path.join(options.output, msixFileName);

  if (fs.existsSync(artifactPath)) {
    await fsp.rm(artifactPath, { force: true });
  }

  const packageArgs = [
    '--yes',
    `@microsoft/winappcli@${WINAPPCLI_VERSION}`,
    'package',
    stageAppDir,
    '--manifest',
    manifestPath,
    '--output',
    options.output,
    '--name',
    msixFileName,
    '--executable',
    executable,
  ];

  if (options.verbose) {
    packageArgs.push('--verbose');
  }

  const existingMsixFileNames = new Set(
    (await fsp.readdir(options.output, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.msix'))
      .map((entry) => entry.name),
  );

  await execa('npx', packageArgs, {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  let resolvedArtifactPath = artifactPath;
  if (!fs.existsSync(resolvedArtifactPath)) {
    const outputEntries = await fsp.readdir(options.output, { withFileTypes: true });
    const candidateFileNames = outputEntries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.msix'))
      .map((entry) => entry.name)
      .filter((fileName) => !existingMsixFileNames.has(fileName));

    const producedFileName = resolveProducedMsixFileName({
      desiredFileName: msixFileName,
      packageVersion: version,
      arch,
      fileNames: candidateFileNames,
    });

    if (!producedFileName) {
      throw new Error(`MSIX packaging completed without producing the expected artifact: ${artifactPath}`);
    }

    const producedArtifactPath = path.join(options.output, producedFileName);
    if (producedArtifactPath !== artifactPath) {
      if (fs.existsSync(artifactPath)) {
        await fsp.rm(artifactPath, { force: true });
      }
      await fsp.rename(producedArtifactPath, artifactPath);
    }

    resolvedArtifactPath = artifactPath;
  }

  return {
    artifactPath: resolvedArtifactPath,
    executable,
    manifestPath,
    stageAppDir,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await packageMsix(options);
  console.log(`[msix] packaged ${path.relative(projectRoot, result.artifactPath)}`);
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error(`[msix] ${error.message}`);
    process.exit(1);
  });
}
