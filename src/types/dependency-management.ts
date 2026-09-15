import type { AgentCliId } from './agent-cli-catalog.js';

export type ManagedNpmPackageId =
  | 'openspec'
  | 'skills'
  | 'pm2'
  | 'claude-code'
  | 'codex'
  | 'pi'
  | 'reasonix'
  | 'github-copilot'
  | 'codebuddy'
  | 'opencode'
  | 'qoder'
  | 'gemini'
  | 'impeccable'
  | 'oh-my-pi';

export type NpmEnvironmentComponentStatus = 'available' | 'unavailable' | 'error';
export type ManagedNpmPackageStatus = 'installed' | 'not-installed' | 'unknown';
export type ManagedNpmPackageCategory = 'workflow' | 'agent-cli' | 'developer-tool';
export type DependencyManagementEnvironmentSource = 'externally-managed';
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
  installArgs?: string[];
  requiredVersionRange?: string;
  category: ManagedNpmPackageCategory;
  externalCli?: ManagedExternalCliMetadata;
  agentCliId?: AgentCliId;
  docsLinkId?: string;
  required?: boolean;
}

export interface ManagedExternalCliInstaller {
  command: string;
  args: string[];
  shell?: boolean;
}

export interface ManagedExternalCliMetadata {
  // Only catalog-owned commands are allowed; installer output is never trusted without PATH/version validation.
  installers: Partial<Record<'darwin' | 'linux' | 'win32', ManagedExternalCliInstaller>>;
  versionProbe: string[];
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
  vendoredRuntimes: VendoredRuntimeStatusSnapshot[];
  mirrorSettings: NpmMirrorSettings;
  activeRuntimeActivation: VendoredRuntimeActivationProgress | null;
  generatedAt: string;
}

export type DependencyReadinessBlockingReasonCode =
  | 'environment-unavailable'
  | 'required-packages-missing'
  | 'agent-cli-not-selected'
  | 'agent-cli-not-installed'
  | 'external-cli-not-ready';

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
  selectedDeveloperToolPackageIds: ManagedNpmPackageId[];
  missingSelectedDeveloperToolPackageIds: ManagedNpmPackageId[];
  blockingReasons: DependencyReadinessBlockingReason[];
}

export interface DependencyManagementBridge {
  getSnapshot: () => Promise<DependencyManagementSnapshot>;
  refresh: () => Promise<DependencyManagementSnapshot>;
  getMirrorSettings: () => Promise<NpmMirrorSettings>;
  setMirrorSettings: (settings: NpmMirrorSettingsInput) => Promise<DependencyManagementSnapshot>;
  enableVendoredRuntime: (runtimeId: VendoredRuntimeId) => Promise<VendoredRuntimeLifecycleResult>;
  startVendoredRuntime: (runtimeId: VendoredRuntimeId) => Promise<VendoredRuntimeLifecycleResult>;
  stopVendoredRuntime: (runtimeId: VendoredRuntimeId) => Promise<VendoredRuntimeLifecycleResult>;
  restartVendoredRuntime: (runtimeId: VendoredRuntimeId) => Promise<VendoredRuntimeLifecycleResult>;
  repairVendoredRuntime: (runtimeId: VendoredRuntimeId) => Promise<VendoredRuntimeLifecycleResult>;
  openVendoredRuntimePath: (runtimeId: VendoredRuntimeId, target: 'logs' | 'runtime-root') => Promise<VendoredRuntimePathOpenResult>;
  onVendoredRuntimeActivationProgress: (callback: (event: VendoredRuntimeActivationProgress) => void) => () => void;
}

export const dependencyManagementChannels = {
  snapshot: 'dependency-management:snapshot',
  refresh: 'dependency-management:refresh',
  getMirrorSettings: 'dependency-management:get-mirror-settings',
  setMirrorSettings: 'dependency-management:set-mirror-settings',
  enableVendoredRuntime: 'dependency-management:enable-vendored-runtime',
  startVendoredRuntime: 'dependency-management:start-vendored-runtime',
  stopVendoredRuntime: 'dependency-management:stop-vendored-runtime',
  restartVendoredRuntime: 'dependency-management:restart-vendored-runtime',
  repairVendoredRuntime: 'dependency-management:repair-vendored-runtime',
  openVendoredRuntimePath: 'dependency-management:open-vendored-runtime-path',
  vendoredRuntimeActivationProgress: 'dependency-management:vendored-runtime-activation-progress',
} as const;

export type DependencyManagementChannelMap = typeof dependencyManagementChannels;
