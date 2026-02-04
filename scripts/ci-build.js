#!/usr/bin/env node

/**
 * CI Build Helper Script
 *
 * This script assists with CI-specific build operations, providing
 * detailed logging and build status reporting for CI environments.
 *
 * Usage:
 *   node client/scripts/ci-build.js [options]
 *
 * Options:
 *   --platform <win|mac|linux>   Target platform
 *   --prod                        Production build
 *   --help                        Show help message
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

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
  magenta: '\x1b[35m',
};

/**
 * Check if running in CI environment
 */
const isCI = process.env.CI === 'true';
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

/**
 * Configuration
 */
const config = {
  platform: '',
  prod: false,
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
 * Print banner
 */
function printBanner() {
  log('', colors.cyan);
  log('='.repeat(60), colors.cyan);
  log('CI Build Helper', colors.cyan);
  log('='.repeat(60), colors.cyan);
  log('', colors.cyan);

  if (isCI) {
    log('Running in CI Environment', colors.green);
    if (isGitHubActions) {
      log(`GitHub Actions: ${process.env.GITHUB_REPO || 'unknown'}`, colors.blue);
      log(`Workflow: ${process.env.GITHUB_WORKFLOW || 'unknown'}`, colors.blue);
      log(`Run ID: ${process.env.GITHUB_RUN_ID || 'unknown'}`, colors.blue);
    }
  } else {
    log('Running in Local Environment', colors.yellow);
  }
  log('', colors.reset);
}

/**
 * Show help message
 */
function showHelp() {
  console.log(`
Usage: node client/scripts/ci-build.js [options]

Options:
  --platform <win|mac|linux>   Target platform
  --prod                        Production build
  --help                        Show this help message

This script provides CI-specific build helpers and detailed logging
for automated build environments.
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
      case '--prod':
        config.prod = true;
        break;
      case '--help':
        showHelp();
        process.exit(0);
      default:
        log(`Unknown option: ${args[i]}`, colors.red);
        showHelp();
        process.exit(1);
    }
  }

  // Auto-detect platform if not specified
  if (!config.platform) {
    const platform = process.platform;
    if (platform === 'win32') {
      config.platform = 'win';
    } else if (platform === 'darwin') {
      config.platform = 'mac';
    } else {
      config.platform = 'linux';
    }
    log(`Auto-detected platform: ${config.platform}`, colors.blue);
  }
}

/**
 * Execute a command and return the result
 */
function executeCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    log(`Executing: ${command} ${args.join(' ')}`, colors.gray);

    const child = spawn(command, args, {
      stdio: isCI ? 'pipe' : 'inherit',
      shell: true,
      ...options,
    });

    let stdout = '';
    let stderr = '';

    if (isCI) {
      child.stdout?.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        process.stdout.write(text);
      });

      child.stderr?.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        process.stderr.write(text);
      });
    }

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, code });
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    child.on('error', (error) => {
      reject(error);
    });
  });
}

/**
 * Get build output information
 */
function getBuildInfo() {
  const distPath = path.join(process.cwd(), 'dist');
  const info = {
    distPath,
    artifacts: [],
    totalSize: 0,
  };

  if (!fs.existsSync(distPath)) {
    return info;
  }

  // Collect all build artifacts
  function collectArtifacts(dir, basePath = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.join(basePath, entry.name);

      if (entry.isDirectory()) {
        collectArtifacts(fullPath, relativePath);
      } else if (entry.isFile()) {
        const stats = fs.statSync(fullPath);
        info.artifacts.push({
          path: relativePath,
          fullPath,
          size: stats.size,
        });
        info.totalSize += stats.size;
      }
    }
  }

  collectArtifacts(distPath);

  return info;
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
 * Print build summary
 */
function printBuildSummary() {
  log('', colors.cyan);
  log('='.repeat(60), colors.cyan);
  log('Build Summary', colors.cyan);
  log('='.repeat(60), colors.cyan);

  const buildInfo = getBuildInfo();

  log('', colors.cyan);
  log('Configuration:', colors.cyan);
  log(`  Platform:     ${config.platform}`, colors.green);
  log(`  Production:   ${config.prod}`, colors.green);

  log('', colors.cyan);
  log('Artifacts:', colors.cyan);
  if (buildInfo.artifacts.length > 0) {
    // Group artifacts by type
    const installers = buildInfo.artifacts.filter(a =>
      a.path.endsWith('.exe') ||
      a.path.endsWith('.appx') ||
      a.path.endsWith('.dmg') ||
      a.path.endsWith('.AppImage') ||
      a.path.endsWith('.deb') ||
      a.path.endsWith('.rpm') ||
      a.path.endsWith('.tar.gz') ||
      a.path.endsWith('.zip')
    );

    if (installers.length > 0) {
      log('', colors.cyan);
      log('Installers:', colors.cyan);
      for (const artifact of installers) {
        const fileName = path.basename(artifact.path);
        log(`  ${fileName} (${formatSize(artifact.size)})`, colors.green);
      }
    }

    log('', colors.cyan);
    log(`Total artifacts: ${buildInfo.artifacts.length}`, colors.blue);
    log(`Total size: ${formatSize(buildInfo.totalSize)}`, colors.blue);
  } else {
    log('  No artifacts found', colors.yellow);
  }

  log('='.repeat(60), colors.cyan);
  log('', colors.reset);
}

/**
 * Set GitHub Actions output
 */
function setGitHubOutput(name, value) {
  if (isGitHubActions && process.env.GITHUB_OUTPUT) {
    const outputPath = process.env.GITHUB_OUTPUT;
    try {
      fs.appendFileSync(outputPath, `${name}=${value}\n`);
      log(`Set output ${name}=${value}`, colors.gray);
    } catch (error) {
      log(`Failed to set output: ${error.message}`, colors.yellow);
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  const startTime = Date.now();

  printBanner();
  parseArgs();

  logCI('Starting CI build process...', 'info');

  try {
    // Build using the unified build script
    const buildArgs = ['scripts/build.sh'];

    if (config.platform) {
      buildArgs.push('--platform', config.platform);
    }
    if (config.prod) {
      buildArgs.push('--prod');
    }

    logCI(`Executing: ${buildArgs.join(' ')}`, 'info');

    await executeCommand('bash', buildArgs, {
      cwd: path.join(process.cwd(), '..'),
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logCI(`Build completed in ${duration}s`, 'info');

    // Set GitHub Actions outputs
    setGitHubOutput('build_duration', duration);
    setGitHubOutput('build_platform', config.platform);
    setGitHubOutput('build_status', 'success');

    printBuildSummary();

    logCI('Build process completed successfully', 'info');
    process.exit(0);

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    logCI(`Build failed after ${duration}s: ${error.message}`, 'error');

    // Set GitHub Actions outputs
    setGitHubOutput('build_duration', duration);
    setGitHubOutput('build_platform', config.platform);
    setGitHubOutput('build_status', 'failed');

    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  log(`Fatal error: ${error.message}`, colors.red);
  console.error(error);
  process.exit(1);
});
