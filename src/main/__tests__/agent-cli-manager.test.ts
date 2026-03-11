import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AgentCliManager } from '../agent-cli-manager.js';
import { AgentCliType } from '../../types/agent-cli.js';

class InMemoryStore {
  private values: Record<string, unknown> = {};

  set(key: string, value: unknown): void {
    this.values[key] = value;
  }

  get(key: string, defaultValue: unknown): unknown {
    return key in this.values ? this.values[key] : defaultValue;
  }
}

describe('AgentCliManager', () => {
  it('maps copilot CLI to command and executor type', () => {
    const manager = new AgentCliManager(new InMemoryStore() as any);

    assert.equal(manager.getCommandName(AgentCliType.CopilotCli), 'copilot');
    assert.deepEqual(manager.getCommandCandidates(AgentCliType.CopilotCli), ['copilot', 'github-copilot-cli']);
    assert.equal(manager.getExecutorType(AgentCliType.CopilotCli), 'GitHubCopilot');
  });

  it('keeps codex mapping unchanged', () => {
    const manager = new AgentCliManager(new InMemoryStore() as any);

    assert.equal(manager.getCommandName(AgentCliType.Codex), 'codex');
    assert.deepEqual(manager.getCommandCandidates(AgentCliType.Codex), ['codex']);
    assert.equal(manager.getExecutorType(AgentCliType.Codex), 'CodexCli');
  });

  it('falls back to ClaudeCodeCli when selection is missing', () => {
    const manager = new AgentCliManager(new InMemoryStore() as any);
    assert.equal(manager.getSelectedCliType(), null);
    assert.equal(manager.getSelectedExecutorType(), 'ClaudeCodeCli');
  });

  it('sanitizes invalid persisted CLI type', () => {
    const store = new InMemoryStore();
    store.set('agentCliSelection', {
      cliType: 'not-supported-cli',
      isSkipped: true,
      selectedAt: '2026-03-09T00:00:00.000Z',
    });

    const manager = new AgentCliManager(store as any);
    const selection = manager.loadSelection();

    assert.equal(selection.cliType, null);
    assert.equal(selection.isSkipped, true);
  });
});
