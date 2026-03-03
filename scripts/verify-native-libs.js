#!/usr/bin/env node

/**
 * Native Library Verification Script
 *
 * This script verifies that the correct native libraries are present
 * in the build output for each platform. It's designed to catch
 * packaging issues before deployment.
 *
 * Usage:
 *   node scripts/verify-native-libs.js [options]
 *
 * Options:
 *   --platform <platform>       Target platform (auto-detected if not specified)
 *   --path <path>               Build output path (default: pkg or dist)
 *   --verbose                   Enable verbose output
 *   --help                      Show help message
 */

import fs from 'fs';
import path from 'path';

// Parse command line arguments
const args = process.argv.slice(2);

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
 * Native library requirements for each platform
 */
const nativeLibs = {
  'osx-arm64': [
    { name: 'libgit2.dylib', optional: true },
    { name: 'libgit2-*.dylib', pattern: true },
  ],
  'osx-x64': [
    { name: 'libgit2.dylib', optional: true },
    { name: 'libgit2-*.dylib', pattern: true },
  ],
  'linux-x64': [
    { name: 'libgit2.so.1.7', optional: true },
    { name: 'libgit2.so', optional: true },
  ],
  'linux-arm64': [
    { name: 'libgit2.so.1.7', optional: true },
    { name: 'libgit2.so', optional: true },
  ],
  'win-x64': [
    { name: 'git2-1.7.dll', optional: true },
    { name: 'git2.dll', optional: true },
  ],
  'win-arm64': [
    { name: 'git2-1.7.dll', optional: true },
    { name: 'git2.dll', optional: true },
  ],
};

/**
 * Configuration
 */
const config = {
  platform: '',
  outputPath: '',
  verbose: false,
};

/**
 * Log messages with optional colors
 */
function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Usage: node scripts/verify-native-libs.js [options]

Options:
  --platform <platform>       Target platform (auto-detected if not specified)
                            Valid platforms: osx-arm64, osx-x64, linux-x64,
                            linux-arm64, win-x64, win-arm64
  --path <path>             Build output path (default: pkg or dist)
  --verbose                 Enable verbose output
  --help                    Show this help message

This script verifies that native libraries are correctly packaged in the build output.
It checks for LibGit2Sharp native libraries (libgit2.dylib, libgit2.so, git2.dll).

Exit codes:
  0 - All required libraries found
  1 - Missing required libraries
  2 - Invalid arguments or error
`);
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--platform':
        config.platform = args[++i];
        break;
      case '--path':
        config.outputPath = args[++i];
        break;
      case '--verbose':
        config.verbose = true;
        break;
      case '--help':
        showHelp();
        process.exit(0);
      default:
        log(`Unknown option: ${args[i]}`, colors.red);
        showHelp();
        process.exit(2);
    }
  }

  // Auto-detect platform if not specified
  if (!config.platform) {
    const platform = process.platform;
    const arch = process.arch;

    if (platform === 'darwin') {
      config.platform = arch === 'arm64' ? 'osx-arm64' : 'osx-x64';
    } else if (platform === 'win32') {
      config.platform = arch === 'arm64' ? 'win-arm64' : 'win-x64';
    } else {
      config.platform = arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
    }
    log(`Auto-detected platform: ${config.platform}`, colors.blue);
  }

  // Validate platform
  if (!nativeLibs[config.platform]) {
    log(`Invalid platform: ${config.platform}`, colors.red);
    log(`Valid platforms: ${Object.keys(nativeLibs).join(', ')}`, colors.yellow);
    process.exit(2);
  }

  // Auto-detect output path if not specified
  if (!config.outputPath) {
    const possiblePaths = ['pkg', 'dist', 'build'];
    for (const p of possiblePaths) {
      if (fs.existsSync(path.join(process.cwd(), p))) {
        config.outputPath = path.join(process.cwd(), p);
        log(`Auto-detected output path: ${p}`, colors.blue);
        break;
      }
    }
    if (!config.outputPath) {
      config.outputPath = path.join(process.cwd(), 'pkg');
      log(`Using default output path: pkg`, colors.yellow);
    }
  } else {
    config.outputPath = path.resolve(config.outputPath);
  }

  if (!fs.existsSync(config.outputPath)) {
    log(`Output path does not exist: ${config.outputPath}`, colors.red);
    process.exit(2);
  }
}

/**
 * Recursively find all files matching a pattern
 */
function findFiles(dir, pattern, maxDepth = 10, currentDepth = 0) {
  if (currentDepth > maxDepth) return [];

  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules and common ignore directories
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === '.vite'
      ) {
        continue;
      }
      files.push(...findFiles(fullPath, pattern, maxDepth, currentDepth + 1));
    } else if (entry.isFile()) {
      if (entry.name.toLowerCase().includes(pattern.toLowerCase())) {
        files.push({
          path: fullPath,
          relative: path.relative(config.outputPath, fullPath),
          name: entry.name,
        });
      }
    }
  }

  return files;
}

/**
 * Verify native libraries for a platform
 */
function verifyPlatformLibs(platform, outputPath) {
  const requirements = nativeLibs[platform];
  const foundLibs = new Set();
  const issues = [];

  log(`\nVerifying native libraries for ${platform}:`, colors.cyan);
  log('='.repeat(60), colors.gray);

  for (const req of requirements) {
    if (req.pattern) {
      // Pattern match (e.g., libgit2-*.dylib)
      const patternBase = req.name.replace('*', '');
      const files = findFiles(outputPath, patternBase);

      if (config.verbose) {
        log(`\nPattern: ${req.name}`, colors.gray);
        if (files.length > 0) {
          for (const f of files) {
            log(`  Found: ${f.relative}`, colors.gray);
          }
        }
      }

      if (files.length === 0 && !req.optional) {
        issues.push(`Missing library matching pattern: ${req.name}`);
      } else {
        for (const f of files) {
          foundLibs.add(f.name);
        }
      }
    } else {
      // Exact match
      const files = findFiles(outputPath, req.name);

      if (config.verbose) {
        log(`\nLibrary: ${req.name}`, colors.gray);
        if (files.length > 0) {
          for (const f of files) {
            log(`  Found: ${f.relative}`, colors.gray);
            const stats = fs.statSync(f.path);
            log(`  Size: ${(stats.size / 1024).toFixed(1)} KB`, colors.gray);
          }
        }
      }

      if (files.length === 0 && !req.optional) {
        issues.push(`Missing library: ${req.name}`);
      } else {
        for (const f of files) {
          foundLibs.add(f.name);
        }
      }
    }
  }

  // Print results
  log('', colors.reset);

  if (foundLibs.size > 0) {
    log('Found native libraries:', colors.green);
    for (const lib of foundLibs) {
      log(`  ✓ ${lib}`, colors.green);
    }
  }

  if (issues.length > 0) {
    log('\nIssues:', colors.red);
    for (const issue of issues) {
      log(`  ✗ ${issue}`, colors.red);
    }
    return false;
  }

  if (foundLibs.size === 0) {
    log('\nNo native libraries found. This may be expected if this is a web-only build.', colors.yellow);
    log('Note: For desktop builds with LibGit2Sharp, native libraries should be present.', colors.yellow);
  }

  log('='.repeat(60), colors.gray);
  return true;
}

/**
 * Verify runtimes directory structure
 */
function verifyRuntimesStructure(outputPath) {
  log(`\nVerifying runtimes directory structure:`, colors.cyan);
  log('='.repeat(60), colors.gray);

  const runtimesDir = path.join(outputPath, 'runtimes');

  if (!fs.existsSync(runtimesDir)) {
    log('No runtimes directory found (expected for Electron builds)', colors.yellow);
    return true;
  }

  const entries = fs.readdirSync(runtimesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nativeDir = path.join(runtimesDir, entry.name, 'native');
      if (fs.existsSync(nativeDir)) {
        const nativeFiles = fs.readdirSync(nativeDir);
        if (nativeFiles.length > 0) {
          log(`\n${entry.name}/native:`, colors.blue);
          for (const file of nativeFiles) {
            log(`  ${file}`, colors.green);
          }
        }
      }
    }
  }

  log('='.repeat(60), colors.gray);
  return true;
}

/**
 * Main execution function
 */
function main() {
  const startTime = Date.now();

  log('', colors.cyan);
  log('='.repeat(60), colors.cyan);
  log('Native Library Verification', colors.cyan);
  log('='.repeat(60), colors.cyan);

  parseArgs();

  log(`\nConfiguration:`, colors.cyan);
  log(`  Platform:    ${config.platform}`, colors.green);
  log(`  Output path: ${config.outputPath}`, colors.green);
  log(`  Verbose:    ${config.verbose}`, colors.green);

  // Verify platform-specific libraries
  const libsVerified = verifyPlatformLibs(config.platform, config.outputPath);

  // Verify runtimes structure
  const structureVerified = verifyRuntimesStructure(config.outputPath);

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  log('', colors.cyan);
  log('='.repeat(60), colors.cyan);

  if (libsVerified && structureVerified) {
    log(`\n✓ Verification passed (${duration}s)`, colors.green);
    log('='.repeat(60), colors.cyan);
    log('', colors.reset);
    process.exit(0);
  } else {
    log(`\n✗ Verification failed (${duration}s)`, colors.red);
    log('Please check that LibGit2Sharp.NativeBinaries is properly included.', colors.yellow);
    log('='.repeat(60), colors.cyan);
    log('', colors.reset);
    process.exit(1);
  }
}

// Run script
try {
  main();
} catch (error) {
  log(`\nFatal error: ${error.message}`, colors.red);
  if (config.verbose) {
    console.error(error);
  }
  process.exit(2);
}
