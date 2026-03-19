import fs from 'node:fs/promises';
import path from 'node:path';
import type { LlmInstallationManager } from './llm-installation-manager.js';
import type AgentCliManager from './agent-cli-manager.js';
import type {
  ActiveVersionContext,
  PromptResourceKey,
  PromptResourceResolver,
  PromptRuntimeContext,
} from './prompt-resource-resolver.js';
import { getAllCliConfigs } from '../types/agent-cli.js';
import type {
  PromptGuidanceEntryPoint,
  PromptGuidanceFailure,
  PromptGuidanceResponse,
  PromptGuidanceSuccess,
  PromptGuidanceTool,
} from '../types/prompt-guidance.js';
import type { AgentCliType } from '../types/agent-cli.js';

interface PromptGuidanceServiceDeps {
  promptResourceResolver?: PromptResourceResolver | null;
  llmInstallationManager?: LlmInstallationManager | null;
  agentCliManager?: AgentCliManager | null;
  readFile?: (filePath: string, encoding: BufferEncoding) => Promise<string>;
  resolveManifestPath?: (versionId: string) => string;
}

interface ResourceGuidanceInput {
  entryPoint: Extract<PromptGuidanceEntryPoint, 'smartConfig' | 'diagnosis'>;
  resourceKey: PromptResourceKey;
  runtime: PromptRuntimeContext;
  activeVersion?: ActiveVersionContext | null;
  customPromptPath?: string;
}

interface VersionGuidanceInput {
  versionId: string;
  region?: 'cn' | 'international';
}

export class PromptGuidanceService {
  private readonly readFile;
  private readonly resolveManifestPath;

  constructor(private readonly deps: PromptGuidanceServiceDeps) {
    this.readFile = deps.readFile ?? (async (filePath: string, encoding: BufferEncoding) => {
      return fs.readFile(filePath, encoding);
    });
    this.resolveManifestPath = deps.resolveManifestPath ?? ((versionId: string) => {
      throw new Error(`Manifest path resolver not configured for ${versionId}`);
    });
  }

  async buildResourceGuidance(input: ResourceGuidanceInput): Promise<PromptGuidanceResponse> {
    if (!this.deps.promptResourceResolver) {
      return this.createFailure({
        entryPoint: input.entryPoint,
        errorCode: 'RESOLVER_NOT_INITIALIZED',
        error: 'Prompt resource resolver not initialized',
        attemptedPaths: [],
        activeVersion: input.activeVersion?.id,
        suggestedWorkingDirectory: input.activeVersion?.installedPath,
      });
    }

    const resolution = await this.deps.promptResourceResolver.resolve({
      resourceKey: input.resourceKey,
      runtime: input.runtime,
      activeVersion: input.activeVersion,
      customPromptPath: input.customPromptPath,
    });

    if (!resolution.success) {
      return this.createFailure({
        entryPoint: input.entryPoint,
        errorCode: resolution.errorCode,
        error: resolution.error,
        attemptedPaths: resolution.attemptedPaths,
        activeVersion: resolution.activeVersion,
        suggestedWorkingDirectory: input.activeVersion?.installedPath,
      });
    }

    try {
      const promptContent = await this.readFile(resolution.resolvedPath, 'utf-8');
      return this.createSuccess({
        entryPoint: input.entryPoint,
        promptContent,
        promptPath: resolution.resolvedPath,
        promptSource: resolution.source,
        attemptedPaths: resolution.attemptedPaths,
        activeVersion: resolution.activeVersion,
        suggestedWorkingDirectory: input.activeVersion?.installedPath ?? path.dirname(resolution.resolvedPath),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createFailure({
        entryPoint: input.entryPoint,
        errorCode: 'PROMPT_READ_FAILED',
        error: errorMessage,
        attemptedPaths: resolution.attemptedPaths,
        activeVersion: resolution.activeVersion,
        suggestedWorkingDirectory: input.activeVersion?.installedPath ?? path.dirname(resolution.resolvedPath),
      });
    }
  }

  async buildVersionGuidance(input: VersionGuidanceInput): Promise<PromptGuidanceResponse> {
    if (!this.deps.llmInstallationManager) {
      return this.createFailure({
        entryPoint: 'versionDependencies',
        errorCode: 'MANAGER_NOT_INITIALIZED',
        error: 'LLM Installation Manager not initialized',
        attemptedPaths: [],
        activeVersion: input.versionId,
      });
    }

    let manifestPath: string | null = null;

    try {
      manifestPath = this.resolveManifestPath(input.versionId);
      const prompt = await this.deps.llmInstallationManager.loadPrompt(manifestPath, input.region);
      return this.createSuccess({
        entryPoint: 'versionDependencies',
        promptContent: prompt.content,
        promptPath: prompt.filePath,
        promptSource: 'manifest-entry',
        attemptedPaths: [manifestPath, prompt.filePath],
        activeVersion: input.versionId,
        suggestedWorkingDirectory: path.dirname(manifestPath),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return this.createFailure({
        entryPoint: 'versionDependencies',
        errorCode: 'PROMPT_LOAD_FAILED',
        error: errorMessage,
        attemptedPaths: manifestPath ? [manifestPath] : [],
        activeVersion: input.versionId,
      });
    }
  }

  private createSuccess(
    input: Omit<PromptGuidanceSuccess, 'success' | 'preferredCliType' | 'supportedTools'>,
  ): PromptGuidanceSuccess {
    return {
      success: true,
      ...input,
      ...this.getToolContext(),
    };
  }

  private createFailure(
    input: Omit<PromptGuidanceFailure, 'success' | 'preferredCliType' | 'supportedTools'>,
  ): PromptGuidanceFailure {
    return {
      success: false,
      ...input,
      ...this.getToolContext(),
    };
  }

  private getToolContext(): {
    preferredCliType: AgentCliType | null;
    supportedTools: PromptGuidanceTool[];
  } {
    return {
      preferredCliType: null,
      supportedTools: getAllCliConfigs().map((config) => ({
        cliType: config.cliType,
        displayName: config.displayName,
        description: config.description,
        commandName: config.commandName,
        docsUrl: config.docsUrl,
        providerId: config.providerId,
      })),
    };
  }
}
