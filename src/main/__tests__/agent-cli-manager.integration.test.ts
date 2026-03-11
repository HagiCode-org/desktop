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

describe('AgentCliManager integration', () => {
  it('builds copilot env with resolved executable path', async () => {
    const manager = new AgentCliManager(
      new InMemoryStore() as any,
      {
        loadRuntimeEnv: async () => ({ PATH: '/tmp/bin' }),
        resolveExecutablePath: async (candidates) => {
          assert.deepEqual(candidates, ['copilot', 'github-copilot-cli']);
          return '/usr/local/bin/copilot';
        },
      }
    );

    const env = await manager.buildWebServiceEnv(AgentCliType.CopilotCli);
    assert.equal(env.AI__Providers__DefaultProvider, 'GitHubCopilot');
    assert.equal(env.AI__Providers__Providers__GitHubCopilot__Enabled, 'true');
    assert.equal(env.AI__Providers__Providers__GitHubCopilot__ExecutablePath, '/usr/local/bin/copilot');
  });

  it('keeps copilot provider defaults when executable path is not resolved', async () => {
    const manager = new AgentCliManager(
      new InMemoryStore() as any,
      {
        loadRuntimeEnv: async () => ({ PATH: '/tmp/bin' }),
        resolveExecutablePath: async () => null,
      }
    );

    const env = await manager.buildWebServiceEnv(AgentCliType.CopilotCli);
    assert.equal(env.AI__Providers__DefaultProvider, 'GitHubCopilot');
    assert.equal(env.AI__Providers__Providers__GitHubCopilot__Enabled, 'true');
    assert.equal('AI__Providers__Providers__GitHubCopilot__ExecutablePath' in env, false);
  });
});
