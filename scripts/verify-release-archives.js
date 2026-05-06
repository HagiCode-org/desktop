#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { detectNodeRuntimePlatform } from './embedded-node-runtime-config.js';
import {
  readToolchainManifest,
  validateToolchainManifest,
  validateToolchainPayload,
} from './bundled-toolchain-contract.js';
import {
  detectCodeServerRuntimePlatform,
  readCodeServerRuntimeConfig,
  validateCodeServerRuntimePayload,
} from './code-server-runtime-contract.js';
import {
  detectOmniRouteRuntimePlatform,
  readOmniRouteRuntimeConfig,
  validateOmniRouteRuntimePayload,
} from './omniroute-runtime-contract.js';

const args = process.argv.slice(2);
const archives = [];
const fallbackPlatform = process.env.HAGICODE_EMBEDDED_NODE_PLATFORM || detectNodeRuntimePlatform();
const codeServerPlatform = process.env.HAGICODE_CODE_SERVER_PLATFORM || detectCodeServerRuntimePlatform();
const codeServerConfig = readCodeServerRuntimeConfig();
const omniroutePlatform = process.env.HAGICODE_OMNIROUTE_PLATFORM || detectOmniRouteRuntimePlatform();
const omnirouteConfig = readOmniRouteRuntimeConfig();

function parseArgs() {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--archive') {
      const archivePath = args[index + 1];
      if (!archivePath) {
        throw new Error('--archive requires a path value');
      }
      archives.push(path.resolve(process.cwd(), archivePath));
      index += 1;
      continue;
    }

    if (arg === '--help') {
      console.log('Usage: node scripts/verify-release-archives.js [--archive <path> ...]');
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }
}

function listDiscoveredArchives() {
  const pkgRoot = path.join(process.cwd(), 'pkg');
  if (!fs.existsSync(pkgRoot)) {
    throw new Error(`pkg directory does not exist: ${pkgRoot}`);
  }

  const entries = fs.readdirSync(pkgRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  if (process.platform === 'linux') {
    return entries
      .filter((name) => name.endsWith('.zip') || name.endsWith('.tar.gz'))
      .map((name) => path.join(pkgRoot, name));
  }

  if (process.platform === 'darwin') {
    return entries
      .filter((name) => name.endsWith('.zip'))
      .map((name) => path.join(pkgRoot, name));
  }

  if (process.platform === 'win32') {
    return entries
      .filter((name) => name.endsWith('.zip'))
      .map((name) => path.join(pkgRoot, name));
  }

  return [];
}

function ensureArchivesSelected() {
  if (archives.length > 0) {
    return archives;
  }

  const discovered = listDiscoveredArchives();
  if (discovered.length === 0) {
    throw new Error(`No release archives were discovered for validation on ${process.platform}.`);
  }

  return discovered;
}

function suffixSegments(relativePath) {
  return relativePath.split(path.sep).filter(Boolean);
}

function findToolchainRoots(rootPath) {
  const matches = [];
  const stack = [rootPath];
  const seen = new Set();

  while (stack.length > 0) {
    const currentPath = stack.pop();
    const manifestPath = path.join(currentPath, 'toolchain-manifest.json');
    if (fs.existsSync(manifestPath) && !seen.has(currentPath)) {
      matches.push(currentPath);
      seen.add(currentPath);
    }

    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, absolutePath);
      const parts = suffixSegments(relativePath);
      if (parts.length >= 2 && parts.at(-2) === 'extra' && parts.at(-1) === 'toolchain' && !seen.has(absolutePath)) {
        matches.push(absolutePath);
        seen.add(absolutePath);
        continue;
      }

      stack.push(absolutePath);
    }
  }

  return matches.sort();
}

function findExtraRoots(rootPath, suffixParts) {
  const matches = [];
  const stack = [rootPath];

  while (stack.length > 0) {
    const currentPath = stack.pop();
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const absolutePath = path.join(currentPath, entry.name);
      const relativePath = path.relative(rootPath, absolutePath);
      const parts = suffixSegments(relativePath);
      if (parts.length >= suffixParts.length + 1 && parts.at(-(suffixParts.length + 1)) === 'extra') {
        const tail = parts.slice(-(suffixParts.length));
        if (tail.every((value, index) => value === suffixParts[index])) {
          matches.push(absolutePath);
          continue;
        }
      }
      if (parts.length >= suffixParts.length && suffixParts.length === 1 && parts.at(-1) === suffixParts[0]) {
        matches.push(absolutePath);
        continue;
      }

      stack.push(absolutePath);
    }
  }

  return matches.sort();
}

function describeToolchainRoots(rootPath) {
  return findToolchainRoots(rootPath)
    .map((candidate) => path.relative(rootPath, candidate) || '.')
    .join(', ');
}

function validateVendoredRuntimeRoots(archivePath, extractionRoot, options) {
  const runtimeRoots = findExtraRoots(extractionRoot, options.suffixParts);
  if (runtimeRoots.length === 0) {
    throw new Error(`No packaged ${options.label} roots were found in ${archivePath}.`);
  }

  const failures = [];
  for (const runtimeRoot of runtimeRoots) {
    const errors = options.validate(runtimeRoot);
    if (errors.length === 0) {
      console.log(`[archive-verify] ${path.basename(archivePath)} -> ${path.relative(extractionRoot, runtimeRoot)} (${options.platform}) OK`);
      return;
    }

    failures.push(`${path.relative(extractionRoot, runtimeRoot)}: ${errors.join('; ')}`);
  }

  throw new Error(`Archive ${archivePath} failed ${options.label} validation: ${failures.join(' | ')}`);
}

function validateExtractedToolchain(archivePath, extractionRoot, options = {}) {
  const toolchainRoots = findToolchainRoots(extractionRoot);
  if (toolchainRoots.length === 0) {
    const available = describeToolchainRoots(extractionRoot);
    throw new Error(
      available
        ? `No packaged toolchain roots were found in ${archivePath}. Scanned roots: ${available}`
        : `No packaged toolchain roots were found in ${archivePath}.`,
    );
  }

  const failures = [];
  for (const toolchainRoot of toolchainRoots) {
    const manifest = readToolchainManifest(toolchainRoot);
    const platform = manifest?.platform || fallbackPlatform;
    const payloadErrors = validateToolchainPayload(toolchainRoot, {
      platform,
      extractedFromZip: options.extractedFromZip,
    });
    const manifestErrors = validateToolchainManifest(toolchainRoot, { platform });
    if (payloadErrors.length === 0 && manifestErrors.length === 0) {
      console.log(`[archive-verify] ${path.basename(archivePath)} -> ${path.relative(extractionRoot, toolchainRoot)} (${platform}) OK`);
      return;
    }

    failures.push(
      `${path.relative(extractionRoot, toolchainRoot)}: ${[...payloadErrors, ...manifestErrors].join('; ')}`,
    );
  }

  throw new Error(`Archive ${archivePath} failed toolchain validation: ${failures.join(' | ')}`);
}

function extractZip(archivePath, destinationRoot) {
  const archive = new AdmZip(archivePath);
  archive.extractAllTo(destinationRoot, true);
  validateExtractedToolchain(archivePath, destinationRoot, { extractedFromZip: true });
  validateVendoredRuntimeRoots(archivePath, destinationRoot, {
    label: 'vendored code-server runtime',
    suffixParts: ['code-server', 'current'],
    platform: codeServerPlatform,
    validate: (runtimeRoot) => {
      const result = validateCodeServerRuntimePayload(runtimeRoot, { platformKey: codeServerPlatform, config: codeServerConfig });
      return [...result.missingEntries, ...result.diagnostics];
    },
  });
  validateVendoredRuntimeRoots(archivePath, destinationRoot, {
    label: 'vendored OmniRoute runtime',
    suffixParts: ['omniroute', 'current'],
    platform: omniroutePlatform,
    validate: (runtimeRoot) => {
      const result = validateOmniRouteRuntimePayload(runtimeRoot, { platformKey: omniroutePlatform, config: omnirouteConfig });
      return [...result.missingEntries, ...result.diagnostics];
    },
  });
}

function extractTarGz(archivePath, destinationRoot) {
  execFileSync('tar', ['-xzf', archivePath, '-C', destinationRoot], { stdio: 'inherit' });
  validateExtractedToolchain(archivePath, destinationRoot, { extractedFromZip: false });
  validateVendoredRuntimeRoots(archivePath, destinationRoot, {
    label: 'vendored code-server runtime',
    suffixParts: ['code-server', 'current'],
    platform: codeServerPlatform,
    validate: (runtimeRoot) => {
      const result = validateCodeServerRuntimePayload(runtimeRoot, { platformKey: codeServerPlatform, config: codeServerConfig });
      return [...result.missingEntries, ...result.diagnostics];
    },
  });
  validateVendoredRuntimeRoots(archivePath, destinationRoot, {
    label: 'vendored OmniRoute runtime',
    suffixParts: ['omniroute', 'current'],
    platform: omniroutePlatform,
    validate: (runtimeRoot) => {
      const result = validateOmniRouteRuntimePayload(runtimeRoot, { platformKey: omniroutePlatform, config: omnirouteConfig });
      return [...result.missingEntries, ...result.diagnostics];
    },
  });
}

function verifyArchive(archivePath) {
  if (!fs.existsSync(archivePath)) {
    throw new Error(`Release archive does not exist: ${archivePath}`);
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hagicode-release-archive-'));
  try {
    if (archivePath.endsWith('.zip')) {
      extractZip(archivePath, tempRoot);
      return;
    }

    if (archivePath.endsWith('.tar.gz')) {
      extractTarGz(archivePath, tempRoot);
      return;
    }

    throw new Error(`Unsupported release archive type: ${archivePath}`);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function main() {
  parseArgs();
  const selectedArchives = ensureArchivesSelected();
  for (const archivePath of selectedArchives) {
    verifyArchive(archivePath);
  }
}

main();
