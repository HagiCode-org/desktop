import type { AgentCliId } from './agent-cli-catalog.js';

export type ManagedNpmPackageId =
  | 'openspec'
  | 'skills'
  | 'pm2'
  | 'claude-code'
  | 'codex'
  | 'github-copilot'
  | 'codebuddy'
  | 'opencode'
  | 'qoder'
  | 'gemini'
  | 'impeccable';

export type NpmEnvironmentComponentStatus = 'available' | 'unavailable' | 'error';
export type ManagedNpmPackageStatus = 'installed' | 'not-installed' | 'unknown';
export type ManagedNpmPackageCategory = 'workflow' | 'agent-cli' | 'developer-tool';
export type ManagedNpmPackageInstallMode = 'sdk-sync';
export type DependencyManagementOperation = 'install' | 'uninstall' | 'sync';
export type DependencyManagementProgressStage = 'started' | 'output' | 'completed' | 'failed';
export type DependencyManagementMode = 'internal' | 'external';
export type DependencyManagementEnvironmentSource = 'desktop-managed' | 'externally-managed';
export type VendoredRuntimeId = never;
export type VendoredRuntimeInstallStatus = 'installed' | 'not-installed' | 'removed' | 'failed' | 'packaged';
export type VendoredRuntimeStatus = 'ready' | 'running' | 'stopped' | 'missing' | 'damaged' | 'enable-required' | 'extracting';
export type VendoredRuntimePrimaryAction = 'none' | 'enable' | 'repair' | 'reinstall-desktop' | 'start' | 'stop';
export type VendoredRuntimeLifecycleAction = 'enable' | 'start' | 'stop' | 'restart' | 'repair';
export type VendoredRuntimeSourceStatus = 'available' | 'missing' | 'invalid';
export type VendoredRuntimeActivationStage =
  | 'idle'
  | 'validating-source'
  | 'preparing-staging'
  | 'extracting'
  | 'validating-runtime'
  | 'swapping-runtime'
  | 'completed'
  | 'failed';

export interface ManagedNpmPackageDefinition {
  id: ManagedNpmPackageId;
  packageName: string;
  displayName: string;
  descriptionKey: string;
  binName: string;
  installSpec: string;
  requiredVersionRange?: string;
  category: ManagedNpmPackageCategory;
  installMode: ManagedNpmPackageInstallMode;
  agentCliId?: AgentCliId;
  docsLinkId?: string;
  required?: boolean;
}

export interface VendoredRuntimeDefinition {
  id: VendoredRuntimeId;
  displayName: string;
  descriptionKey: string;
}

export interface VendoredRuntimeMetadata {
  schemaVersion: number;
  packageId: string;
  version: string;
  platform: string;
  arch: string;
  sourceRevision: string;
  extra?: {
    slimArtifact?: boolean;
    bundledNodeRuntime?: boolean;
  };
  artifacts?: Array<{
    kind: string;
    fileName: string;
    blobKey: string;
    sizeBytes?: number;
    sha256?: string;
    platform?: string;
    arch?: string;
  }>;
}

export interface VendoredRuntimeHealthSnapshot {
  reachable: boolean;
  url: string | null;
  lastCheckedAt: string | null;
  message?: string;
}

export interface VendoredRuntimeActivationProgress {
  runtimeId: VendoredRuntimeId;
  attemptId: string;
  stage: VendoredRuntimeActivationStage;
  message: string;
  percentage?: number;
  startedAt: string;
  updatedAt: string;
  error?: string;
}

export interface VendoredRuntimeStatusSnapshot {
  id: VendoredRuntimeId;
  definition: VendoredRuntimeDefinition;
  installStatus: VendoredRuntimeInstallStatus;
  status: VendoredRuntimeStatus;
  sourceStatus: VendoredRuntimeSourceStatus;
  version: string | null;
  runtimeRoot: string;
  stagingRoot: string;
  packagedRoot: string;
  packagedArchivePath: string | null;
  packagedMarkerPath: string | null;
  metadataPath: string | null;
  wrapperPath: string | null;
  entryScriptPath: string | null;
  packageId: string;
  schemaVersion: number | null;
  bundledNodeRuntime: boolean;
  managedByDesktop: boolean;
  primaryAction: VendoredRuntimePrimaryAction;
  diagnostics: string[];
  activation: VendoredRuntimeActivationProgress | null;
  health: VendoredRuntimeHealthSnapshot;
  message?: string;
}

export interface VendoredRuntimeLifecycleResult {
  success: boolean;
  runtimeId: VendoredRuntimeId;
  action: VendoredRuntimeLifecycleAction;
  status: VendoredRuntimeStatusSnapshot;
  error?: string;
}

export interface VendoredRuntimePathOpenResult {
  success: boolean;
  runtimeId: VendoredRuntimeId;
  target: 'logs' | 'runtime-root';
  path: string;
  error?: string;
}

export interface NpmEnvironmentComponent {
  status: NpmEnvironmentComponentStatus;
  executablePath: string;
  version: string | null;
  message?: string;
}

export interface DependencyManagementEnvironmentStatus {
  available: boolean;
   source: DependencyManagementEnvironmentSource;
  toolchainRoot: string;
  nodeRuntimeRoot: string;
  nodeVersion: string | null;
  nodeMajorVersion: string;
  npmGlobalPrefix: string;
  npmGlobalBinRoot: string;
  npmGlobalModulesRoot: string;
  npmCacheRoot: string;
  node: NpmEnvironmentComponent;
  npm: NpmEnvironmentComponent;
  error?: string;
}

export interface DependencyManagementModeSettings {
  configuredMode: DependencyManagementMode;
  effectiveMode: DependencyManagementMode;
  mutationsAvailable: boolean;
  readOnlyReason?: string;
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
  mode: DependencyManagementModeSettings;
  environment: DependencyManagementEnvironmentStatus;
  packages: ManagedNpmPackageStatusSnapshot[];
  vendoredRuntimes: VendoredRuntimeStatusSnapshot[];
  mirrorSettings: NpmMirrorSettings;
  activeOperation: DependencyManagementOperationProgress | null;
  activeRuntimeActivation: VendoredRuntimeActivationProgress | null;
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
  requiredVersionRange: string | null;
  versionSatisfied: boolean;
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
  versionMismatchRequiredPackageIds: ManagedNpmPackageId[];
  missingSelectedAgentCliPackageIds: ManagedNpmPackageId[];
  versionMismatchSelectedAgentCliPackageIds: ManagedNpmPackageId[];
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
  getModeSettings: () => Promise<DependencyManagementModeSettings>;
  setMode: (mode: DependencyManagementMode) => Promise<DependencyManagementSnapshot>;
  getMirrorSettings: () => Promise<NpmMirrorSettings>;
  setMirrorSettings: (settings: NpmMirrorSettingsInput) => Promise<DependencyManagementSnapshot>;
  install: (packageId: ManagedNpmPackageId) => Promise<DependencyManagementOperationResult>;
  uninstall: (packageId: ManagedNpmPackageId) => Promise<DependencyManagementOperationResult>;
  syncPackages: (request: DependencyManagementBatchSyncRequest) => Promise<DependencyManagementBatchSyncResult>;
  enableVendoredRuntime: (runtimeId: VendoredRuntimeId) => Promise<VendoredRuntimeLifecycleResult>;
  startVendoredRuntime: (runtimeId: VendoredRuntimeId) => Promise<VendoredRuntimeLifecycleResult>;
  stopVendoredRuntime: (runtimeId: VendoredRuntimeId) => Promise<VendoredRuntimeLifecycleResult>;
  restartVendoredRuntime: (runtimeId: VendoredRuntimeId) => Promise<VendoredRuntimeLifecycleResult>;
  repairVendoredRuntime: (runtimeId: VendoredRuntimeId) => Promise<VendoredRuntimeLifecycleResult>;
  openVendoredRuntimePath: (runtimeId: VendoredRuntimeId, target: 'logs' | 'runtime-root') => Promise<VendoredRuntimePathOpenResult>;
  onProgress: (callback: (event: DependencyManagementOperationProgress) => void) => () => void;
  onVendoredRuntimeActivationProgress: (callback: (event: VendoredRuntimeActivationProgress) => void) => () => void;
}

export const dependencyManagementChannels = {
  snapshot: 'dependency-management:snapshot',
  refresh: 'dependency-management:refresh',
  getModeSettings: 'dependency-management:get-mode-settings',
  setMode: 'dependency-management:set-mode',
  getMirrorSettings: 'dependency-management:get-mirror-settings',
  setMirrorSettings: 'dependency-management:set-mirror-settings',
  install: 'dependency-management:install',
  uninstall: 'dependency-management:uninstall',
  syncPackages: 'dependency-management:sync-packages',
  enableVendoredRuntime: 'dependency-management:enable-vendored-runtime',
  startVendoredRuntime: 'dependency-management:start-vendored-runtime',
  stopVendoredRuntime: 'dependency-management:stop-vendored-runtime',
  restartVendoredRuntime: 'dependency-management:restart-vendored-runtime',
  repairVendoredRuntime: 'dependency-management:repair-vendored-runtime',
  openVendoredRuntimePath: 'dependency-management:open-vendored-runtime-path',
  progress: 'dependency-management:progress',
  vendoredRuntimeActivationProgress: 'dependency-management:vendored-runtime-activation-progress',
} as const;

export type DependencyManagementChannelMap = typeof dependencyManagementChannels;

export const legacyDependencyManagementChannels = {
  snapshot: 'npm-management:snapshot',
  refresh: 'npm-management:refresh',
  getModeSettings: 'npm-management:get-mode-settings',
  setMode: 'npm-management:set-mode',
  getMirrorSettings: 'npm-management:get-mirror-settings',
  setMirrorSettings: 'npm-management:set-mirror-settings',
  install: 'npm-management:install',
  uninstall: 'npm-management:uninstall',
  syncPackages: 'npm-management:sync-packages',
  enableVendoredRuntime: 'npm-management:enable-vendored-runtime',
  startVendoredRuntime: 'npm-management:start-vendored-runtime',
  stopVendoredRuntime: 'npm-management:stop-vendored-runtime',
  restartVendoredRuntime: 'npm-management:restart-vendored-runtime',
  repairVendoredRuntime: 'npm-management:repair-vendored-runtime',
  openVendoredRuntimePath: 'npm-management:open-vendored-runtime-path',
  progress: 'npm-management:progress',
  vendoredRuntimeActivationProgress: 'npm-management:vendored-runtime-activation-progress',
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
