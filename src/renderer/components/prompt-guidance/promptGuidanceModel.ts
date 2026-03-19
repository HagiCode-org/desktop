import type {
  PromptGuidanceFailure,
  PromptGuidanceResponse,
  PromptGuidanceTool,
} from '../../../types/prompt-guidance.js';

interface CopyPromptResult {
  success: boolean;
  error?: string;
}

interface PromptGuidanceErrorLabels {
  defaultMessage: string;
  promptNotFound: string;
  resolverUnavailable: string;
  managerUnavailable: string;
  promptLoadFailed: string;
  promptReadFailed: string;
  diagnosticPrefix: string;
}

export function orderPromptGuidanceTools(
  tools: PromptGuidanceTool[],
  preferredCliType: PromptGuidanceResponse['preferredCliType'],
): PromptGuidanceTool[] {
  return [...tools].sort((left, right) => {
    if (left.cliType === preferredCliType && right.cliType !== preferredCliType) {
      return -1;
    }
    if (right.cliType === preferredCliType && left.cliType !== preferredCliType) {
      return 1;
    }
    return left.displayName.localeCompare(right.displayName);
  });
}

export async function copyPromptContent(
  promptContent: string,
  writeText: (value: string) => Promise<void>,
): Promise<CopyPromptResult> {
  try {
    await writeText(promptContent);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function formatPromptGuidanceError(
  guidance: PromptGuidanceFailure,
  labels: PromptGuidanceErrorLabels,
): string {
  const baseMessage = (() => {
    switch (guidance.errorCode) {
      case 'PROMPT_NOT_FOUND':
      case 'INVALID_PROMPT_PATH':
        return labels.promptNotFound;
      case 'RESOLVER_NOT_INITIALIZED':
        return labels.resolverUnavailable;
      case 'MANAGER_NOT_INITIALIZED':
        return labels.managerUnavailable;
      case 'PROMPT_LOAD_FAILED':
        return labels.promptLoadFailed;
      case 'PROMPT_READ_FAILED':
        return labels.promptReadFailed;
      default:
        return guidance.error || labels.defaultMessage;
    }
  })();

  if (!guidance.attemptedPaths.length) {
    return baseMessage;
  }

  return `${baseMessage} ${labels.diagnosticPrefix}${guidance.attemptedPaths.join(' | ')}`;
}
