import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import log from 'electron-log';
import type { DetectionResult, Region, RegionDetector } from './region-detector.js';
import {
  buildManagedPackageGlobalInstallCommand,
  findManagedNpmPackage,
} from '../shared/npm-managed-packages.js';
import type { PromptGuidanceSource } from '../types/prompt-guidance.js';
import type { Dependency, DependencyVersionWithRuntime, Manifest } from './manifest-reader.js';

export type LlmPromptRegionOverride = 'cn' | 'international';

export interface LlmPromptConfig {
  version: string;
  content: string;
  region: Region;
  filePath: string;
  source: Extract<PromptGuidanceSource, 'manifest-entry' | 'generated-from-manifest'>;
  detection: DetectionResult;
}

type DesktopPlatform = 'linux' | 'macos' | 'windows';

function resolvePromptDetection(
  regionDetector: Pick<RegionDetector, 'detectWithCache'>,
  overrideRegion?: LlmPromptRegionOverride,
): DetectionResult {
  if (overrideRegion) {
    return {
      region: overrideRegion === 'cn' ? 'CN' : 'INTERNATIONAL',
      detectedAt: new Date(),
      method: 'override',
      localeSnapshot: null,
      rawLocale: null,
      matchedRule: 'manual-override',
    };
  }

  return regionDetector.detectWithCache();
}

function getCurrentDesktopPlatform(): DesktopPlatform {
  switch (process.platform) {
    case 'darwin':
      return 'macos';
    case 'win32':
      return 'windows';
    default:
      return 'linux';
  }
}

function formatVersionLines(version: Dependency['version'], region: Region): string[] {
  const lines: string[] = [];
  const versionInfo = version as DependencyVersionWithRuntime;
  const source = versionInfo.runtime ?? versionInfo;
  const minLabel = region === 'CN' ? '最低版本' : 'Minimum version';
  const maxLabel = region === 'CN' ? '最高版本' : 'Maximum version';
  const recommendedLabel = region === 'CN' ? '推荐版本' : 'Recommended version';
  const exactLabel = region === 'CN' ? '固定版本' : 'Exact version';

  if (source.min) {
    lines.push(`${minLabel}: ${source.min}`);
  }
  if (source.max) {
    lines.push(`${maxLabel}: ${source.max}`);
  }
  if (source.recommended) {
    lines.push(`${recommendedLabel}: ${source.recommended}`);
  }
  if ('exact' in source && source.exact) {
    lines.push(`${exactLabel}: ${source.exact}`);
  }

  return lines;
}

function resolveInstallCommand(name: string, dependency: Dependency, region: Region): string | null {
  if (dependency.type !== 'npm') {
    return null;
  }

  const managedPackage = findManagedNpmPackage(name);
  if (managedPackage?.installSpec) {
    return buildManagedPackageGlobalInstallCommand(managedPackage);
  }

  if (dependency.installHint?.trim()) {
    return dependency.installHint.trim();
  }

  return region === 'CN'
    ? 'manifest 未提供可执行的 npm 包名，请不要猜测。'
    : 'The manifest does not provide an actionable npm package name. Do not guess.';
}

function getFallbackCheckCommand(name: string): string | null {
  const managedPackage = findManagedNpmPackage(name);
  if (managedPackage?.binName) {
    return `${managedPackage.binName} --version`;
  }

  if (name === 'node') {
    return 'node --version';
  }

  return null;
}

function formatDependencyBlock(name: string, dependency: Dependency, region: Region): string {
  const versionLines = formatVersionLines(dependency.version, region);
  const installCommand = resolveInstallCommand(name, dependency, region);
  const installHintLabel = region === 'CN' ? '安装提示' : 'Install hint';
  const descriptionLabel = region === 'CN' ? '描述' : 'Description';
  const checkLabel = region === 'CN' ? '检查命令' : 'Check command';
  const installCommandLabel = region === 'CN' ? '建议安装命令' : 'Suggested install command';
  const lines = [
    `### ${name}`,
    `- ${descriptionLabel}: ${dependency.description || name}`,
  ];

  if ('checkCommand' in dependency && typeof dependency.checkCommand === 'string' && dependency.checkCommand.trim()) {
    lines.push(`- ${checkLabel}: ${dependency.checkCommand}`);
  } else {
    const fallbackCheckCommand = getFallbackCheckCommand(name);
    if (fallbackCheckCommand) {
      lines.push(`- ${checkLabel}: ${fallbackCheckCommand}`);
    }
  }

  lines.push(...versionLines.map((line) => `- ${line}`));

  if (installCommand) {
    lines.push(`- ${installCommandLabel}: ${installCommand}`);
  } else if (dependency.installHint?.trim()) {
    lines.push(`- ${installHintLabel}: ${dependency.installHint.trim()}`);
  }

  if (dependency.type === 'system-requirement') {
    lines.push(region === 'CN'
      ? '- 仅做环境核对，不要编造自动安装命令。'
      : '- Treat this as an environment check only. Do not invent an automatic install command.');
  }

  return lines.join('\n');
}

function buildGeneratedPrompt(manifest: Manifest, region: Region): string {
  const version = manifest.package?.version || 'unknown';
  const platform = getCurrentDesktopPlatform();
  const dependencies = Object.entries(manifest.dependencies ?? {});
  const dependencySection = dependencies.length > 0
    ? dependencies
        .map(([name, dependency]) => formatDependencyBlock(name, dependency, region))
        .join('\n\n')
    : (region === 'CN'
        ? '- manifest 中没有可执行的依赖清单，请先确认发行包是否完整。\n- 不要猜测缺失的依赖项名称或安装命令。'
        : '- The manifest does not include actionable dependency entries.\n- Do not guess missing dependency names or install commands.');

  const platformLine = region === 'CN'
    ? `当前桌面端运行平台：${platform}。请只执行适用于该平台的命令。`
    : `Current desktop platform: ${platform}. Only execute commands that match this platform.`;

  if (region === 'CN') {
    return [
      '你正在协助安装 HagiCode Desktop 的版本依赖。',
      `目标版本：${version}`,
      platformLine,
      '请先阅读下面的依赖清单，再按顺序完成这些事情：',
      '1. 逐项检查依赖是否已经存在，并给出你实际执行的检查命令与结果。',
      '2. 如果某项缺失，只使用 manifest 已给出的安装提示或 Desktop 已知的包信息生成安装命令。',
      '3. 如果 manifest 没有提供足够信息，不要猜测包名；明确指出缺失信息并停止该项安装。',
      '4. 完成后输出最终状态摘要，标记已满足、已安装、仍阻塞的依赖。',
      '',
      '依赖清单：',
      dependencySection,
    ].join('\n');
  }

  return [
    'You are helping install runtime dependencies for a HagiCode Desktop package.',
    `Target version: ${version}`,
    platformLine,
    'Work through the manifest-driven dependency list in order:',
    '1. Check each dependency first and show the command you used plus the observed result.',
    '2. If a dependency is missing, only use install hints or Desktop-managed package metadata that are explicitly available.',
    '3. If the manifest does not provide enough information, do not guess package names; call out the missing data and stop that install step.',
    '4. Finish with a status summary that separates satisfied, installed, and still-blocked dependencies.',
    '',
    'Dependency list:',
    dependencySection,
  ].join('\n');
}

async function materializeGeneratedPrompt(
  manifestPath: string,
  version: string,
  region: Region,
  promptContent: string,
): Promise<string> {
  const cacheRoot = path.join(os.tmpdir(), 'hagicode-desktop-generated-prompts');
  const manifestHash = crypto.createHash('sha256').update(manifestPath).digest('hex').slice(0, 12);
  const promptDir = path.join(cacheRoot, `${version}-${manifestHash}`);
  const promptPath = path.join(
    promptDir,
    region === 'CN'
      ? 'dependency_install_llm_cn.generated.llm.txt'
      : 'dependency_install_llm_intl.generated.llm.txt',
  );

  await fs.mkdir(promptDir, { recursive: true });
  await fs.writeFile(promptPath, promptContent, 'utf-8');
  return promptPath;
}

export async function loadLlmPromptFromManifest(
  manifestPath: string,
  regionDetector: Pick<RegionDetector, 'detectWithCache'>,
  overrideRegion?: LlmPromptRegionOverride,
): Promise<LlmPromptConfig> {
  log.info('[LlmPromptLoader] Loading LLM prompt from manifest:', manifestPath);
  if (overrideRegion) {
    log.info('[LlmPromptLoader] Region override provided:', overrideRegion);
  }

  const manifestContent = await fs.readFile(manifestPath, 'utf-8');
  const manifest = JSON.parse(manifestContent) as Manifest;
  const detection = resolvePromptDetection(regionDetector, overrideRegion);
  const region = detection.region;
  log.info('[LlmPromptLoader] Using region:', {
    region,
    overrideRegion: overrideRegion ?? null,
    detectionMethod: detection.method,
    localeSnapshot: detection.localeSnapshot,
    rawLocale: detection.rawLocale,
    matchedRule: detection.matchedRule,
  });

  const promptPath = region === 'CN'
    ? manifest.entryPoint?.llmPrompt
    : manifest.entryPoint?.llmPromptIntl;
  const version = manifest.package?.version || 'unknown';
  const manifestDir = path.dirname(manifestPath);

  if (promptPath) {
    const resolvedPromptPath = path.resolve(manifestDir, promptPath);
    log.info('[LlmPromptLoader] Loading packaged prompt from:', resolvedPromptPath);

    try {
      const promptContent = await fs.readFile(resolvedPromptPath, 'utf-8');
      return {
        version,
        content: promptContent,
        region,
        filePath: resolvedPromptPath,
        source: 'manifest-entry',
        detection,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log.warn('[LlmPromptLoader] Packaged prompt could not be read, falling back to generated prompt:', {
        resolvedPromptPath,
        error: errorMessage,
      });
    }
  }

  const promptContent = buildGeneratedPrompt(manifest, region);
  const generatedPromptPath = await materializeGeneratedPrompt(manifestPath, version, region, promptContent);
  return {
    version,
    content: promptContent,
    region,
    filePath: generatedPromptPath,
    source: 'generated-from-manifest',
    detection,
  };
}
