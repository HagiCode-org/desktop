/**
 * Onboarding wizard types and interfaces
 */

/**
 * Onboarding step enumeration
 */
export enum OnboardingStep {
  Welcome = 0,
  LegalConsent = 1,
  SharingAcceleration = 2,
  Download = 3,
}

export type LegalDocumentType = 'eula' | 'privacy-policy';
export type LegalMetadataSource = 'remote' | 'cache' | 'unavailable';
export type OnboardingMode = 'full' | 'legal-only' | 'none';

export interface PublishedLegalDocumentLocale {
  title: string;
  browserOpenUrl: string;
}

export interface PublishedLegalDocument {
  documentType: LegalDocumentType;
  effectiveDate: string;
  revision: string;
  canonicalUrl: string;
  locales: Record<string, PublishedLegalDocumentLocale>;
}

export interface PublishedLegalDocumentsPayload {
  schemaVersion: string;
  publishedAt: string;
  documents: PublishedLegalDocument[];
}

export interface LegalMetadataCacheState {
  payload: PublishedLegalDocumentsPayload;
  cachedAt: string;
  lastSuccessfulFetchAt: string;
}

export interface ResolvedLegalDocument {
  documentType: LegalDocumentType;
  title: string;
  effectiveDate: string;
  revision: string;
  canonicalUrl: string;
  browserOpenUrl: string;
}

export interface ResolvedLegalDocumentsPayload {
  schemaVersion: string | null;
  publishedAt: string | null;
  resolvedLocale: string;
  source: LegalMetadataSource;
  cachedAt: string | null;
  lastSuccessfulFetchAt: string | null;
  documents: ResolvedLegalDocument[];
}

export interface LegalConsentState {
  eulaRevision: string;
  privacyPolicyRevision: string;
  acceptedAt: string;
  locale: string;
  acceptedFrom: Exclude<OnboardingMode, 'none'>;
}

export interface AcceptLegalDocumentsPayload {
  locale: string;
  mode: Exclude<OnboardingMode, 'none'>;
  documents: Array<{
    documentType: LegalDocumentType;
    revision: string;
  }>;
}

export interface OnboardingTriggerResult {
  shouldShow: boolean;
  mode: OnboardingMode;
  reason?: string;
  runtimeProvisioned: boolean;
  metadataSource: LegalMetadataSource;
}

/**
 * Download progress information
 */
export interface DownloadProgress {
  progress: number; // 0-100
  downloadedBytes: number;
  totalBytes: number;
  speed: number; // bytes per second
  remainingSeconds: number;
  version: string;
  stage?: 'queued' | 'fetching-torrent' | 'downloading' | 'backfilling' | 'verifying' | 'extracting' | 'completed' | 'error';
  mode?: 'http-direct' | 'shared-acceleration' | 'source-fallback';
  peers?: number;
  p2pBytes?: number;
  fallbackBytes?: number;
  verified?: boolean;
}

/**
 * Dependency status for onboarding
 */
export interface DependencyItem {
  name: string;
  type: string;
  status: 'checking' | 'pending' | 'installing' | 'installed' | 'error';
  progress: number; // 0-100
  version?: string;
  requiredVersion?: string;
  error?: string;
  installHint?: string;
  resolutionSource?: 'bundled-desktop' | 'system';
  sourcePath?: string;
  primaryAction?: 'install' | 'visit-website' | 'reinstall-desktop' | 'update-desktop';
}

/**
 * Service launch progress
 */
export interface ServiceLaunchProgress {
  phase: 'idle' | 'starting' | 'running' | 'error';
  progress: number; // 0-100
  message: string;
  port?: number;
  url?: string;
}

/**
 * Structured startup failure details shared with the renderer.
 */
export interface StartupFailurePayload {
  summary: string;
  log: string;
  port: number;
  timestamp: string;
  truncated: boolean;
  startupCompatibility?: {
    enabled: boolean;
    mode: 'default' | 'steam-linux-software-rendering';
    launchSource: 'steam' | 'direct-cli';
    detectorCategory:
      | 'not-packaged-linux'
      | 'direct-cli-default'
      | 'steam-runtime-env'
      | 'steam-runtime-env+portable-payload'
      | 'steam-runtime-env+steam-install-path'
      | 'steam-launch-args'
      | 'steam-launch-args+portable-payload';
  };
}

/**
 * Result returned when onboarding tries to start the embedded service.
 */
export interface OnboardingStartServiceResult {
  success: boolean;
  error?: string;
  startupFailure?: StartupFailurePayload;
}

/**
 * Result returned when onboarding recovers from a startup failure.
 */
export interface OnboardingRecoveryResult {
  success: boolean;
  error?: string;
}

/**
 * Script output log entry
 */
export interface ScriptOutput {
  type: 'stdout' | 'stderr';
  data: string;
  dependencyName?: string;
  timestamp: string;
}

/**
 * Onboarding state interface
 */
export interface OnboardingState {
  isActive: boolean;
  mode: OnboardingMode;
  currentStep: OnboardingStep;
  isSkipped: boolean;
  isCompleted: boolean;
  downloadProgress: DownloadProgress | null;
  serviceProgress: ServiceLaunchProgress | null;
  showSkipConfirm: boolean;
  error: string | null;
  startupFailure: StartupFailurePayload | null;
  showStartupFailureDialog: boolean;
  legalDocuments: ResolvedLegalDocument[];
  legalMetadataSource: LegalMetadataSource;
  legalMetadataSchemaVersion: string | null;
  legalMetadataPublishedAt: string | null;
  legalMetadataResolvedLocale: string | null;
  legalMetadataCachedAt: string | null;
  legalMetadataLastSuccessfulFetchAt: string | null;
  isLoadingLegalMetadata: boolean;
  isAcceptingLegalDocuments: boolean;
  isDecliningLegalDocuments: boolean;
  // Idempotency flags to prevent duplicate operations
  isDownloading: boolean;
  isStartingService: boolean;
  isRecoveringFromStartupFailure: boolean;
  // Dependency check results for onboarding
  dependencyCheckResults: DependencyCheckResult[];
  // Real-time script output logs
  scriptOutputLogs: ScriptOutput[];
}

/**
 * Dependency check result for onboarding display
 */
export interface DependencyCheckResult {
  key: string;  // Manifest dependency key (e.g., "dotnet", "claudeCode")
  name: string;
  type: string;
  installed: boolean;
  version?: string;
  requiredVersion?: string;
  versionMismatch?: boolean;
  description?: string;
  isChecking?: boolean;  // True while check is in progress
}

/**
 * Onboarding manager state from electron-store
 */
export interface StoredOnboardingState {
  isSkipped: boolean;
  isCompleted: boolean;
  completedAt?: string;
  version?: string;
}
