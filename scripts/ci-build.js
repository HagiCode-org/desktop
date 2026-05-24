#!/usr/bin/env node

/**
 * CI Build Helper Script
 *
 * This script assists with CI-specific build operations, providing
 * detailed logging and build status reporting for CI environments.
 *
 * Usage:
 *   node scripts/ci-build.js [options]
 *
 * Options:
 *   --platform <win|mac|linux>   Target platform
 *   --prod                        Production build
 *   --help                        Show help message
 */

import { execa } from 'execa';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);

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

const isCI = process.env.CI === 'true';
const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

const config = {
  platform: '',
  prod: false,
};

const macArchAliases = new Map([
  ['x64', 'x64'],
  ['amd64', 'x64'],
  ['intel', 'x64'],
  ['arm64', 'arm64'],
  ['aarch64', 'arm64'],
  ['apple-silicon', 'arm64'],
]);

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

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

function showHelp() {
  console.log(`
Usage: node scripts/ci-build.js [options]

Options:
  --platform <win|mac|linux>   Target platform
  --prod                        Production build
  --help                        Show this help message

This script provides CI-specific build helpers and detailed logging
for automated build environments.
`);
}

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

async function executeCommand(command, commandArgs, options = {}) {
  log(`Executing: ${command} ${commandArgs.join(' ')}`, colors.gray);

  const result = await execa(command, commandArgs, {
    stdin: 'ignore',
    stdout: 'inherit',
    stderr: 'inherit',
    shell: true,
    reject: false,
    ...options,
  });

  if (result.exitCode === 0) {
    return { code: result.exitCode };
  }

  throw new Error(`Command failed with exit code ${result.exitCode}`);
}

function collectArtifactsFromRoot(rootPath, sourceRoot, info) {
  if (!fs.existsSync(rootPath)) {
    return;
  }

  info.roots.push({ sourceRoot, rootPath });

  function walk(dir, basePath = '') {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.join(basePath, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath, relativePath);
      } else if (entry.isFile()) {
        const stats = fs.statSync(fullPath);
        info.artifacts.push({
          sourceRoot,
          path: relativePath,
          fullPath,
          size: stats.size,
        });
        info.totalSize += stats.size;
      }
    }
  }

  walk(rootPath);
}

function getBuildInfo() {
  const info = {
    roots: [],
    artifacts: [],
    totalSize: 0,
  };

  collectArtifactsFromRoot(path.join(process.cwd(), 'dist'), 'dist', info);
  collectArtifactsFromRoot(path.join(process.cwd(), 'pkg'), 'pkg', info);

  return info;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDurationMs(durationMs) {
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function printBuildSummary(stepResults = []) {
  log('', colors.cyan);
  log('='.repeat(60), colors.cyan);
  log('Build Summary', colors.cyan);
  log('='.repeat(60), colors.cyan);

  const buildInfo = getBuildInfo();

  log('', colors.cyan);
  log('Configuration:', colors.cyan);
  log(`  Platform:     ${config.platform}`, colors.green);
  log(`  Production:   ${config.prod}`, colors.green);

  if (stepResults.length > 0) {
    log('', colors.cyan);
    log('Step timings:', colors.cyan);
    for (const step of stepResults) {
      log(`  ${step.status.padEnd(7)} ${step.name} (${formatDurationMs(step.durationMs)})`, step.status === 'success' ? colors.green : step.status === 'failed' ? colors.red : colors.yellow);
    }
  }

  log('', colors.cyan);
  log('Artifacts:', colors.cyan);
  if (buildInfo.artifacts.length > 0) {
    const installers = buildInfo.artifacts.filter((artifact) =>
      artifact.path.endsWith('.exe') ||
      artifact.path.endsWith('.msix') ||
      artifact.path.endsWith('.dmg') ||
      artifact.path.endsWith('.AppImage') ||
      artifact.path.endsWith('.rpm') ||
      artifact.path.endsWith('.tar.gz') ||
      artifact.path.endsWith('.zip')
    );

    if (installers.length > 0) {
      log('', colors.cyan);
      log('Installers:', colors.cyan);
      for (const artifact of installers) {
        const fileName = path.basename(artifact.path);
        log(`  ${artifact.sourceRoot}/${fileName} (${formatSize(artifact.size)})`, colors.green);
      }
    }

    log('', colors.cyan);
    log(`Scanned roots: ${buildInfo.roots.map((root) => root.sourceRoot).join(', ')}`, colors.blue);
    log(`Total artifacts: ${buildInfo.artifacts.length}`, colors.blue);
    log(`Total size: ${formatSize(buildInfo.totalSize)}`, colors.blue);
  } else {
    log('  No artifacts found', colors.yellow);
  }

  log('='.repeat(60), colors.cyan);
  log('', colors.reset);
}

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

function appendGitHubStepSummary(lines) {
  if (!isGitHubActions || !process.env.GITHUB_STEP_SUMMARY) {
    return;
  }

  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`, 'utf8');
}

function normalizeMacArch(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return macArchAliases.get(normalized) || null;
}

function resolveDefaultMacArch() {
  const detected = normalizeMacArch(process.arch);
  if (!detected) {
    throw new Error(`Unsupported macOS build host architecture: ${process.arch}`);
  }
  return detected;
}

function resolveMacBuildArchs() {
  const raw = process.env.HAGICODE_MAC_BUILD_ARCHS?.trim();
  if (!raw) {
    return [resolveDefaultMacArch()];
  }

  const archs = raw
    .split(/[\s,]+/)
    .map(normalizeMacArch)
    .filter(Boolean);

  return [...new Set(archs)];
}

function buildStep(command, commandArgs, name) {
  return {
    name,
    command,
    args: commandArgs,
    commandLine: `${command} ${commandArgs.join(' ')}`,
  };
}

function getBuildSteps() {
  if (config.platform === 'win') {
    return [
      buildStep('npm', ['run', 'prepare:runtime'], 'Prepare embedded runtime'),
      buildStep('npm', ['run', 'prepare:bundled-toolchain'], 'Prepare bundled toolchain'),
      buildStep('npm', ['run', 'prepare:code-server-runtime'], 'Prepare code-server runtime'),
      buildStep('npm', ['run', 'prepare:omniroute-runtime'], 'Prepare OmniRoute runtime'),
      buildStep('npm', ['run', 'build:prod'], 'Build production assets'),
      buildStep('npx', ['electron-builder', '--win', '--publish', 'never'], 'Package Windows artifacts'),
      buildStep('npm', ['run', 'package:smoke-test'], 'Run packaged smoke test'),
    ];
  }

  if (config.platform === 'linux') {
    return [
      buildStep('npm', ['run', 'prepare:runtime'], 'Prepare embedded runtime'),
      buildStep('npm', ['run', 'prepare:bundled-toolchain'], 'Prepare bundled toolchain'),
      buildStep('npm', ['run', 'prepare:code-server-runtime'], 'Prepare code-server runtime'),
      buildStep('npm', ['run', 'prepare:omniroute-runtime'], 'Prepare OmniRoute runtime'),
      buildStep('npm', ['run', 'build:prod'], 'Build production assets'),
      buildStep('npx', ['electron-builder', '--linux', '--publish', 'never'], 'Package Linux artifacts'),
      buildStep('npm', ['run', 'package:verify-linux-unpacked'], 'Verify Linux unpacked package'),
      buildStep('npm', ['run', 'package:smoke-test'], 'Run packaged smoke test'),
      buildStep('npm', ['run', 'package:verify-release-archives'], 'Verify release archives'),
    ];
  }

  if (config.platform === 'mac') {
    const archs = resolveMacBuildArchs();
    if (archs.length === 0) {
      throw new Error('No valid macOS build architectures were requested. Use HAGICODE_MAC_BUILD_ARCHS=x64,arm64.');
    }

    return archs.map((arch) => buildStep('npm', ['run', `build:mac:${arch}`], `Build macOS (${arch})`));
  }

  throw new Error(`Unsupported build platform: ${config.platform}`);
}

function startGroup(title) {
  if (isGitHubActions) {
    logCI(title, 'group');
    return;
  }

  log('', colors.cyan);
  log(title, colors.cyan);
}

function endGroup() {
  if (isGitHubActions) {
    logCI('', 'endgroup');
  }
}

async function runBuildStep(step, index, total) {
  const startedAt = Date.now();
  const title = `[${index + 1}/${total}] ${step.name}`;
  startGroup(title);
  log(`Step command: ${step.commandLine}`, colors.gray);

  try {
    await executeCommand(step.command, step.args, {
      cwd: process.cwd(),
    });

    const durationMs = Date.now() - startedAt;
    logCI(`${step.name} completed in ${formatDurationMs(durationMs)}`, 'notice');
    return {
      ...step,
      status: 'success',
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logCI(`${step.name} failed after ${formatDurationMs(durationMs)}`, 'error');
    throw {
      cause: error,
      stepResult: {
        ...step,
        status: 'failed',
        durationMs,
      },
    };
  } finally {
    endGroup();
  }
}

function fillNotRunSteps(stepResults, buildSteps) {
  if (stepResults.length >= buildSteps.length) {
    return stepResults;
  }

  const remaining = buildSteps.slice(stepResults.length).map((step) => ({
    ...step,
    status: 'not_run',
    durationMs: 0,
  }));

  return [...stepResults, ...remaining];
}

function printTimingSummary(stepResults, totalDurationMs) {
  log('', colors.magenta);
  log('Build timing breakdown:', colors.magenta);
  for (const step of stepResults) {
    const color = step.status === 'success' ? colors.green : step.status === 'failed' ? colors.red : colors.yellow;
    log(`  ${step.status.padEnd(7)} ${step.name} ${formatDurationMs(step.durationMs)}`, color);
  }
  log(`  total   Build total ${formatDurationMs(totalDurationMs)}`, colors.blue);
}

function appendTimingSummary(stepResults, totalDurationMs, status) {
  const lines = [
    `## CI build timing (${config.platform})`,
    '',
    `- Status: ${status}`,
    `- Total duration: ${formatDurationMs(totalDurationMs)}`,
    '',
    '| Step | Status | Duration |',
    '| --- | --- | --- |',
    ...stepResults.map((step) => `| ${step.name} | ${step.status} | ${formatDurationMs(step.durationMs)} |`),
    '',
  ];

  appendGitHubStepSummary(lines);
}

async function main() {
  const startTime = Date.now();

  printBanner();
  parseArgs();

  logCI('Starting CI build process...', 'info');

  const buildSteps = getBuildSteps();
  const stepResults = [];

  try {
    logCI(`Planned ${buildSteps.length} build step(s) for platform ${config.platform}`, 'notice');

    for (let index = 0; index < buildSteps.length; index += 1) {
      const stepResult = await runBuildStep(buildSteps[index], index, buildSteps.length);
      stepResults.push(stepResult);
    }

    const durationMs = Date.now() - startTime;
    const duration = (durationMs / 1000).toFixed(2);

    printTimingSummary(stepResults, durationMs);
    appendTimingSummary(stepResults, durationMs, 'success');

    logCI(`Build completed in ${duration}s`, 'info');

    setGitHubOutput('build_duration', duration);
    setGitHubOutput('build_platform', config.platform);
    setGitHubOutput('build_status', 'success');

    printBuildSummary(stepResults);

    logCI('Build process completed successfully', 'info');
    process.exit(0);
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const duration = (durationMs / 1000).toFixed(2);

    const failedStep = error?.stepResult;
    if (failedStep) {
      stepResults.push(failedStep);
    }

    const summarizedSteps = fillNotRunSteps(stepResults, buildSteps);
    printTimingSummary(summarizedSteps, durationMs);
    appendTimingSummary(summarizedSteps, durationMs, 'failed');

    const failureMessage = error?.cause?.message || error?.message || 'Unknown build failure';
    const failedStepName = failedStep?.name ? ` during ${failedStep.name}` : '';
    logCI(`Build failed after ${duration}s${failedStepName}: ${failureMessage}`, 'error');

    setGitHubOutput('build_duration', duration);
    setGitHubOutput('build_platform', config.platform);
    setGitHubOutput('build_status', 'failed');

    process.exit(1);
  }
}

main().catch((error) => {
  log(`Fatal error: ${error.message}`, colors.red);
  console.error(error);
  process.exit(1);
});
