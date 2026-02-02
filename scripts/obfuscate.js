#!/usr/bin/env node

/**
 * Code Obfuscation Script
 *
 * This script obfuscates JavaScript files in the dist directory
 * using javascript-obfuscator. It processes both main process
 * and renderer process code while respecting exclusion patterns.
 *
 * Usage:
 *   node scripts/obfuscate.js
 *   node scripts/obfuscate.js --dry-run
 *   node scripts/obfuscate.js --verbose
 */

const { Worker } = require('worker_threads');
const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

// Load configuration
const configFactory = require('../obfuscator.config.js');
const config = configFactory({ NODE_ENV: 'production' });

/**
 * File patterns to include/exclude
 */
const patterns = {
  include: [
    'dist/**/*.js',
  ],
  exclude: config.exclude || [],
};

/**
 * ANSI color codes for terminal output
 */
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
};

/**
 * Log messages with optional colors
 */
function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

/**
 * Get all JS files that should be obfuscated
 */
function getTargetFiles() {
  const allFiles = [];

  // Recursively scan the dist directory
  function scanDirectory(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(process.cwd(), fullPath);

      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.isFile() && fullPath.endsWith('.js')) {
        allFiles.push(relativePath);
      }
    }
  }

  const distPath = path.join(process.cwd(), 'dist');
  if (fs.existsSync(distPath)) {
    scanDirectory(distPath);
  }

  // Filter out excluded files
  const targetFiles = allFiles.filter(file => {
    return !patterns.exclude.some(pattern => {
      // Convert glob pattern to regex
      const regexPattern = pattern
        .replace(/\*\*/g, '.*')
        .replace(/\*/g, '[^/]*')
        .replace(/\?/g, '.');
      const regex = new RegExp(regexPattern);
      return regex.test(file);
    });
  });

  return targetFiles;
}

/**
 * Obfuscate a single file (worker-compatible)
 */
function obfuscateFile(filePath, source, config, isDryRun) {
  try {
    // Skip empty files or files with only whitespace
    if (!source.trim()) {
      return { skipped: true, filePath };
    }

    // Perform obfuscation
    const obfuscationResult = JavaScriptObfuscator.obfuscate(source, config);
    const obfuscatedCode = obfuscationResult.getObfuscatedCode();

    if (isDryRun) {
      return { dryRun: true, originalSize: source.length, obfuscatedSize: obfuscatedCode.length, filePath };
    }

    return {
      success: true,
      originalSize: source.length,
      obfuscatedSize: obfuscatedCode.length,
      filePath,
      obfuscatedCode,
    };

  } catch (error) {
    return { error: true, message: error.message, filePath };
  }
}

/**
 * Create a worker for obfuscation
 */
function createWorker(filePath, source, config, isDryRun) {
  return new Promise((resolve) => {
    const worker = new Worker(__filename, {
      workerData: { filePath, source, config, isDryRun, isWorker: true },
    });

    worker.on('message', resolve);
    worker.on('error', (error) => {
      resolve({ error: true, message: error.message, filePath });
    });
  });
}

/**
 * Process files in parallel using worker threads
 */
async function processFilesParallel(targetFiles, concurrency = 4) {
  const results = {
    success: 0,
    skipped: 0,
    error: 0,
    totalOriginalSize: 0,
    totalObfuscatedSize: 0,
  };

  let completed = 0;
  const total = targetFiles.length;

  // Process in batches
  for (let i = 0; i < total; i += concurrency) {
    const batch = targetFiles.slice(i, Math.min(i + concurrency, total));
    const workers = batch.map(filePath => {
      const source = fs.readFileSync(filePath, 'utf8');
      return createWorker(filePath, source, config, isDryRun);
    });

    const batchResults = await Promise.all(workers);

    for (const result of batchResults) {
      completed++;

      const status = result.error ? 'ERROR' : result.skipped ? 'SKIP ' : 'OK   ';
      const color = result.error ? colors.red : result.skipped ? colors.gray : colors.green;
      log(`  [${completed}/${total}] ${status} ${result.filePath}`, color);

      if (result.error) {
        results.error++;
      } else if (result.skipped) {
        results.skipped++;
      } else {
        results.success++;
        results.totalOriginalSize += result.originalSize || 0;
        results.totalObfuscatedSize += result.obfuscatedSize || 0;

        // Write obfuscated code back to file (only in main thread, not dry run)
        if (!isDryRun && result.obfuscatedCode) {
          fs.writeFileSync(result.filePath, result.obfuscatedCode, 'utf8');
        }
      }
    }
  }

  return results;
}

/**
 * Format file size for display
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Main execution function
 */
async function main() {
  const startTime = Date.now();

  log('='.repeat(60), colors.blue);
  log('Code Obfuscation Script', colors.blue);
  log('='.repeat(60), colors.blue);

  if (isDryRun) {
    log('Mode: DRY RUN (no files will be modified)', colors.yellow);
  }

  // Get target files
  log('\nScanning for JavaScript files...', colors.blue);
  const targetFiles = getTargetFiles();
  log(`Found ${targetFiles.length} files to obfuscate`, colors.green);

  // Determine concurrency based on CPU cores
  const os = require('os');
  const cpuCount = os.cpus().length;
  const concurrency = Math.max(2, Math.min(cpuCount - 1, 24));
  log(`Using ${concurrency} parallel workers (CPU cores: ${cpuCount})\n`, colors.blue);

  if (targetFiles.length === 0) {
    log('No files to obfuscate. Exiting.', colors.yellow);
    return;
  }

  // Process files in parallel
  const results = await processFilesParallel(targetFiles, concurrency);

  // Print summary
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  log('\n' + '='.repeat(60), colors.blue);
  log('Obfuscation Summary', colors.blue);
  log('='.repeat(60), colors.blue);
  log(`  Successfully obfuscated: ${results.success}`, colors.green);
  if (results.skipped > 0) {
    log(`  Skipped: ${results.skipped}`, colors.gray);
  }
  if (results.error > 0) {
    log(`  Errors: ${results.error}`, colors.red);
  }
  log(`  Duration: ${duration}s`, colors.blue);

  if (results.success > 0 && !isDryRun) {
    const sizeDiff = results.totalObfuscatedSize - results.totalOriginalSize;
    const sizePercent = ((sizeDiff / results.totalOriginalSize) * 100).toFixed(1);
    log(`  Original size: ${formatSize(results.totalOriginalSize)}`, colors.blue);
    log(`  Obfuscated size: ${formatSize(results.totalObfuscatedSize)}`, colors.blue);
    log(`  Size change: ${sizeDiff >= 0 ? '+' : ''}${formatSize(sizeDiff)} (${sizePercent}%)`,
      sizeDiff > 0 ? colors.yellow : colors.green);
  }

  log('='.repeat(60) + '\n', colors.blue);

  // Exit with appropriate code
  if (results.error > 0) {
    process.exit(1);
  }
}

/**
 * Worker entry point - runs when file is executed as a worker
 */
if (require('worker_threads').workerData?.isWorker) {
  const { filePath, source, config, isDryRun } = require('worker_threads').workerData;
  const result = obfuscateFile(filePath, source, config, isDryRun);
  require('worker_threads').parentPort.postMessage(result);
} else {
  // Run the script (main thread)
  main().catch(error => {
    log(`Fatal error: ${error.message}`, colors.red);
    console.error(error);
    process.exit(1);
  });
}
