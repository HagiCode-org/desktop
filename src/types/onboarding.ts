/**
 * Onboarding wizard types and interfaces
 */

/**
 * Onboarding step enumeration
 */
export enum OnboardingStep {
  Welcome = 0,
  Download = 1,
  Dependencies = 2,
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
}

/**
 * Dependency status for onboarding
 */
export interface DependencyItem {
  name: string;
  type: string;
  status: 'pending' | 'installing' | 'installed' | 'error';
  progress: number; // 0-100
  version?: string;
  requiredVersion?: string;
  error?: string;
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
  // Idempotency flags to prevent duplicate operations
  isDownloading: boolean;
  isStartingService: boolean;
  // Dependency check results for onboarding
  dependencyCheckResults: DependencyCheckResult[];
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
