/**
 * Onboarding wizard types and interfaces
 */

/**
 * Onboarding step enumeration
 */
export enum OnboardingStep {
  Welcome = 0,
  SharingAcceleration = 1,
  Download = 2,
  Launch = 3,
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
  stage?: 'queued' | 'downloading' | 'backfilling' | 'verifying' | 'extracting' | 'completed' | 'error';
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
  currentStep: OnboardingStep;
  isSkipped: boolean;
  isCompleted: boolean;
  downloadProgress: DownloadProgress | null;
  serviceProgress: ServiceLaunchProgress | null;
  showSkipConfirm: boolean;
  error: string | null;
  startupFailure: StartupFailurePayload | null;
  showStartupFailureDialog: boolean;
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
