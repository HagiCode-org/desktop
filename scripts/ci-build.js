#!/usr/bin/env node

/**
 * CI Build Helper Script
 *
 * Provides step-level timing, artifact delta reporting, and machine-readable
 * build reports for GitHub Actions and local CI troubleshooting.
 */

import { execa } from 'execa';
import fs from 'node:fs';
import path from 'node:path';

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
const buildRoots = ['dist', 'pkg'];
const maxDeltaPreview = 5;

const config = {
  platform: '',
  prod: false,
  targets: [],
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
  log('='.repeat(72), colors.cyan);
  log('CI Build Helper', colors.cyan);
  log('='.repeat(72), colors.cyan);
  log('', colors.cyan);

  if (isCI) {
    log('Running in CI Environment', colors.green);
    if (isGitHubActions) {
      log(`Repository: ${process.env.GITHUB_REPOSITORY || 'unknown'}`, colors.blue);
      log(`Workflow:   ${process.env.GITHUB_WORKFLOW || 'unknown'}`, colors.blue);
      log(`Run ID:     ${process.env.GITHUB_RUN_ID || 'unknown'}`, colors.blue);
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
  --target <name>              Package target override (repeatable or comma-separated)
  --prod                       Production build
  --help                       Show this help message

This script provides CI-specific build helpers, detailed timing, and
artifact delta reporting for automated build environments.
`);
}

function parseArgs() {
  for (let i = 0; i < args.length; i += 1) {
    switch (args[i]) {
      case '--platform':
        config.platform = args[++i];
        break;
      case '--prod':
        config.prod = true;
        break;
      case '--target': {
        const value = args[++i];
        if (!value) {
          log('Missing value for --target', colors.red);
          process.exit(1);
        }
        config.targets.push(...value.split(',').map((target) => target.trim()).filter(Boolean));
        break;
      }
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

function resolveConfiguredTargets() {
  return [...new Set(config.targets.map((target) => String(target).trim()).filter(Boolean))];
}

function resolveWindowsPackageTargets() {
  const targets = resolveConfiguredTargets();
  if (targets.length === 0) {
    return {
      forgeTargets: ['portable', 'nsis', 'msix'],
      packageOnly: false,
    };
  }

  const supportedTargets = new Set(['portable', 'nsis', 'msix']);
  const normalizedTargets = targets.map((target) => String(target).trim().toLowerCase()).filter(Boolean);
  const unsupportedTargets = normalizedTargets.filter((target) => !supportedTargets.has(target));

  if (unsupportedTargets.length > 0) {
    throw new Error(`Unsupported Windows package target(s): ${unsupportedTargets.join(', ')}. Supported targets: portable, nsis, msix.`);
  }

  return {
    forgeTargets: [...new Set(normalizedTargets)],
    packageOnly: false,
  };
}

function resolveLinuxPackageTargets() {
  const targets = resolveConfiguredTargets();
  if (targets.length === 0) {
    return ['appimage', 'tar.gz', 'zip'];
  }

  const supportedTargets = new Set(['appimage', 'tar.gz', 'zip']);
  const normalizedTargets = targets.map((target) => String(target).trim().toLowerCase()).filter(Boolean);
  const unsupportedTargets = normalizedTargets.filter((target) => !supportedTargets.has(target));

  if (unsupportedTargets.length > 0) {
    throw new Error(`Unsupported Linux package target(s): ${unsupportedTargets.join(', ')}. Supported targets: appimage, tar.gz, zip.`);
  }

  return [...new Set(normalizedTargets)];
}

function formatConfiguredTargets() {
  const targets = resolveConfiguredTargets();
  return targets.length > 0 ? targets.join(', ') : 'default';
}

function getTargetSlug() {
  const targets = resolveConfiguredTargets();
  if (targets.length === 0) {
    return '';
  }

  return targets
    .map((target) => target.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('-');
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
          relativeKey: `${sourceRoot}/${relativePath.replace(/\\/g, '/')}`,
          size: stats.size,
          mtimeMs: stats.mtimeMs,
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

  for (const root of buildRoots) {
    collectArtifactsFromRoot(path.join(process.cwd(), root), root, info);
  }

  return info;
}

function snapshotArtifacts() {
  const buildInfo = getBuildInfo();
  const artifactMap = new Map();
  for (const artifact of buildInfo.artifacts) {
    artifactMap.set(artifact.relativeKey, artifact);
  }

  return {
    roots: buildInfo.roots,
    artifactCount: buildInfo.artifacts.length,
    totalSize: buildInfo.totalSize,
    artifacts: buildInfo.artifacts,
    artifactMap,
  };
}

function diffArtifactSnapshots(before, after) {
  const added = [];
  const modified = [];
  const removed = [];

  for (const [key, artifact] of after.artifactMap.entries()) {
    const previous = before.artifactMap.get(key);
    if (!previous) {
      added.push(artifact);
      continue;
    }

    if (previous.size !== artifact.size || previous.mtimeMs !== artifact.mtimeMs) {
      modified.push({ before: previous, after: artifact });
    }
  }

  for (const [key, artifact] of before.artifactMap.entries()) {
    if (!after.artifactMap.has(key)) {
      removed.push(artifact);
    }
  }

  return {
    added,
    modified,
    removed,
    beforeCount: before.artifactCount,
    afterCount: after.artifactCount,
    beforeSize: before.totalSize,
    afterSize: after.totalSize,
    countDelta: after.artifactCount - before.artifactCount,
    sizeDelta: after.totalSize - before.totalSize,
  };
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatSignedSize(bytes) {
  const sign = bytes > 0 ? '+' : '';
  return `${sign}${formatSize(bytes)}`;
}

function formatDurationMs(durationMs) {
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function formatTimestamp(value) {
  return new Date(value).toISOString();
}

function formatArtifactLabel(artifact) {
  return `${artifact.relativeKey} (${formatSize(artifact.size)})`;
}

function renderArtifactPreview(label, entries, formatter) {
  if (entries.length === 0) {
    return [];
  }

  const lines = [`  ${label}: ${entries.length}`];
  for (const entry of entries.slice(0, maxDeltaPreview)) {
    lines.push(`    - ${formatter(entry)}`);
  }
  if (entries.length > maxDeltaPreview) {
    lines.push(`    - ... ${entries.length - maxDeltaPreview} more`);
  }
  return lines;
}

function printArtifactDelta(delta) {
  const hasChanges = delta.added.length > 0 || delta.modified.length > 0 || delta.removed.length > 0;
  if (!hasChanges) {
    log('Artifact delta: no changes detected', colors.gray);
    return;
  }

  log(
    `Artifact delta: +${delta.added.length} added, ~${delta.modified.length} modified, -${delta.removed.length} removed, size ${formatSignedSize(delta.sizeDelta)}`,
    colors.blue,
  );

  const lines = [
    ...renderArtifactPreview('Added', delta.added, formatArtifactLabel),
    ...renderArtifactPreview('Modified', delta.modified, (entry) => `${entry.after.relativeKey} (${formatSize(entry.before.size)} -> ${formatSize(entry.after.size)})`),
    ...renderArtifactPreview('Removed', delta.removed, formatArtifactLabel),
  ];

  for (const line of lines) {
    log(line, colors.gray);
  }
}

function printBuildSummary(stepResults = [], reportPath = null) {
  log('', colors.cyan);
  log('='.repeat(72), colors.cyan);
  log('Build Summary', colors.cyan);
  log('='.repeat(72), colors.cyan);

  const buildInfo = getBuildInfo();

  log('', colors.cyan);
  log('Configuration:', colors.cyan);
  log(`  Platform:     ${config.platform}`, colors.green);
  log(`  Targets:      ${formatConfiguredTargets()}`, colors.green);
  log(`  Production:   ${config.prod}`, colors.green);
  if (reportPath) {
    log(`  Build report: ${reportPath}`, colors.green);
  }

  if (stepResults.length > 0) {
    log('', colors.cyan);
    log('Step timings:', colors.cyan);
    for (const step of stepResults) {
      const color = step.status === 'success' ? colors.green : step.status === 'failed' ? colors.red : colors.yellow;
      const delta = step.artifactDelta
        ? `, +${step.artifactDelta.added.length}/~${step.artifactDelta.modified.length}/-${step.artifactDelta.removed.length}`
        : '';
      log(`  ${step.status.padEnd(7)} ${step.name} (${formatDurationMs(step.durationMs)})${delta}`, color);
    }
  }

  log('', colors.cyan);
  log('Artifacts:', colors.cyan);
  if (buildInfo.artifacts.length > 0) {
    const installers = buildInfo.artifacts.filter((artifact) =>
      artifact.path.endsWith('.exe') ||
      artifact.path.endsWith('.dmg') ||
      artifact.path.endsWith('.AppImage') ||
      artifact.path.endsWith('.msix') ||
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

  log('='.repeat(72), colors.cyan);
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

function resolveMacPackageTargets() {
  const targets = resolveConfiguredTargets();
  if (targets.length === 0) {
    return ['dmg', 'zip'];
  }

  const supportedTargets = new Set(['dmg', 'zip']);
  const normalizedTargets = targets.map((target) => String(target).trim().toLowerCase()).filter(Boolean);
  const unsupportedTargets = normalizedTargets.filter((target) => !supportedTargets.has(target));

  if (unsupportedTargets.length > 0) {
    throw new Error(`Unsupported macOS package target(s): ${unsupportedTargets.join(', ')}. Supported targets: dmg, zip.`);
  }

  return [...new Set(normalizedTargets)];
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
    const { forgeTargets } = resolveWindowsPackageTargets();
    const steps = [
      buildStep('npm', ['run', 'prepare:runtime'], 'Prepare embedded runtime'),
      buildStep('npm', ['run', 'prepare:bundled-toolchain'], 'Prepare bundled toolchain'),
      buildStep('npm', ['run', 'build:prod'], 'Build production assets'),
    ];

    steps.push(
      buildStep(
        'node',
        [
          'scripts/run-electron-forge.js',
          '--platform',
          'win32',
          '--arch',
          process.arch,
          '--targets',
          forgeTargets.join(','),
        ],
        `Package Windows artifacts (${forgeTargets.join(', ')})`,
      ),
    );

    steps.push(buildStep('npm', ['run', 'package:smoke-test'], 'Run packaged smoke test'));
    return steps;
  }

  if (config.platform === 'linux') {
    const targets = resolveLinuxPackageTargets();
    const steps = [
      buildStep('npm', ['run', 'prepare:runtime'], 'Prepare embedded runtime'),
      buildStep('npm', ['run', 'prepare:bundled-toolchain'], 'Prepare bundled toolchain'),
      buildStep('npm', ['run', 'build:prod'], 'Build production assets'),
      buildStep('node', ['scripts/run-electron-forge.js', '--platform', 'linux', '--arch', process.arch, '--targets', targets.join(',')], `Package Linux artifacts (${targets.join(', ')})`),
      buildStep('npm', ['run', 'package:verify-linux-unpacked'], 'Verify Linux unpacked package'),
      buildStep('npm', ['run', 'package:smoke-test'], 'Run packaged smoke test'),
    ];

    if (targets.some((target) => target === 'zip' || target === 'tar.gz')) {
      steps.push(buildStep('npm', ['run', 'package:verify-release-archives'], 'Verify release archives'));
    }

    return steps;
  }

  if (config.platform === 'mac') {
    const archs = resolveMacBuildArchs();
    if (archs.length === 0) {
      throw new Error('No valid macOS build architectures were requested. Use HAGICODE_MAC_BUILD_ARCHS=x64,arm64.');
    }

    const targets = resolveMacPackageTargets();
    return archs.flatMap((arch) => {
      const steps = [
        buildStep('npm', ['run', 'prepare:runtime'], 'Prepare embedded runtime'),
        buildStep('npm', ['run', 'prepare:bundled-toolchain'], 'Prepare bundled toolchain'),
        buildStep('npm', ['run', 'build:prod'], 'Build production assets'),
        buildStep(
          'node',
          ['scripts/run-electron-forge.js', '--platform', 'darwin', '--arch', arch, '--targets', targets.join(',')],
          `Package macOS artifacts (${arch} / ${targets.join(', ')})`,
        ),
        buildStep('npm', ['run', `package:smoke-test:mac:${arch}`], `Run packaged smoke test (${arch})`),
      ];

      if (targets.some((target) => target === 'zip')) {
        steps.push(buildStep('npm', ['run', `package:verify-release-archives:mac:${arch}`], `Verify release archives (${arch})`));
      }

      return steps;
    });
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
  const startedAtIso = formatTimestamp(startedAt);
  const title = `[${index + 1}/${total}] ${step.name}`;
  const beforeSnapshot = snapshotArtifacts();

  startGroup(title);
  log(`Step command: ${step.commandLine}`, colors.gray);
  log(`Started at: ${startedAtIso}`, colors.gray);
  log(
    `Artifacts before step: ${beforeSnapshot.artifactCount} file(s), ${formatSize(beforeSnapshot.totalSize)}`,
    colors.gray,
  );

  try {
    await executeCommand(step.command, step.args, { cwd: process.cwd() });

    const finishedAt = Date.now();
    const afterSnapshot = snapshotArtifacts();
    const artifactDelta = diffArtifactSnapshots(beforeSnapshot, afterSnapshot);
    const durationMs = finishedAt - startedAt;

    log(`Finished at: ${formatTimestamp(finishedAt)}`, colors.gray);
    log(
      `Artifacts after step: ${afterSnapshot.artifactCount} file(s), ${formatSize(afterSnapshot.totalSize)}`,
      colors.gray,
    );
    printArtifactDelta(artifactDelta);
    logCI(`${step.name} completed in ${formatDurationMs(durationMs)}`, 'notice');

    return {
      ...step,
      status: 'success',
      startedAt: startedAtIso,
      finishedAt: formatTimestamp(finishedAt),
      durationMs,
      artifactDelta,
    };
  } catch (error) {
    const finishedAt = Date.now();
    const afterSnapshot = snapshotArtifacts();
    const artifactDelta = diffArtifactSnapshots(beforeSnapshot, afterSnapshot);
    const durationMs = finishedAt - startedAt;

    log(`Finished at: ${formatTimestamp(finishedAt)}`, colors.gray);
    log(
      `Artifacts after failed step: ${afterSnapshot.artifactCount} file(s), ${formatSize(afterSnapshot.totalSize)}`,
      colors.gray,
    );
    printArtifactDelta(artifactDelta);
    logCI(`${step.name} failed after ${formatDurationMs(durationMs)}`, 'error');

    throw {
      cause: error,
      stepResult: {
        ...step,
        status: 'failed',
        startedAt: startedAtIso,
        finishedAt: formatTimestamp(finishedAt),
        durationMs,
        artifactDelta,
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
    startedAt: null,
    finishedAt: null,
    durationMs: 0,
    artifactDelta: {
      added: [],
      modified: [],
      removed: [],
      beforeCount: 0,
      afterCount: 0,
      beforeSize: 0,
      afterSize: 0,
      countDelta: 0,
      sizeDelta: 0,
    },
  }));

  return [...stepResults, ...remaining];
}

function printTimingSummary(stepResults, totalDurationMs) {
  log('', colors.magenta);
  log('Build timing breakdown:', colors.magenta);
  for (const step of stepResults) {
    const color = step.status === 'success' ? colors.green : step.status === 'failed' ? colors.red : colors.yellow;
    const window = step.startedAt && step.finishedAt ? ` ${step.startedAt} -> ${step.finishedAt}` : '';
    const delta = step.artifactDelta
      ? ` | +${step.artifactDelta.added.length}/~${step.artifactDelta.modified.length}/-${step.artifactDelta.removed.length} | ${formatSignedSize(step.artifactDelta.sizeDelta)}`
      : '';
    log(`  ${step.status.padEnd(7)} ${step.name} ${formatDurationMs(step.durationMs)}${delta}${window}`, color);
  }
  log(`  total   Build total ${formatDurationMs(totalDurationMs)}`, colors.blue);
}

function appendTimingSummary(stepResults, totalDurationMs, status, reportPath) {
  const lines = [
    `## CI build timing (${config.platform}${resolveConfiguredTargets().length > 0 ? ` / ${formatConfiguredTargets()}` : ''})`,
    '',
    `- Status: ${status}`,
    `- Total duration: ${formatDurationMs(totalDurationMs)}`,
    ...(reportPath ? [`- Report path: \`${reportPath}\``] : []),
    '',
    '| Step | Status | Started | Finished | Duration | Added | Modified | Removed | Size delta |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...stepResults.map((step) => {
      const delta = step.artifactDelta ?? { added: [], modified: [], removed: [], sizeDelta: 0 };
      return `| ${step.name} | ${step.status} | ${step.startedAt ?? '-'} | ${step.finishedAt ?? '-'} | ${formatDurationMs(step.durationMs)} | ${delta.added.length} | ${delta.modified.length} | ${delta.removed.length} | ${formatSignedSize(delta.sizeDelta)} |`;
    }),
    '',
  ];

  appendGitHubStepSummary(lines);
}

function ensureReportDirectory() {
  const candidateRoots = [path.join(process.cwd(), 'pkg'), path.join(process.cwd(), '.generated', 'ci-build')];
  for (const candidate of candidateRoots) {
    try {
      fs.mkdirSync(candidate, { recursive: true });
      return candidate;
    } catch {
      // Try the next location.
    }
  }

  throw new Error('Unable to create a writable CI build report directory.');
}

function writeBuildReport(stepResults, totalDurationMs, status) {
  const reportDirectory = ensureReportDirectory();
  const targetSlug = getTargetSlug();
  const reportPath = path.join(reportDirectory, `ci-build-report-${config.platform}${targetSlug ? `-${targetSlug}` : ''}.json`);
  const buildInfo = getBuildInfo();
  const payload = {
    platform: config.platform,
    targets: resolveConfiguredTargets(),
    production: config.prod,
    status,
    totalDurationMs,
    generatedAt: new Date().toISOString(),
    environment: {
      ci: isCI,
      githubActions: isGitHubActions,
      workflow: process.env.GITHUB_WORKFLOW ?? null,
      runId: process.env.GITHUB_RUN_ID ?? null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
      repository: process.env.GITHUB_REPOSITORY ?? null,
      ref: process.env.GITHUB_REF ?? null,
      sha: process.env.GITHUB_SHA ?? null,
    },
    steps: stepResults.map((step) => ({
      name: step.name,
      command: step.command,
      args: step.args,
      commandLine: step.commandLine,
      status: step.status,
      startedAt: step.startedAt,
      finishedAt: step.finishedAt,
      durationMs: step.durationMs,
      artifactDelta: {
        added: step.artifactDelta?.added.map((artifact) => ({ path: artifact.relativeKey, size: artifact.size })) ?? [],
        modified: step.artifactDelta?.modified.map((artifact) => ({
          path: artifact.after.relativeKey,
          previousSize: artifact.before.size,
          nextSize: artifact.after.size,
        })) ?? [],
        removed: step.artifactDelta?.removed.map((artifact) => ({ path: artifact.relativeKey, size: artifact.size })) ?? [],
        sizeDelta: step.artifactDelta?.sizeDelta ?? 0,
      },
    })),
    finalArtifacts: buildInfo.artifacts.map((artifact) => ({
      sourceRoot: artifact.sourceRoot,
      path: artifact.relativeKey,
      size: artifact.size,
      mtimeMs: artifact.mtimeMs,
    })),
    finalArtifactCount: buildInfo.artifacts.length,
    finalArtifactSize: buildInfo.totalSize,
  };

  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2));
  return reportPath;
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
    const reportPath = writeBuildReport(stepResults, durationMs, 'success');

    printTimingSummary(stepResults, durationMs);
    appendTimingSummary(stepResults, durationMs, 'success', reportPath);

    logCI(`Build completed in ${duration}s`, 'info');

    setGitHubOutput('build_duration', duration);
    setGitHubOutput('build_platform', config.platform);
    setGitHubOutput('build_targets', resolveConfiguredTargets().join(','));
    setGitHubOutput('build_status', 'success');
    setGitHubOutput('build_report_path', reportPath);

    printBuildSummary(stepResults, reportPath);

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
    const reportPath = writeBuildReport(summarizedSteps, durationMs, 'failed');
    printTimingSummary(summarizedSteps, durationMs);
    appendTimingSummary(summarizedSteps, durationMs, 'failed', reportPath);

    const failureMessage = error?.cause?.message || error?.message || 'Unknown build failure';
    const failedStepName = failedStep?.name ? ` during ${failedStep.name}` : '';
    logCI(`Build failed after ${duration}s${failedStepName}: ${failureMessage}`, 'error');

    setGitHubOutput('build_duration', duration);
    setGitHubOutput('build_platform', config.platform);
    setGitHubOutput('build_targets', resolveConfiguredTargets().join(','));
    setGitHubOutput('build_status', 'failed');
    setGitHubOutput('build_report_path', reportPath);

    printBuildSummary(summarizedSteps, reportPath);
    process.exit(1);
  }
}

main().catch((error) => {
  log(`Fatal error: ${error.message}`, colors.red);
  console.error(error);
  process.exit(1);
});
