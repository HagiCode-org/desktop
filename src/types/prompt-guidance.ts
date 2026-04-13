import type { AgentCliType } from './agent-cli.js';

export type PromptGuidanceEntryPoint = 'smartConfig' | 'versionDependencies';
export type PromptGuidanceSource =
  | 'custom'
  | 'active-version'
  | 'packaged-resource'
  | 'development-root'
  | 'manifest-entry';
export type PromptGuidanceErrorCode =
  | 'INVALID_PROMPT_PATH'
  | 'PROMPT_NOT_FOUND'
  | 'MANAGER_NOT_INITIALIZED'
  | 'RESOLVER_NOT_INITIALIZED'
  | 'PROMPT_READ_FAILED'
  | 'PROMPT_LOAD_FAILED'
  | 'MANIFEST_PATH_NOT_FOUND';

export interface PromptGuidanceTool {
  cliType: AgentCliType;
  displayName: string;
  description: string;
  commandName: string;
  docsUrl?: string;
  providerId: string;
}

interface PromptGuidanceBase {
  entryPoint: PromptGuidanceEntryPoint;
  attemptedPaths: string[];
  activeVersion?: string;
  preferredCliType: AgentCliType | null;
  supportedTools: PromptGuidanceTool[];
  suggestedWorkingDirectory?: string;
}

export interface PromptGuidanceSuccess extends PromptGuidanceBase {
  success: true;
  error?: never;
  errorCode?: never;
  promptContent: string;
  promptPath: string;
  promptSource: PromptGuidanceSource;
}

export interface PromptGuidanceFailure extends PromptGuidanceBase {
  success: false;
  error: string;
  errorCode: PromptGuidanceErrorCode;
  promptContent?: never;
  promptPath?: never;
  promptSource?: never;
}

export type PromptGuidanceResponse = PromptGuidanceSuccess | PromptGuidanceFailure;
