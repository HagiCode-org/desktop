#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

async function sha256File(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

function normalizeSourcePath(filePath) {
  const resolvedPath = path.resolve(String(filePath));
  const extension = path.extname(resolvedPath).toLowerCase();
  if (extension !== '.appx' && extension !== '.msix') {
    throw new Error(`Unsupported Store package input: ${resolvedPath}. Expected a .appx or .msix file.`);
  }
  return resolvedPath;
}

async function ensureMatchingFileContent(sourcePath, targetPath) {
  const [sourceStat, targetStat] = await Promise.all([
    fs.stat(sourcePath),
    fs.stat(targetPath),
  ]);

  if (sourceStat.size !== targetStat.size) {
    throw new Error(`Prepared MSIX asset size mismatch for ${targetPath}.`);
  }

  const [sourceSha256, targetSha256] = await Promise.all([
    sha256File(sourcePath),
    sha256File(targetPath),
  ]);

  if (sourceSha256 !== targetSha256) {
    throw new Error(`Prepared MSIX asset content mismatch for ${targetPath}.`);
  }

  return {
    sizeBytes: sourceStat.size,
    sha256: sourceSha256,
  };
}

export async function prepareMsixReleaseAssets({
  sourcePaths,
  outputDirectory,
}) {
  const normalizedSourcePaths = [...new Set((sourcePaths || []).map(normalizeSourcePath))];
  if (normalizedSourcePaths.length === 0) {
    throw new Error('prepareMsixReleaseAssets requires at least one .appx or .msix source path.');
  }

  const resolvedOutputDirectory = outputDirectory
    ? path.resolve(outputDirectory)
    : null;

  if (resolvedOutputDirectory) {
    await fs.mkdir(resolvedOutputDirectory, { recursive: true });
  }

  const seenTargets = new Map();
  const assets = [];

  for (const sourcePath of normalizedSourcePaths) {
    await fs.access(sourcePath);

    const sourceExtension = path.extname(sourcePath).toLowerCase();
    const outputBaseName = `${path.basename(sourcePath, sourceExtension)}.msix`;
    const outputPath = resolvedOutputDirectory
      ? path.join(resolvedOutputDirectory, outputBaseName)
      : (sourceExtension === '.msix' ? sourcePath : path.join(path.dirname(sourcePath), outputBaseName));
    const resolvedOutputPath = path.resolve(outputPath);

    const previousSource = seenTargets.get(resolvedOutputPath);
    if (previousSource && previousSource !== sourcePath) {
      throw new Error(`Multiple Store package inputs would overwrite ${resolvedOutputPath}.`);
    }
    seenTargets.set(resolvedOutputPath, sourcePath);

    let copied = false;
    if (resolvedOutputPath !== sourcePath) {
      await fs.copyFile(sourcePath, resolvedOutputPath);
      copied = true;
    }

    const verification = await ensureMatchingFileContent(sourcePath, resolvedOutputPath);
    assets.push({
      sourcePath,
      outputPath: resolvedOutputPath,
      fileName: path.basename(resolvedOutputPath),
      copied,
      sourceExtension,
      sizeBytes: verification.sizeBytes,
      sha256: verification.sha256,
    });
  }

  return assets;
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      'out-dir': { type: 'string' },
      'output-json': { type: 'string' },
    },
    allowPositionals: true,
  });

  const assets = await prepareMsixReleaseAssets({
    sourcePaths: positionals,
    outputDirectory: values['out-dir'] ?? null,
  });

  if (values['output-json']) {
    const outputJsonPath = path.resolve(values['output-json']);
    await fs.mkdir(path.dirname(outputJsonPath), { recursive: true });
    await fs.writeFile(outputJsonPath, `${JSON.stringify(assets, null, 2)}\n`, 'utf8');
  }

  console.log(JSON.stringify(assets, null, 2));
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
