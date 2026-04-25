import type { AgentCliId } from './agent-cli-catalog.js';

export type ManagedNpmPackageId =
  | 'hagiscript'
  | 'openspec'
  | 'skills'
  | 'omniroute'
  | 'code-server'
  | 'claude-code'
  | 'codex'
  | 'github-copilot'
  | 'codebuddy'
  | 'opencode'
  | 'qoder'
  | 'gemini';

export type NpmEnvironmentComponentStatus = 'available' | 'unavailable' | 'error';
export type ManagedNpmPackageStatus = 'installed' | 'not-installed' | 'unknown';
export type ManagedNpmPackageCategory = 'bootstrap' | 'workflow' | 'agent-cli' | 'developer-tool';
export type ManagedNpmPackageInstallMode = 'embedded-npm' | 'hagiscript-sync';
export type NpmManagementOperation = 'install' | 'uninstall' | 'sync';
export type NpmManagementProgressStage = 'started' | 'output' | 'completed' | 'failed';

export interface ManagedNpmPackageDefinition {
  id: ManagedNpmPackageId;
  packageName: string;
  displayName: string;
  descriptionKey: string;
  binName: string;
  installSpec: string;
  category: ManagedNpmPackageCategory;
  installMode: ManagedNpmPackageInstallMode;
  agentCliId?: AgentCliId;
  docsLinkId?: string;
  required?: boolean;
}

export interface NpmEnvironmentComponent {
  status: NpmEnvironmentComponentStatus;
  executablePath: string;
  version: string | null;
  message?: string;
}

export interface NpmManagementEnvironmentStatus {
  available: boolean;
  toolchainRoot: string;
  npmGlobalPrefix: string;
  npmGlobalBinRoot: string;
  node: NpmEnvironmentComponent;
  npm: NpmEnvironmentComponent;
  error?: string;
}

export interface ManagedNpmPackageStatusSnapshot {
  id: ManagedNpmPackageId;
  definition: ManagedNpmPackageDefinition;
  status: ManagedNpmPackageStatus;
  version: string | null;
  packageRoot: string;
  executablePath: string | null;
  message?: string;
}

export interface NpmMirrorSettings {
  enabled: boolean;
  registryUrl: string | null;
}

export interface NpmMirrorSettingsInput {
  enabled: boolean;
}

export interface NpmManagementSnapshot {
  environment: NpmManagementEnvironmentStatus;
  packages: ManagedNpmPackageStatusSnapshot[];
  mirrorSettings: NpmMirrorSettings;
  activeOperation: NpmManagementOperationProgress | null;
  generatedAt: string;
}

export interface NpmManagementOperationProgress {
  packageId: ManagedNpmPackageId;
  operation: NpmManagementOperation;
  stage: NpmManagementProgressStage;
  message: string;
  percentage?: number;
  timestamp: string;
}

export interface NpmManagementOperationResult {
  success: boolean;
  packageId: ManagedNpmPackageId;
  operation: NpmManagementOperation;
  status?: ManagedNpmPackageStatusSnapshot;
  error?: string;
  snapshot: NpmManagementSnapshot;
}

export interface NpmManagementBatchSyncRequest {
  packageIds: ManagedNpmPackageId[];
}

export interface NpmManagementBatchSyncResult {
  success: boolean;
  packageIds: ManagedNpmPackageId[];
  operation: 'sync';
  statuses: ManagedNpmPackageStatusSnapshot[];
  error?: string;
  snapshot: NpmManagementSnapshot;
}

export interface NpmManagementBridge {
  getSnapshot: () => Promise<NpmManagementSnapshot>;
  refresh: () => Promise<NpmManagementSnapshot>;
  getMirrorSettings: () => Promise<NpmMirrorSettings>;
  setMirrorSettings: (settings: NpmMirrorSettingsInput) => Promise<NpmManagementSnapshot>;
  install: (packageId: ManagedNpmPackageId) => Promise<NpmManagementOperationResult>;
  uninstall: (packageId: ManagedNpmPackageId) => Promise<NpmManagementOperationResult>;
  syncPackages: (request: NpmManagementBatchSyncRequest) => Promise<NpmManagementBatchSyncResult>;
  onProgress: (callback: (event: NpmManagementOperationProgress) => void) => () => void;
}

export const npmManagementChannels = {
  snapshot: 'npm-management:snapshot',
  refresh: 'npm-management:refresh',
  getMirrorSettings: 'npm-management:get-mirror-settings',
  setMirrorSettings: 'npm-management:set-mirror-settings',
  install: 'npm-management:install',
  uninstall: 'npm-management:uninstall',
  syncPackages: 'npm-management:sync-packages',
  progress: 'npm-management:progress',
} as const;

export type NpmManagementChannelMap = typeof npmManagementChannels;
