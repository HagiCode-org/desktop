#!/usr/bin/env node

/**
 * Signature Verification Script
 *
 * This script verifies Authenticode signatures on Windows artifacts.
 * CI uses it after Azure Artifact Signing to enforce release gating.
 *
 * Usage:
 *   node scripts/verify-signature.js <file-path>
 *   node scripts/verify-signature.js --all <directory>
 *   node scripts/verify-signature.js --catalog <file-list>
 *
 * Environment Variables:
 *   VERIFY_STRICT        - Fail on unsigned files (default: false)
 *
 * Exit Codes:
 *   0 - Success (all files signed or strict mode disabled)
 *   1 - Verification failed or unsigned files found in strict mode
 *   2 - Invalid arguments
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const config = {
  strictMode: process.env.VERIFY_STRICT === 'true',
};

const SIGNABLE_EXTENSIONS = ['.exe', '.dll', '.appx', '.msix', '.msi'];

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logCI(message, type = 'info') {
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

  if (!isGitHubActions) {
    log(message);
    return;
  }

  switch (type) {
    case 'error':
      log(`::error::${message}`, colors.red);
      break;
    case 'warning':
      log(`::warning::${message}`, colors.yellow);
      break;
    case 'notice':
      log(`::notice::${message}`, colors.blue);
      break;
    default:
      log(message);
      break;
  }
}

function showHelp() {
  console.log(`
Usage: node scripts/verify-signature.js <file-path>
       node scripts/verify-signature.js --all <directory>
       node scripts/verify-signature.js --catalog <file-list>

Arguments:
  file-path              Path to the file to verify
  --all <directory>      Verify all signable files in directory
  --catalog <file-list>  Verify signable files listed in a newline-delimited file

Environment Variables:
  VERIFY_STRICT          Fail on unsigned files (default: false)

Supported file types:
  - .exe
  - .dll
  - .appx
  - .msix
  - .msi
`);
}

function isSignableFile(filePath) {
  return SIGNABLE_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

function findSignableFiles(dir) {
  const files = [];

  function scanDirectory(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.isFile() && isSignableFile(fullPath)) {
        files.push(fullPath);
      }
    }
  }

  scanDirectory(dir);
  return files;
}

function readCatalogFile(catalogPath) {
  const contents = fs.readFileSync(catalogPath, 'utf8');
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeCandidateFiles(files) {
  const unique = [];
  const seen = new Set();

  for (const filePath of files) {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      logCI(`Skipping missing file: ${resolvedPath}`, 'warning');
      continue;
    }
    if (!isSignableFile(resolvedPath)) {
      logCI(`Skipping non-signable file: ${resolvedPath}`, 'warning');
      continue;
    }
    if (!seen.has(resolvedPath)) {
      unique.push(resolvedPath);
      seen.add(resolvedPath);
    }
  }

  return unique;
}

function getSignToolPath() {
  if (process.platform !== 'win32') {
    return null;
  }

  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';

  const possiblePaths = [
    path.join(programFiles, 'Windows Kits', '10', 'bin', '10.0.22000.0', 'x64', 'signtool.exe'),
    path.join(programFiles, 'Windows Kits', '10', 'bin', 'x64', 'signtool.exe'),
    path.join(programFilesX86, 'Windows Kits', '10', 'bin', 'x64', 'signtool.exe'),
    path.join(programFiles, 'Windows Kits', '8.1', 'bin', 'x64', 'signtool.exe'),
  ];

  return possiblePaths.find((candidate) => fs.existsSync(candidate)) ?? null;
}

async function verifySignature(filePath) {
  if (process.platform !== 'win32') {
    return {
      signed: false,
      method: 'unsupported-platform',
      note: 'Full Authenticode verification requires Windows signtool.',
    };
  }

  return verifyWithSignTool(filePath);
}

async function verifyWithSignTool(filePath) {
  const signToolPath = getSignToolPath();

  if (!signToolPath) {
    return {
      signed: false,
      method: 'missing-signtool',
      error: 'signtool.exe not found on this Windows runner.',
    };
  }

  return new Promise((resolve) => {
    const args = ['verify', '/pa', filePath];
    const child = spawn(signToolPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        signed: code === 0,
        method: 'signtool',
        code,
        stdout,
        stderr,
      });
    });

    child.on('error', (error) => {
      resolve({
        signed: false,
        method: 'signtool',
        error: error.message,
      });
    });
  });
}

function formatResult(filePath, result) {
  const fileName = path.basename(filePath);

  if (result.signed) {
    return `${colors.green}✓ ${fileName}${colors.reset} (signed)`;
  }

  if (result.method === 'unsupported-platform') {
    return `${colors.yellow}⊘ ${fileName}${colors.reset} (${result.note})`;
  }

  if (result.method === 'missing-signtool') {
    return `${colors.red}✗ ${fileName}${colors.reset} (signtool missing)`;
  }

  return `${colors.red}✗ ${fileName}${colors.reset} (unsigned)`;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  let filesToVerify = [];

  if (args.includes('--all')) {
    const index = args.indexOf('--all');
    const dirPath = args[index + 1];
    if (!dirPath) {
      logCI('--all requires a directory path', 'error');
      process.exit(2);
    }
    if (!fs.existsSync(dirPath)) {
      logCI(`Directory not found: ${dirPath}`, 'error');
      process.exit(2);
    }
    filesToVerify = findSignableFiles(dirPath);
  } else if (args.includes('--catalog')) {
    const index = args.indexOf('--catalog');
    const catalogPath = args[index + 1];
    if (!catalogPath) {
      logCI('--catalog requires a file path', 'error');
      process.exit(2);
    }
    if (!fs.existsSync(catalogPath)) {
      logCI(`Catalog file not found: ${catalogPath}`, 'error');
      process.exit(2);
    }
    filesToVerify = readCatalogFile(catalogPath);
  } else if (args.length > 0) {
    filesToVerify = [args[0]];
  } else {
    logCI('No file path provided', 'error');
    showHelp();
    process.exit(2);
  }

  const normalizedFiles = normalizeCandidateFiles(filesToVerify);
  if (normalizedFiles.length === 0) {
    logCI('No signable files found to verify', 'warning');
    process.exit(0);
  }

  logCI(`Verifying ${normalizedFiles.length} file(s)...`, 'info');
  log('', colors.cyan);

  const results = [];
  for (const filePath of normalizedFiles) {
    const result = await verifySignature(filePath);
    results.push({ path: filePath, ...result });
    console.log(formatResult(filePath, result));

    if (!result.signed && result.error) {
      logCI(`Verification failed for ${path.basename(filePath)}: ${result.error}`, 'warning');
    }
    if (!result.signed && result.stderr) {
      logCI(`Verification failed for ${path.basename(filePath)}: ${result.stderr.trim()}`, 'warning');
    }
  }

  log('', colors.cyan);

  const failedResults = results.filter((result) => !result.signed);
  if (failedResults.length === 0) {
    logCI(`All ${results.length} file(s) passed signature verification`, 'notice');
    process.exit(0);
  }

  logCI(`${failedResults.length} of ${results.length} file(s) did not pass signature verification`, 'warning');

  if (config.strictMode) {
    logCI('Strict mode enabled: failing verification', 'error');
    process.exit(1);
  }

  process.exit(0);
}

main().catch((error) => {
  log(`Fatal error: ${error.message}`, colors.red);
  console.error(error);
  process.exit(1);
});
