import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AgentCliType } from '../../../types/agent-cli.js';
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

  it('orders the preferred tool first without hard-coded page lists', () => {
    const tools: PromptGuidanceTool[] = [
      {
        cliType: AgentCliType.ClaudeCode,
        displayName: 'Claude Code',
        description: 'Claude',
        commandName: 'claude',
        providerId: 'claude-code',
      },
      {
        cliType: AgentCliType.Codex,
        displayName: 'Codex',
        description: 'Codex',
        commandName: 'codex',
        providerId: 'codex',
      },
    ];

    const ordered = orderPromptGuidanceTools(tools, AgentCliType.Codex);

    assert.deepEqual(ordered.map((tool) => tool.cliType), [AgentCliType.Codex, AgentCliType.ClaudeCode]);
  });

  it('formats prompt-guidance errors with attempted path diagnostics', () => {
    const guidance: PromptGuidanceFailure = {
      success: false,
      entryPoint: 'diagnosis',
      errorCode: 'PROMPT_NOT_FOUND',
      error: 'missing prompt',
      attemptedPaths: ['/one', '/two'],
      activeVersion: 'hagicode-1',
      preferredCliType: null,
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
