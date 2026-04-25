export type AgentCliId =
  | 'claude-code'
  | 'codex'
  | 'copilot'
  | 'codebuddy'
  | 'opencode'
  | 'qoder'
  | 'kiro-cli'
  | 'kimi'
  | 'gemini'
  | 'deepagents'
  | 'hermes';

export interface AgentCliDefinition {
  id: AgentCliId;
  displayName: string;
  descriptionKey: string;
  commandName: string;
  commandCandidates: string[];
  providerId: string;
  docsLinkId?: string;
}
