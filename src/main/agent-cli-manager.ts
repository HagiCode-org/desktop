import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import log from 'electron-log';
import {
  AgentCliType,
  StoredAgentCliSelection,
  getCliCommandCandidates,
  getCliCommandName,
  getCliConfig,
  getCliExecutorType,
  sanitizeStoredAgentCliSelection,
} from '../types/agent-cli.js';
import { loadConsoleEnvironment } from './shell-env-loader.js';

const execAsync = promisify(exec);

function parseLookupOutput(stdout: string): string | null {
  const firstLine = stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line.length > 0);
  return firstLine || null;
}

async function resolveExecutablePath(
  commandCandidates: string[],
  env: NodeJS.ProcessEnv
): Promise<string | null> {
  const lookupCommand = process.platform === 'win32' ? 'where' : 'command -v';

  for (const candidate of commandCandidates) {
    try {
      const { stdout } = await execAsync(`${lookupCommand} ${candidate}`, {
        env,
        windowsHide: true,
      });
      const resolved = parseLookupOutput(stdout);
      if (resolved) {
        return resolved;
      }
    } catch {
      // Try next candidate until one resolves.
      continue;
    }
  }

  return null;
}

interface AgentCliManagerDeps {
  loadRuntimeEnv?: () => Promise<NodeJS.ProcessEnv>;
  resolveExecutablePath?: (commandCandidates: string[], env: NodeJS.ProcessEnv) => Promise<string | null>;
}

/**
 * AgentCliManager manages Agent CLI selection and detection
 * Simplified from ClaudeConfigManager - no API configuration, only CLI type
 */
export class AgentCliManager {
  private static readonly STORE_KEY = 'agentCliSelection';
  private readonly loadRuntimeEnv: () => Promise<NodeJS.ProcessEnv>;
  private readonly resolveExecutablePath: (commandCandidates: string[], env: NodeJS.ProcessEnv) => Promise<string | null>;

  constructor(private store: any, deps: AgentCliManagerDeps = {}) {
    this.loadRuntimeEnv = deps.loadRuntimeEnv ?? this.buildRuntimeEnv.bind(this);
    this.resolveExecutablePath = deps.resolveExecutablePath ?? resolveExecutablePath;
  }

  /**
   * Save Agent CLI selection to electron-store
   */
  async saveSelection(cliType: AgentCliType): Promise<void> {
    const selection: StoredAgentCliSelection = {
      cliType,
      isSkipped: false,
      selectedAt: new Date().toISOString(),
    };

    this.store.set(AgentCliManager.STORE_KEY, selection);
    log.info('[AgentCliManager] Saved Agent CLI selection:', cliType);
  }

  /**
   * Store skip flag in electron-store
   */
  async saveSkip(): Promise<void> {
    const selection: StoredAgentCliSelection = {
      cliType: null,
      isSkipped: true,
      selectedAt: new Date().toISOString(),
    };

    this.store.set(AgentCliManager.STORE_KEY, selection);
    log.info('[AgentCliManager] Saved skip flag');
  }

  /**
   * Load stored Agent CLI selection
   */
  loadSelection(): StoredAgentCliSelection {
    const rawSelection = this.store.get(AgentCliManager.STORE_KEY, {
      cliType: null,
      isSkipped: false,
      selectedAt: null,
    });
    return sanitizeStoredAgentCliSelection(rawSelection);
  }

  /**
   * Get the command name for a CLI type
   */
  getCommandName(cliType: AgentCliType): string {
    return getCliCommandName(cliType);
  }

  getCommandCandidates(cliType: AgentCliType): string[] {
    return getCliCommandCandidates(cliType);
  }

  /**
   * Get selected CLI type
   */
  getSelectedCliType(): AgentCliType | null {
    const selection = this.loadSelection();
    return selection.cliType;
  }

  /**
   * Map Agent CLI selection to backend default executor type.
   */
  getExecutorType(cliType: AgentCliType | null): string {
    if (!cliType) {
      return 'ClaudeCodeCli';
    }
    return getCliExecutorType(cliType);
  }

  /**
   * Resolve executor type from current persisted selection.
   */
  getSelectedExecutorType(): string {
    return this.getExecutorType(this.getSelectedCliType());
  }

  /**
   * Check if user skipped Agent CLI selection
   */
  isSkipped(): boolean {
    const selection = this.loadSelection();
    return selection.isSkipped;
  }

  async buildWebServiceEnv(cliType: AgentCliType | null): Promise<Record<string, string>> {
    if (!cliType) {
      return {
        AI__Providers__DefaultProvider: 'ClaudeCodeCli',
      };
    }

    const config = getCliConfig(cliType);
    const runtimeEnv = await this.loadRuntimeEnv();
    const executablePath = await this.resolveExecutablePath(config.commandCandidates, runtimeEnv);
    const env: Record<string, string> = {
      AI__Providers__DefaultProvider: config.executorType,
    };

    if (config.enabledEnvKey) {
      env[config.enabledEnvKey] = 'true';
    }

    if (config.executablePathEnvKey && executablePath) {
      env[config.executablePathEnvKey] = executablePath;
    }

    log.info('[AgentCliManager] Built web-service env from selection:', {
      cliType,
      executorType: config.executorType,
      executablePathResolved: Boolean(executablePath),
      executablePathEnvKey: config.executablePathEnvKey || null,
    });
    return env;
  }

  private async buildRuntimeEnv(): Promise<NodeJS.ProcessEnv> {
    const consoleEnv = await loadConsoleEnvironment();
    return {
      ...process.env,
      ...consoleEnv,
    };
  }
}

export default AgentCliManager;
