#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const addonProjectDirectory = path.join(projectRoot, 'native', 'StorePurchaseAddon');
const bindingGypPath = path.join(addonProjectDirectory, 'binding.gyp');
const publishRoot = path.join(projectRoot, 'resources', 'windows-store-purchase-addon');
const addonModuleFileName = 'hagicode_store_purchase_addon.node';
const windowsKitsIncludeRoot = path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Windows Kits', '10', 'Include');

function parseArgs(argv) {
  const options = {
    arch: process.arch,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--arch':
        options.arch = String(argv[++index] || '').trim() || process.arch;
        break;
      case '--help':
      case '-h':
        console.log(`Usage: node scripts/build-store-purchase-addon.js [options]

Options:
  --arch <name>   Target architecture: x64 | arm64
`);
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function normalizeArch(arch) {
  const value = String(arch || '').trim().toLowerCase();
  if (value === 'arm64') {
    return 'arm64';
  }

  return 'x64';
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || projectRoot,
    env: options.env || process.env,
    stdio: options.stdio || 'inherit',
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }

  if ((result.status ?? 0) !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status ?? 1}`);
  }
}

function resolveNodeGypPath() {
  const candidate = path.join(projectRoot, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js');
  if (!fs.existsSync(candidate)) {
    throw new Error('Unable to locate node-gyp. Run npm install before building the Windows Store purchase addon.');
  }

  return candidate;
}

function resolveCppWinRtIncludeDirectory() {
  if (!fs.existsSync(windowsKitsIncludeRoot)) {
    throw new Error(`Windows SDK include directory not found: ${windowsKitsIncludeRoot}`);
  }

  const candidate = fs.readdirSync(windowsKitsIncludeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(entry.name))
    .map((entry) => path.join(windowsKitsIncludeRoot, entry.name, 'cppwinrt'))
    .filter((entryPath) => fs.existsSync(path.join(entryPath, 'winrt', 'base.h')))
    .sort((left, right) => right.localeCompare(left))[0];

  if (!candidate) {
    throw new Error(`Unable to locate a Windows SDK C++/WinRT include directory under ${windowsKitsIncludeRoot}`);
  }

  return candidate;
}

async function removePublishDirectory(outputDirectory) {
  await fsp.rm(outputDirectory, { recursive: true, force: true });
  await fsp.mkdir(outputDirectory, { recursive: true });
}

export function resolveStorePurchaseAddonOutputDirectory(arch) {
  return path.join(publishRoot, normalizeArch(arch));
}

export async function buildStorePurchaseAddon(options = {}) {
  if (process.platform !== 'win32') {
    console.log('[store-purchase-addon] skipped: addon build is only supported on Windows hosts.');
    return null;
  }

  if (!fs.existsSync(bindingGypPath)) {
    throw new Error(`Missing store purchase addon project: ${path.relative(projectRoot, bindingGypPath)}`);
  }

  const arch = normalizeArch(options.arch || process.arch);
  const outputDirectory = resolveStorePurchaseAddonOutputDirectory(arch);
  const nodeGypPath = resolveNodeGypPath();
  const cppWinRtIncludeDirectory = resolveCppWinRtIncludeDirectory();
  const buildDirectory = path.join(addonProjectDirectory, 'build');

  await removePublishDirectory(outputDirectory);
  await fsp.rm(buildDirectory, { recursive: true, force: true });

  run(process.execPath, [
    nodeGypPath,
    'rebuild',
    '--arch',
    arch,
  ], {
    cwd: addonProjectDirectory,
    env: {
      ...process.env,
      HAGICODE_CPPWINRT_INCLUDE_DIR: cppWinRtIncludeDirectory,
    },
  });

  const builtModulePath = path.join(buildDirectory, 'Release', addonModuleFileName);
  if (!fs.existsSync(builtModulePath)) {
    throw new Error(`node-gyp completed without producing ${path.relative(projectRoot, builtModulePath)}`);
  }

  await fsp.copyFile(builtModulePath, path.join(outputDirectory, addonModuleFileName));
  console.log(`[store-purchase-addon] published ${path.relative(projectRoot, outputDirectory)}`);
  return outputDirectory;
}

const isDirectExecution = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isDirectExecution) {
  buildStorePurchaseAddon(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(`[store-purchase-addon] ${error.message}`);
    process.exit(1);
  });
}
