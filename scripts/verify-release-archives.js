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

const args = process.argv.slice(2);
const archives = [];
const fallbackPlatform = process.env.HAGICODE_EMBEDDED_NODE_PLATFORM || detectNodeRuntimePlatform();

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
      if (parts.length >= 2 && parts.at(-2) === 'portable-fixed' && parts.at(-1) === 'toolchain') {
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
}

function extractTarGz(archivePath, destinationRoot) {
  execFileSync('tar', ['-xzf', archivePath, '-C', destinationRoot], { stdio: 'inherit' });
  validateExtractedToolchain(archivePath, destinationRoot, { extractedFromZip: false });
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
