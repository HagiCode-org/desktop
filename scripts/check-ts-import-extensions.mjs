#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const IGNORED_DIRECTORIES = new Set(['.git', '.generated', 'node_modules', 'dist', 'pkg', 'coverage', 'build']);
const importPattern = /(?:from\s*['"]([^'"]+\.(?:[cm]?ts|tsx))['"]|import\(\s*['"]([^'"]+\.(?:[cm]?ts|tsx))['"]\s*\))/g;

function isGitIgnored(targetPath) {
  const relativePath = path.relative(rootDir, targetPath);
  if (!relativePath || relativePath.startsWith('..')) {
    return false;
  }

  const result = spawnSync('git', ['check-ignore', '-q', relativePath], {
    cwd: rootDir,
    stdio: 'ignore',
  });
  return result.status === 0;
}

function walk(directoryPath, collectedFiles) {
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name) || isGitIgnored(entryPath)) {
        continue;
      }

      walk(entryPath, collectedFiles);
      continue;
    }

    const extension = path.extname(entry.name);
    if (!SOURCE_EXTENSIONS.has(extension) || entry.name.endsWith('.d.ts') || isGitIgnored(entryPath)) {
      continue;
    }

    collectedFiles.push(entryPath);
  }
}

function getLineNumber(text, offset) {
  let lineNumber = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text[index] === '\n') {
      lineNumber += 1;
    }
  }

  return lineNumber;
}

const files = [];
walk(rootDir, files);

const violations = [];

for (const filePath of files) {
  const content = fs.readFileSync(filePath, 'utf8');

  for (const match of content.matchAll(importPattern)) {
    const specifier = match[1] || match[2];
    if (!specifier) {
      continue;
    }

    violations.push({
      filePath,
      lineNumber: getLineNumber(content, match.index ?? 0),
      specifier,
    });
  }
}

if (violations.length === 0) {
  console.log('check-ts-import-extensions: no explicit TypeScript extensions found in TS source files');
  process.exit(0);
}

console.error('check-ts-import-extensions: explicit TypeScript extensions are not allowed in TS source files:');
for (const violation of violations) {
  console.error(`- ${path.relative(rootDir, violation.filePath)}:${violation.lineNumber} -> ${violation.specifier}`);
}

process.exit(1);
