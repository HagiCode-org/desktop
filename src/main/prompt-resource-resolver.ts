import fs from 'node:fs/promises';
import path from 'node:path';

export type PromptResourceKey = 'smartConfig';
export type PromptSource = 'custom' | 'active-version' | 'packaged-resource' | 'development-root';
export type PromptResolveErrorCode = 'INVALID_PROMPT_PATH' | 'PROMPT_NOT_FOUND';

export interface ActiveVersionContext {
  id: string;
  installedPath: string;
}

export interface PromptRuntimeContext {
  isPackaged: boolean;
  appPath: string;
  cwd: string;
  processResourcesPath?: string;
}

export interface PromptResolveSuccess {
  success: true;
  resourceKey: PromptResourceKey;
  resolvedPath: string;
  source: PromptSource;
  attemptedPaths: string[];
  activeVersion?: string;
}

export interface PromptResolveFailure {
  success: false;
  resourceKey: PromptResourceKey;
  errorCode: PromptResolveErrorCode;
  error: string;
  attemptedPaths: string[];
  activeVersion?: string;
}

export type PromptResolveResult = PromptResolveSuccess | PromptResolveFailure;

interface ResolveInput {
  resourceKey: PromptResourceKey;
  runtime: PromptRuntimeContext;
  activeVersion?: ActiveVersionContext | null;
  customPromptPath?: string;
}

const RESOURCE_RELATIVE_PATH: Record<PromptResourceKey, string> = {
  smartConfig: path.join('config', 'config-prompt.llm.txt'),
};

export class PromptResourceResolver {
  constructor(
    private readonly pathExists: (filePath: string) => Promise<boolean> = async (filePath: string) => {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    },
  ) {}

  async resolve(input: ResolveInput): Promise<PromptResolveResult> {
    const attemptedPaths: string[] = [];
    const relativePath = RESOURCE_RELATIVE_PATH[input.resourceKey];

    if (input.customPromptPath?.trim()) {
      const normalizedCustomPath = path.resolve(input.customPromptPath.trim());
      attemptedPaths.push(normalizedCustomPath);
      if (await this.pathExists(normalizedCustomPath)) {
        return {
          success: true,
          resourceKey: input.resourceKey,
          resolvedPath: normalizedCustomPath,
          source: 'custom',
          attemptedPaths,
          activeVersion: input.activeVersion?.id,
        };
      }

      return {
        success: false,
        resourceKey: input.resourceKey,
        errorCode: 'INVALID_PROMPT_PATH',
        error: `Prompt file not found: ${normalizedCustomPath}`,
        attemptedPaths,
        activeVersion: input.activeVersion?.id,
      };
    }

    const candidates = this.getCandidatePaths(input.runtime, relativePath, input.activeVersion);
    for (const candidate of candidates) {
      attemptedPaths.push(candidate.path);
      if (await this.pathExists(candidate.path)) {
        return {
          success: true,
          resourceKey: input.resourceKey,
          resolvedPath: candidate.path,
          source: candidate.source,
          attemptedPaths,
          activeVersion: input.activeVersion?.id,
        };
      }
    }

    return {
      success: false,
      resourceKey: input.resourceKey,
      errorCode: 'PROMPT_NOT_FOUND',
      error: `Prompt file not found for ${input.resourceKey}`,
      attemptedPaths,
      activeVersion: input.activeVersion?.id,
    };
  }

  private getCandidatePaths(
    runtime: PromptRuntimeContext,
    relativePath: string,
    activeVersion?: ActiveVersionContext | null,
  ): Array<{ path: string; source: PromptSource }> {
    const candidates: Array<{ path: string; source: PromptSource }> = [];
    const seen = new Set<string>();
    const pushUnique = (candidatePath: string, source: PromptSource) => {
      const normalizedPath = path.normalize(candidatePath);
      if (!seen.has(normalizedPath)) {
        seen.add(normalizedPath);
        candidates.push({ path: normalizedPath, source });
      }
    };

    if (activeVersion?.installedPath) {
      pushUnique(path.join(activeVersion.installedPath, relativePath), 'active-version');
    }

    if (runtime.isPackaged) {
      if (runtime.processResourcesPath) {
        pushUnique(path.join(runtime.processResourcesPath, relativePath), 'packaged-resource');
        pushUnique(path.join(runtime.processResourcesPath, 'app.asar.unpacked', relativePath), 'packaged-resource');
      }
      pushUnique(path.join(runtime.appPath, relativePath), 'packaged-resource');
    } else {
      pushUnique(path.join(runtime.appPath, relativePath), 'development-root');
    }

    pushUnique(path.join(runtime.cwd, relativePath), 'development-root');

    return candidates;
  }
}
