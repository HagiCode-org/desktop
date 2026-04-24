import type { AgentCliType } from './agent-cli.js';

export const systemDiagnosticChannels = {
  run: 'system-diagnostic:run',
  getLast: 'system-diagnostic:get-last',
} as const;

export type SystemDiagnosticChannelMap = typeof systemDiagnosticChannels;

export type SystemDiagnosticOverallStatus = 'success' | 'partial-failure';
export type SystemDiagnosticIssueKind = 'missing' | 'error';
export type SystemDiagnosticCommandStatus = 'available' | 'missing' | 'error';
export type SystemDiagnosticAgentCliStatus = 'available' | 'missing' | 'error';
export type SystemDiagnosticCommandScope = 'required-by-core-runtime';

export interface SystemDiagnosticCoverageMatrix {
  auditedConsumers: string[];
  requiredCommands: string[];
  notes: string[];
}

export interface SystemDiagnosticMeta {
  generatedAt: string;
  completedAt: string;
  platform: NodeJS.Platform;
  architecture: string;
  hostname: string;
}

export interface SystemDiagnosticSystemInfo {
  osName: string;
  osVersion: string | null;
  osRelease: string;
  shell: string | null;
}

export interface SystemDiagnosticHardwareInfo {
  cpuModel: string | null;
  cpuCores: number | null;
  cpuArchitecture: string;
  memoryTotalGb: string;
  memoryFreeGb: string;
}

export interface SystemDiagnosticAgentCliProbe {
  cliType: AgentCliType;
  displayName: string;
  status: SystemDiagnosticAgentCliStatus;
  commandCandidates: string[];
  resolvedPath: string | null;
  version: string | null;
  message: string | null;
}

export interface SystemDiagnosticAgentCliInfo {
  probes: SystemDiagnosticAgentCliProbe[];
}

export interface SystemDiagnosticCommandProbe {
  command: string;
  displayName: string;
  scope: SystemDiagnosticCommandScope;
  status: SystemDiagnosticCommandStatus;
  candidateCommands: string[];
  resolvedPath: string | null;
  version: string | null;
  message: string | null;
}

export interface SystemDiagnosticBundledToolchainInfo {
  available: boolean;
  integrity: string;
  platform: string;
  toolchainRoot: string;
  manifestPath: string;
  runtimeManifestPath: string;
  remediation: string;
  activeForDesktop: boolean;
  activationSource: string;
  commands: Record<string, string | null>;
  packages: Record<string, { packageName: string; version: string | null; integrity?: string }>;
  errors: string[];
}

export interface SystemDiagnosticWindowsCodePageInfo {
  activeCodePage: string | null;
  outputEncoding: string | null;
  shell: string | null;
}

export interface SystemDiagnosticIssue {
  section: string;
  key: string;
  kind: SystemDiagnosticIssueKind;
  message: string;
}

export interface SystemDiagnosticData {
  meta: SystemDiagnosticMeta;
  system: SystemDiagnosticSystemInfo;
  hardware: SystemDiagnosticHardwareInfo;
  agentCli: SystemDiagnosticAgentCliInfo;
  toolchain: SystemDiagnosticCommandProbe[];
  bundledToolchain?: SystemDiagnosticBundledToolchainInfo;
  windowsCodePage?: SystemDiagnosticWindowsCodePageInfo;
  issues: SystemDiagnosticIssue[];
}

export interface SystemDiagnosticSummary {
  status: SystemDiagnosticOverallStatus;
  completedAt: string;
  errorCount: number;
  sectionCount: number;
}

export interface SystemDiagnosticResult {
  report: string;
  summary: SystemDiagnosticSummary;
  data: SystemDiagnosticData;
  coverage: SystemDiagnosticCoverageMatrix;
}

export interface SystemDiagnosticBridge {
  run: () => Promise<SystemDiagnosticResult>;
  getLast: () => Promise<SystemDiagnosticResult | null>;
}
