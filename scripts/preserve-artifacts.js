#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) {
      continue;
    }

    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }

    options[key] = value;
    index += 1;
  }

  return options;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compilePattern(pattern) {
  const escapedSegments = pattern.split('*').map((segment) => escapeRegExp(segment));
  return new RegExp(`^${escapedSegments.join('.*')}$`, 'i');
}

function withSuffix(fileName, suffix) {
  const lowerName = fileName.toLowerCase();
  const knownExtensions = ['.tar.gz', '.appimage', '.deb', '.rpm', '.msix', '.dmg', '.zip', '.exe'];

  for (const extension of knownExtensions) {
    if (lowerName.endsWith(extension)) {
      return `${fileName.slice(0, fileName.length - extension.length)}-${suffix}${fileName.slice(fileName.length - extension.length)}`;
    }
  }

  const parsed = path.parse(fileName);
  return `${parsed.name}-${suffix}${parsed.ext}`;
}

const options = parseArgs(process.argv.slice(2));
const sourceDir = options['source-dir'];
const outputDir = options['output-dir'];
const artifactPath = options['artifact-path'];
const suffix = options.suffix || 'unsigned';

if (!sourceDir || !outputDir || !artifactPath) {
  console.error('Usage: node scripts/preserve-artifacts.js --source-dir <dir> --output-dir <dir> --artifact-path <pattern> [--suffix <name>]');
  process.exit(1);
}

const resolvedSourceDir = path.resolve(sourceDir);
const resolvedOutputDir = path.resolve(outputDir);
const pattern = path.basename(artifactPath);
const matcher = compilePattern(pattern);

if (!fs.existsSync(resolvedSourceDir)) {
  throw new Error(`Source directory does not exist: ${resolvedSourceDir}`);
}

const entries = fs.readdirSync(resolvedSourceDir, { withFileTypes: true });
const matchedFiles = entries
  .filter((entry) => entry.isFile() && matcher.test(entry.name))
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right));

if (matchedFiles.length === 0) {
  throw new Error(`No files matched ${pattern} in ${resolvedSourceDir}`);
}

fs.mkdirSync(resolvedOutputDir, { recursive: true });

for (const fileName of matchedFiles) {
  const sourcePath = path.join(resolvedSourceDir, fileName);
  const outputName = withSuffix(fileName, suffix);
  const outputPath = path.join(resolvedOutputDir, outputName);
  fs.copyFileSync(sourcePath, outputPath);
  console.log(`[preserve-artifacts] ${fileName} -> ${outputName}`);
}
