#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

function normalizePublisher(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return null;
  }

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim() || null;
  }

  return trimmed;
}

function yamlScalar(value) {
  return String(value).replace(/"/g, '\\"');
}

export function renderMsixVerificationConfig({
  extendsConfig = 'electron-builder.yml',
  publisherOverride = null,
} = {}) {
  const lines = [
    `extends: ${extendsConfig}`,
    'win:',
    '  target:',
    '    - appx',
    'appx:',
    '  artifactName: ${productName} ${version}.msix',
  ];

  if (publisherOverride) {
    lines.push(`  publisher: "${yamlScalar(publisherOverride)}"`);
  }

  return `${lines.join('\n')}\n`;
}

async function main() {
  const { values } = parseArgs({
    options: {
      output: { type: 'string' },
      extends: { type: 'string' },
    },
  });

  const outputPath = path.resolve(values.output ?? 'electron-builder.msix-verification.yml');
  const extendsConfig = values.extends ?? 'electron-builder.yml';
  const publisherOverride = normalizePublisher(process.env.AZURE_CODESIGN_APPX_PUBLISHER);
  const configText = renderMsixVerificationConfig({
    extendsConfig,
    publisherOverride,
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, configText, 'utf8');
  console.log(outputPath);
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
