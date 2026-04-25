import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PromptGuidanceFailure, PromptGuidanceTool } from '../../../types/prompt-guidance.js';
import {
  copyPromptContent,
  formatPromptGuidanceError,
  orderPromptGuidanceTools,
} from './promptGuidanceModel.js';

describe('promptGuidanceModel', () => {
  it('copies the full prompt text through the provided writer', async () => {
    let copiedValue = '';

    const result = await copyPromptContent('line 1\nline 2', async (value) => {
      copiedValue = value;
    });

    assert.equal(result.success, true);
    assert.equal(copiedValue, 'line 1\nline 2');
  });

  it('preserves the registry order without introducing a preferred tool state', () => {
    const tools: PromptGuidanceTool[] = [
      {
        cliType: 'kiro-cli',
        displayName: 'Kiro',
        description: 'Kiro',
        commandName: 'kiro-cli',
        providerId: 'kiro-cli',
      },
      {
        cliType: 'claude-code',
        displayName: 'Claude Code',
        description: 'Claude',
        commandName: 'claude',
        providerId: 'claude-code',
      },
      {
        cliType: 'codex',
        displayName: 'Codex',
        description: 'Codex',
        commandName: 'codex',
        providerId: 'codex',
      },
    ];

    const ordered = orderPromptGuidanceTools(tools);

    assert.deepEqual(ordered.map((tool) => tool.cliType), ['kiro-cli', 'claude-code', 'codex']);
  });

  it('formats prompt-guidance errors with attempted path diagnostics', () => {
    const guidance: PromptGuidanceFailure = {
      success: false,
      entryPoint: 'smartConfig',
      errorCode: 'PROMPT_NOT_FOUND',
      error: 'missing prompt',
      attemptedPaths: ['/one', '/two'],
      activeVersion: 'hagicode-1',
      supportedTools: [],
    };

    const message = formatPromptGuidanceError(guidance, {
      defaultMessage: 'default',
      promptNotFound: 'not found',
      resolverUnavailable: 'resolver',
      managerUnavailable: 'manager',
      promptLoadFailed: 'load failed',
      promptReadFailed: 'read failed',
      diagnosticPrefix: 'Paths: ',
    });

    assert.equal(message, 'not found Paths: /one | /two');
  });
});
