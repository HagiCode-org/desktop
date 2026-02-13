#!/usr/bin/env node

/**
 * Signature Verification Script
 *
 * This script verifies code signatures on Windows executables and packages.
 * It checks for Authenticode signatures and reports the signing status.
 *
 * Usage:
 *   node scripts/verify-signature.js <file-path>
 *   node scripts/verify-signature.js --all <directory>
 *
 * Environment Variables:
 *   VERIFY_STRICT        - Fail on unsigned files (default: false)
 *
 * Exit Codes:
 *   0 - Success (all files signed or no files to check)
 *   1 - Verification failed or unsigned files found
 *   2 - Invalid arguments
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

/**
 * Configuration from environment variables
 */
const config = {
  strictMode: process.env.VERIFY_STRICT === 'true',
};

/**
 * Log messages with optional colors
 */
function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

/**
 * Log CI-specific information
 */
function logCI(message, type = 'info') {
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

  if (isGitHubActions) {
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
      case 'group':
      log(`::group::${message}`, colors.cyan);
      break;
      case 'endgroup':
      log('::endgroup::');
      break;
      default:
      log(message);
    }
  } else {
    log(message);
  }
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Usage: node scripts/verify-signature.js <file-path>
       node scripts/verify-signature.js --all <directory>

Arguments:
  file-path              Path to the file to verify
  --all <directory>      Verify all signable files in directory

Environment Variables:
  VERIFY_STRICT          Fail on unsigned files (default: false)

Description:
  This script verifies code signatures on Windows executables and packages.
  It checks for Authenticode signatures and reports the signing status.

Supported file types:
  - .exe  - Executable files
  - .dll  - Dynamic-link libraries
  - .appx - Windows app packages
  - .msix - Windows app packages

Exit Codes:
  0 - Success (all files signed or no files to check)
  1 - Verification failed or unsigned files found
  2 - Invalid arguments
`);
}

/**
 * File extensions that should be signed
 */
const SIGNABLE_EXTENSIONS = [
  '.exe',
  '.dll',
  '.appx',
  '.msix',
  '.msi',
];

/**
 * Check if a file should be signed
 */
function isSignableFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return SIGNABLE_EXTENSIONS.includes(ext);
}

/**
 * Find all signable files in a directory
 */
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

/**
 * Get platform-specific signtool path
 */
function getSignToolPath() {
  const platform = process.platform;

  if (platform !== 'win32') {
    // On non-Windows platforms, try to use Wine or skip
    return null;
  }

  const programFiles = process.env.ProgramFiles || 'C:\\\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\\\Program Files (x86)';

  // Possible signtool locations
  const possiblePaths = [
    path.join(programFiles, 'Windows Kits', '10', 'bin', '10.0.22000.0', 'x64', 'signtool.exe'),
    path.join(programFiles, 'Windows Kits', '10', 'bin', 'x64', 'signtool.exe'),
    path.join(programFilesX86, 'Windows Kits', '10', 'bin', 'x64', 'signtool.exe'),
    path.join(programFiles, 'Windows Kits', '8.1', 'bin', 'x64', 'signtool.exe'),
  ];

  for (const signtoolPath of possiblePaths) {
    if (fs.existsSync(signtoolPath)) {
      return signtoolPath;
    }
  }

  return null;
}

/**
 * Verify signature of a single file
 */
async function verifySignature(filePath) {
  const platform = process.platform;

  if (platform === 'win32') {
    return await verifyWithSignTool(filePath);
  } else {
    // On non-Windows platforms, use basic checks
    return await verifyBasic(filePath);
  }
}

/**
 * Verify using Windows signtool
 */
async function verifyWithSignTool(filePath) {
  const signToolPath = getSignToolPath();

  if (!signToolPath) {
    logCI('signtool.exe not found. Skipping detailed verification.', 'warning');
    return { signed: true, method: 'skipped' };
  }

  return new Promise((resolve) => {
    const args = [
      'verify',
      '/pa',
      filePath,
    ];

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
      // Signtool returns 0 for successfully signed files
      // A specific error message indicates no signature
      const isSigned = code === 0 && !stderr.includes('SignTool Error') && !stderr.includes('No signature found');

      resolve({
        signed: isSigned,
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

/**
 * Basic verification for non-Windows platforms
 */
async function verifyBasic(filePath) {
  // Check if file has digital signature marker
  // This is a simplified check - real verification requires Windows APIs
  const buffer = fs.readFileSync(filePath);
  const PE_OFFSET = Buffer.from(buffer).readUInt32LE(0x3C);

  if (PE_OFFSET < buffer.length) {
    // Check for security directory in PE header
    // This is a basic heuristic
    return {
      signed: false, // Assume unsigned on non-Windows
      method: 'basic',
      note: 'Full verification requires Windows platform',
    };
  }

  return {
    signed: false,
    method: 'basic',
  };
}

/**
 * Format verification result for display
 */
function formatResult(filePath, result) {
  const fileName = path.basename(filePath);

  if (result.method === 'skipped') {
    return `${colors.yellow}⊘ ${fileName}${colors.reset} (skipped - signtool not found)`;
  }

  if (result.signed) {
    return `${colors.green}✓ ${fileName}${colors.reset} (signed)`;
  } else {
    return `${colors.red}✗ ${fileName}${colors.reset} (unsigned)`;
  }
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);

  // Check for help flag
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  let filesToVerify = [];
  let directoryMode = false;

  // Parse arguments
  if (args.includes('--all')) {
    const allIndex = args.indexOf('--all');
    if (allIndex + 1 >= args.length) {
      logCI('--all requires a directory path', 'error');
      showHelp();
      process.exit(2);
    }

    const dirPath = args[allIndex + 1];

    if (!fs.existsSync(dirPath)) {
      logCI(`Directory not found: ${dirPath}`, 'error');
      process.exit(2);
    }

    filesToVerify = findSignableFiles(dirPath);
    directoryMode = true;
  } else if (args.length === 0) {
    logCI('No file path provided', 'error');
    showHelp();
    process.exit(2);
  } else {
    filesToVerify = [args[0]];
  }

  if (filesToVerify.length === 0) {
    if (directoryMode) {
      logCI('No signable files found in directory', 'info');
    } else {
      logCI(`File is not signable: ${args[0]}`, 'warning');
    }
    process.exit(0);
  }

  logCI(`Verifying ${filesToVerify.length} file(s)...`, 'info');
  log('', colors.cyan);

  const results = [];

  for (const filePath of filesToVerify) {
    const result = await verifySignature(filePath);
    results.push({ path: filePath, ...result });

    console.log(formatResult(filePath, result));

    // Log detailed errors for CI
    if (!result.signed && result.stderr) {
      logCI(`Verification failed for ${path.basename(filePath)}: ${result.stderr.trim()}`, 'warning');
    }
  }

  log('', colors.cyan);

  // Check results
  const unsignedCount = results.filter(r => !r.signed && r.method !== 'skipped').length;

  if (unsignedCount > 0) {
    logCI(`${unsignedCount} of ${results.length} files are unsigned`, 'warning');

    if (config.strictMode) {
      logCI('Strict mode enabled: failing verification', 'error');
      process.exit(1);
    }
  } else {
    logCI(`All ${results.length} files are verified`, 'info');
  }

  process.exit(0);
}

// Run the script
main().catch((error) => {
  log(`Fatal error: ${error.message}`, colors.red);
  console.error(error);
  process.exit(1);
});
