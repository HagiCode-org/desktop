import type { AgentCliId } from './agent-cli-catalog.js';

export type ManagedNpmPackageId =
  | 'hagiscript'
  | 'openspec'
  | 'skills'
  | 'pm2'
  | 'omniroute'
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
export type DependencyManagementOperation = 'install' | 'uninstall' | 'sync';
export type DependencyManagementProgressStage = 'started' | 'output' | 'completed' | 'failed';

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

export interface DependencyManagementEnvironmentStatus {
  available: boolean;
  toolchainRoot: string;
  nodeRuntimeRoot: string;
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

export interface DependencyManagementSnapshot {
  environment: DependencyManagementEnvironmentStatus;
  packages: ManagedNpmPackageStatusSnapshot[];
  mirrorSettings: NpmMirrorSettings;
  activeOperation: DependencyManagementOperationProgress | null;
  generatedAt: string;
}

export type DependencyReadinessBlockingReasonCode =
  | 'environment-unavailable'
  | 'required-packages-missing'
  | 'agent-cli-not-selected'
  | 'agent-cli-not-installed';

export interface DependencyReadinessPackageSummary {
  id: ManagedNpmPackageId;
  definition: ManagedNpmPackageDefinition;
  status: ManagedNpmPackageStatus;
  installedVersion: string | null;
  installSpec: string;
  packageName: string;
  message?: string;
}

export interface DependencyReadinessBlockingReason {
  code: DependencyReadinessBlockingReasonCode;
  message: string;
  packageIds?: ManagedNpmPackageId[];
}

export interface DependencyReadinessSummary {
  environmentAvailable: boolean;
  requiredReady: boolean;
  agentCliReady: boolean;
  ready: boolean;
  requiredPackages: DependencyReadinessPackageSummary[];
  optionalPackages: DependencyReadinessPackageSummary[];
  agentCliPackages: DependencyReadinessPackageSummary[];
  missingRequiredPackageIds: ManagedNpmPackageId[];
  missingSelectedAgentCliPackageIds: ManagedNpmPackageId[];
  selectedAgentCliPackageIds: ManagedNpmPackageId[];
  installedSelectedAgentCliPackageIds: ManagedNpmPackageId[];
  ignoredSelectedAgentCliPackageIds: string[];
  blockingReasons: DependencyReadinessBlockingReason[];
}

export interface DependencyManagementOperationProgress {
  packageId: ManagedNpmPackageId;
  operation: DependencyManagementOperation;
  stage: DependencyManagementProgressStage;
  message: string;
  percentage?: number;
  timestamp: string;
}

export interface DependencyManagementOperationResult {
  success: boolean;
  packageId: ManagedNpmPackageId;
  operation: DependencyManagementOperation;
  status?: ManagedNpmPackageStatusSnapshot;
  error?: string;
  snapshot: DependencyManagementSnapshot;
}

export interface DependencyManagementBatchSyncRequest {
  packageIds: ManagedNpmPackageId[];
}

export interface DependencyManagementBatchSyncResult {
  success: boolean;
  packageIds: ManagedNpmPackageId[];
  operation: 'sync';
  statuses: ManagedNpmPackageStatusSnapshot[];
  error?: string;
  snapshot: DependencyManagementSnapshot;
}

export interface DependencyManagementBridge {
  getSnapshot: () => Promise<DependencyManagementSnapshot>;
  refresh: () => Promise<DependencyManagementSnapshot>;
  getMirrorSettings: () => Promise<NpmMirrorSettings>;
  setMirrorSettings: (settings: NpmMirrorSettingsInput) => Promise<DependencyManagementSnapshot>;
  install: (packageId: ManagedNpmPackageId) => Promise<DependencyManagementOperationResult>;
  uninstall: (packageId: ManagedNpmPackageId) => Promise<DependencyManagementOperationResult>;
  syncPackages: (request: DependencyManagementBatchSyncRequest) => Promise<DependencyManagementBatchSyncResult>;
  onProgress: (callback: (event: DependencyManagementOperationProgress) => void) => () => void;
}

export const dependencyManagementChannels = {
  snapshot: 'dependency-management:snapshot',
  refresh: 'dependency-management:refresh',
  getMirrorSettings: 'dependency-management:get-mirror-settings',
  setMirrorSettings: 'dependency-management:set-mirror-settings',
  install: 'dependency-management:install',
  uninstall: 'dependency-management:uninstall',
  syncPackages: 'dependency-management:sync-packages',
  progress: 'dependency-management:progress',
} as const;

export type DependencyManagementChannelMap = typeof dependencyManagementChannels;

export const legacyDependencyManagementChannels = {
  snapshot: 'npm-management:snapshot',
  refresh: 'npm-management:refresh',
  getMirrorSettings: 'npm-management:get-mirror-settings',
  setMirrorSettings: 'npm-management:set-mirror-settings',
  install: 'npm-management:install',
  uninstall: 'npm-management:uninstall',
  syncPackages: 'npm-management:sync-packages',
  progress: 'npm-management:progress',
} as const;

export type LegacyDependencyManagementChannelMap = typeof legacyDependencyManagementChannels;

export type NpmManagementOperation = DependencyManagementOperation;
export type NpmManagementProgressStage = DependencyManagementProgressStage;
export type NpmManagementEnvironmentStatus = DependencyManagementEnvironmentStatus;
export type NpmManagementSnapshot = DependencyManagementSnapshot;
export type NpmReadinessBlockingReasonCode = DependencyReadinessBlockingReasonCode;
export type NpmReadinessPackageSummary = DependencyReadinessPackageSummary;
export type NpmReadinessBlockingReason = DependencyReadinessBlockingReason;
export type NpmReadinessSummary = DependencyReadinessSummary;
export type NpmManagementOperationProgress = DependencyManagementOperationProgress;
export type NpmManagementOperationResult = DependencyManagementOperationResult;
export type NpmManagementBatchSyncRequest = DependencyManagementBatchSyncRequest;
export type NpmManagementBatchSyncResult = DependencyManagementBatchSyncResult;
export type NpmManagementBridge = DependencyManagementBridge;
export const npmManagementChannels = legacyDependencyManagementChannels;
