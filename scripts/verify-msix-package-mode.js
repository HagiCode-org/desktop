#!/usr/bin/env node

import assert from 'node:assert/strict';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import AdmZip from 'adm-zip';

function normalizeEntryName(value) {
  return String(value).replace(/\\/g, '/').replace(/^\/+/, '');
}

export function listArchiveEntries(msixPath) {
  const zip = new AdmZip(msixPath);
  return zip.getEntries().map((entry) => normalizeEntryName(entry.entryName));
}

export function assertMsixPackageMode(entryNames, expectedMode) {
  const normalizedEntries = entryNames.map(normalizeEntryName);
  const hasManifest = normalizedEntries.some((entry) => entry === 'AppxManifest.xml' || entry.endsWith('/AppxManifest.xml'));
  assert.equal(hasManifest, true, 'MSIX package is missing AppxManifest.xml');

  const portableFixedEntries = normalizedEntries.filter((entry) => entry.includes('portable-fixed/'));

  if (expectedMode === 'normal') {
    assert.equal(
      portableFixedEntries.length,
      0,
      `Expected a normal-mode MSIX without portable-fixed payloads, found: ${portableFixedEntries.join(', ')}`,
    );
    return;
  }

  if (expectedMode === 'steam') {
    assert.equal(
      portableFixedEntries.some((entry) => entry.includes('portable-fixed/current/')),
      true,
      'Expected a steam-mode MSIX with a portable-fixed/current payload.',
    );
    return;
  }

  throw new Error(`Unsupported MSIX mode: ${expectedMode}`);
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      mode: { type: 'string', default: 'normal' },
    },
    allowPositionals: true,
  });

  if (positionals.length === 0) {
    throw new Error('verify-msix-package-mode requires at least one .msix path.');
  }

  for (const targetPath of positionals.map((value) => path.resolve(value))) {
    const entryNames = listArchiveEntries(targetPath);
    assertMsixPackageMode(entryNames, values.mode);
    console.log(`${path.basename(targetPath)}: ${values.mode}`);
  }
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
