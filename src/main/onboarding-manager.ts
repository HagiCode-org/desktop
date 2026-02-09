import { BrowserWindow } from 'electron';
import Store from 'electron-store';
import log from 'electron-log';
import { VersionManager } from './version-manager.js';
import { DependencyManager } from './dependency-manager.js';
import { PCodeWebServiceManager } from './web-service-manager.js';
import { manifestReader, type ParsedDependency } from './manifest-reader.js';
import type { StoredOnboardingState, DownloadProgress, DependencyItem, ServiceLaunchProgress } from '../types/onboarding.js';

/**
 * OnboardingManager manages the first-time user onboarding flow
 * Coordinates between VersionManager, DependencyManager, and WebServiceManager
 */
export class OnboardingManager {
  private versionManager: VersionManager;
  private dependencyManager: DependencyManager;
  private webServiceManager: PCodeWebServiceManager;
  private store: Store;
  private mainWindow: BrowserWindow | null;

  // Store key for onboarding state
  private static readonly STORE_KEY = 'onboarding';

  // Idempotency flags to prevent duplicate operations
  private isDownloading = false;
  private isInstallingDependencies = false;
  private isStartingService = false;

  constructor(
    versionManager: VersionManager,
    dependencyManager: DependencyManager,
    webServiceManager: PCodeWebServiceManager,
    store: Store
  ) {
    this.versionManager = versionManager;
    this.dependencyManager = dependencyManager;
    this.webServiceManager = webServiceManager;
    this.store = store;
    this.mainWindow = null;

    // Get reference to main window from global
    this.mainWindow = (global as any).mainWindow || null;
  }

  /**
   * Check if onboarding should be triggered
   * Returns true if:
   * - User has not skipped onboarding
   * - User has not completed onboarding
   * - No installed versions exist OR onboarding was explicitly marked as incomplete
   */
  async checkTriggerCondition(): Promise<{ shouldShow: boolean; reason?: string }> {
    try {
      log.info('[OnboardingManager] Checking trigger condition...');

      // Get stored onboarding state
      const storedState = this.getStoredState();

      log.info('[OnboardingManager] Stored onboarding state:', storedState);

      // If already skipped, don't show
      if (storedState.isSkipped) {
        log.info('[OnboardingManager] Onboarding has been skipped');
        return { shouldShow: false, reason: 'skipped' };
      }

      // If already completed, verify the version still exists
      if (storedState.isCompleted) {
        if (storedState.version) {
          // Check if the completed version still exists
          const installedVersions = await this.versionManager.getInstalledVersions();
          const versionStillExists = installedVersions.some(v => v.id === storedState.version);

          if (!versionStillExists) {
            log.info('[OnboardingManager] Completed version no longer exists, resetting onboarding state');
            // Reset the state since the version is gone
            await this.resetOnboarding();
            // Fall through to show onboarding again
          } else {
            log.info('[OnboardingManager] Onboarding has been completed and version still exists');
            return { shouldShow: false, reason: 'completed' };
          }
        } else {
          log.info('[OnboardingManager] Onboarding has been completed (no version info)');
          return { shouldShow: false, reason: 'completed' };
        }
      }

      // Check if there are any installed versions
      const installedVersions = await this.versionManager.getInstalledVersions();

      if (installedVersions.length > 0) {
        log.info('[OnboardingManager] Found installed versions, skipping onboarding:', installedVersions.map(v => v.id));
        // Don't automatically mark as completed - only mark if user explicitly completes
        return { shouldShow: false, reason: 'has-versions' };
      }

      log.info('[OnboardingManager] Onboarding should be shown - no completed state and no installed versions');
      return { shouldShow: true };
    } catch (error) {
      log.error('[OnboardingManager] Failed to check trigger condition:', error);
      return { shouldShow: false, reason: 'error' };
    }
  }

  /**
   * Get the stored onboarding state
   */
  getStoredState(): StoredOnboardingState {
    const state = this.store.get(OnboardingManager.STORE_KEY, {
      isSkipped: false,
      isCompleted: false,
    }) as StoredOnboardingState;
    return state;
  }

  /**
   * Set the stored onboarding state
   */
  setStoredState(state: Partial<StoredOnboardingState>): void {
    const current = this.getStoredState();
    const updated = { ...current, ...state };
    this.store.set(OnboardingManager.STORE_KEY, updated);
    log.info('[OnboardingManager] Stored state updated:', updated);
  }

  /**
   * Skip the onboarding process
   */
  async skipOnboarding(): Promise<void> {
    log.info('[OnboardingManager] Skipping onboarding');
    this.setStoredState({
      isSkipped: true,
      isCompleted: false,
    });
  }

  /**
   * Download the latest package
   */
  async downloadLatestPackage(
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<{ success: boolean; version?: string; error?: string }> {
    // Idempotency check: if already downloading, ignore duplicate request
    if (this.isDownloading) {
      log.info('[OnboardingManager] Download already in progress, ignoring duplicate request');
      return { success: false, error: 'Download already in progress' };
    }

    try {
      log.info('[OnboardingManager] Downloading latest package...');
      this.isDownloading = true;

      // Get available versions
      const versions = await this.versionManager.listVersions();

      if (versions.length === 0) {
        this.isDownloading = false;
        return { success: false, error: 'No versions available' };
      }

      // Get the first (latest) version
      const latestVersion = versions[0];
      log.info('[OnboardingManager] Latest version:', latestVersion.id);

      // Track download progress for speed calculation
      let lastUpdateTime = Date.now();
      let lastDownloadedBytes = 0;
      let currentSpeed = 0; // bytes per second

      // Send initial progress with file size
      if (onProgress) {
        onProgress({
          progress: 0,
          downloadedBytes: 0,
          totalBytes: latestVersion.size || 0,
          speed: 0,
          remainingSeconds: 0,
          version: latestVersion.id,
        });
      }

      // Download with real-time progress tracking
      const result = await this.versionManager.installVersion(
        latestVersion.id,
        (progress) => {
          // Calculate speed and remaining time
          const now = Date.now();
          const timeElapsed = (now - lastUpdateTime) / 1000; // seconds

          if (timeElapsed >= 0.5) { // Update every 0.5 seconds
            const bytesDownloaded = progress.current - lastDownloadedBytes;
            currentSpeed = Math.round(bytesDownloaded / timeElapsed);

            lastUpdateTime = now;
            lastDownloadedBytes = progress.current;
          }

          // Calculate remaining time
          const remainingBytes = progress.total - progress.current;
          const remainingSeconds = currentSpeed > 0
            ? Math.round(remainingBytes / currentSpeed)
            : 0;

          // Convert packageSource progress format to onboarding progress format
          if (onProgress) {
            onProgress({
              progress: progress.percentage,
              downloadedBytes: progress.current,
              totalBytes: progress.total,
              speed: currentSpeed,
              remainingSeconds,
              version: latestVersion.id,
            });
          }
        }
      );

      if (result.success) {
        log.info('[OnboardingManager] Package downloaded successfully:', latestVersion.id);

        // Send final progress update
        if (onProgress) {
          onProgress({
            progress: 100,
            downloadedBytes: result.version.size || 0,
            totalBytes: result.version.size || 0,
            speed: 0,
            remainingSeconds: 0,
            version: latestVersion.id,
          });
        }

        this.isDownloading = false;
        return { success: true, version: latestVersion.id };
      } else {
        log.error('[OnboardingManager] Failed to download package:', result.error);
        this.isDownloading = false;
        return { success: false, error: result.error };
      }
    } catch (error) {
      log.error('[OnboardingManager] Error downloading package:', error);
      this.isDownloading = false;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Install dependencies for a version
   */
  async installDependencies(
    versionId: string,
    onProgress?: (status: DependencyItem[]) => void
  ): Promise<{ success: boolean; error?: string }> {
    // Idempotency check: if already installing, ignore duplicate request
    if (this.isInstallingDependencies) {
      log.info('[OnboardingManager] Dependency installation already in progress, ignoring duplicate request');
      return { success: false, error: 'Dependency installation already in progress' };
    }

    try {
      log.info('[OnboardingManager] Installing dependencies for version:', versionId);
      this.isInstallingDependencies = true;

      // Get the installed version
      const installedVersions = await this.versionManager.getInstalledVersions();
      const version = installedVersions.find(v => v.id === versionId);

      if (!version) {
        return { success: false, error: 'Version not found' };
      }

      // Read manifest to get dependencies
      const manifest = await manifestReader.readManifest(version.installedPath);

      if (!manifest) {
        return { success: false, error: 'No manifest found' };
      }

      const dependencies = manifestReader.parseDependencies(manifest);

      // Get initial status
      const initialStatus = await this.dependencyManager.checkFromManifest(dependencies);

      // Create dependency items with status
      const dependencyItems: DependencyItem[] = initialStatus.map(dep => ({
        name: dep.name,
        type: dep.type,
        status: dep.installed ? 'installed' as const : 'pending' as const,
        progress: dep.installed ? 100 : 0,
        version: dep.version,
        requiredVersion: dep.requiredVersion,
      }));

      // Send initial status
      if (onProgress) {
        onProgress(dependencyItems);
      }

      // Filter missing dependencies
      const missingDeps = dependencies.filter(dep => {
        const checkResult = initialStatus.find(r => r.name === dep.name);
        return !checkResult || !checkResult.installed || checkResult.versionMismatch;
      });

      log.info('[OnboardingManager] Missing dependencies:', missingDeps.length);

      // Install each missing dependency
      for (let i = 0; i < missingDeps.length; i++) {
        const dep = missingDeps[i];

        // Update status to installing
        const itemIndex = dependencyItems.findIndex(item => item.name === dep.name);
        if (itemIndex >= 0) {
          dependencyItems[itemIndex].status = 'installing';
          dependencyItems[itemIndex].progress = 0;
          if (onProgress) {
            onProgress([...dependencyItems]);
          }
        }

        try {
          // Install the dependency
          await this.dependencyManager.installSingleDependency(dep);

          // Update status to installed
          if (itemIndex >= 0) {
            dependencyItems[itemIndex].status = 'installed';
            dependencyItems[itemIndex].progress = 100;
            if (onProgress) {
              onProgress([...dependencyItems]);
            }
          }

          log.info('[OnboardingManager] Dependency installed:', dep.name);
        } catch (error) {
          // Update status to error
          if (itemIndex >= 0) {
            dependencyItems[itemIndex].status = 'error';
            dependencyItems[itemIndex].error = error instanceof Error ? error.message : String(error);
            if (onProgress) {
              onProgress([...dependencyItems]);
            }
          }
          log.error('[OnboardingManager] Failed to install dependency:', dep.name, error);
        }
      }

      log.info('[OnboardingManager] Dependencies installation completed');
      this.isInstallingDependencies = false;
      return { success: true };
    } catch (error) {
      log.error('[OnboardingManager] Error installing dependencies:', error);
      this.isInstallingDependencies = false;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Check dependencies status without installing
   */
  async checkDependenciesStatus(
    versionId: string,
    onProgress?: (status: DependencyItem[]) => void
  ): Promise<{ success: boolean; error?: string }> {
    try {
      log.info('[OnboardingManager] Checking dependencies status for version:', versionId);

      // Wait for version to be available in installed list (handle race condition)
      let installedVersions = await this.versionManager.getInstalledVersions();
      let version = installedVersions.find(v => v.id === versionId);
      let retries = 0;
      const maxRetries = 10;

      while (!version && retries < maxRetries) {
        log.info('[OnboardingManager] Version not found in installed list, retrying...', `${retries + 1}/${maxRetries}`);
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
        installedVersions = await this.versionManager.getInstalledVersions();
        version = installedVersions.find(v => v.id === versionId);
        retries++;
      }

      if (!version) {
        log.error('[OnboardingManager] Version not found after retries:', versionId);
        log.error('[OnboardingManager] Installed versions:', installedVersions.map(v => v.id));
        return { success: false, error: 'Version not found' };
      }

      log.info('[OnboardingManager] Found version:', version.id);

      // Read manifest to get dependencies
      const manifest = await manifestReader.readManifest(version.installedPath);

      if (!manifest) {
        return { success: false, error: 'No manifest found' };
      }

      const dependencies = manifestReader.parseDependencies(manifest);

      // Get status of all dependencies
      const status = await this.dependencyManager.checkFromManifest(dependencies);

      // Create dependency items with status
      const dependencyItems: DependencyItem[] = status.map(dep => ({
        name: dep.name,
        type: dep.type,
        status: dep.installed ? 'installed' as const : 'pending' as const,
        progress: dep.installed ? 100 : 0,
        version: dep.version,
        requiredVersion: dep.requiredVersion,
      }));

      // Send status
      if (onProgress) {
        onProgress(dependencyItems);
      }

      log.info('[OnboardingManager] Dependencies status checked:', dependencyItems.length);
      return { success: true };
    } catch (error) {
      log.error('[OnboardingManager] Error checking dependencies status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Start the web service
   */
  async startWebService(
    versionId: string,
    onProgress?: (progress: ServiceLaunchProgress) => void
  ): Promise<{ success: boolean; error?: string }> {
    // Idempotency check: if already starting, ignore duplicate request
    if (this.isStartingService) {
      log.info('[OnboardingManager] Service start already in progress, ignoring duplicate request');
      return { success: false, error: 'Service start already in progress' };
    }

    try {
      log.info('[OnboardingManager] Starting web service for version:', versionId);
      this.isStartingService = true;

      // Get the installed version
      const installedVersions = await this.versionManager.getInstalledVersions();
      const version = installedVersions.find(v => v.id === versionId);

      if (!version) {
        return { success: false, error: 'Version not found' };
      }

      // Send initial progress
      if (onProgress) {
        onProgress({
          phase: 'starting',
          progress: 0,
          message: 'Initializing service...',
        });
      }

      // Set the active version path in web service manager
      this.webServiceManager.setActiveVersion(versionId);

      // Start the service
      const result = await this.webServiceManager.start();

      if (result) {
        // Get status
        const status = await this.webServiceManager.getStatus();

        // Send success progress
        if (onProgress) {
          onProgress({
            phase: 'running',
            progress: 100,
            message: 'Service started successfully',
            port: status.port ?? undefined,
            url: status.url ?? undefined,
          });
        }

        log.info('[OnboardingManager] Web service started successfully');
        this.isStartingService = false;
        return { success: true };
      } else {
        this.isStartingService = false;
        return { success: false, error: 'Failed to start service' };
      }
    } catch (error) {
      log.error('[OnboardingManager] Error starting web service:', error);
      this.isStartingService = false;
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Complete the onboarding process
   */
  async completeOnboarding(versionId: string): Promise<void> {
    log.info('[OnboardingManager] Completing onboarding for version:', versionId);

    // Switch to the newly installed version as active
    await this.versionManager.switchVersion(versionId);

    // Store onboarding completion state
    this.setStoredState({
      isSkipped: false,
      isCompleted: true,
      completedAt: new Date().toISOString(),
      version: versionId,
    });

    // Notify renderer of active version change
    const activeVersion = await this.versionManager.getActiveVersion();
    this.sendProgressEvent('version:activeVersionChanged', activeVersion);

    // Get the web service URL to open Hagicode
    const status = await this.webServiceManager.getStatus();
    const serviceUrl = status.url;

    if (serviceUrl) {
      // Send event to open Hagicode
      this.sendProgressEvent('onboarding:open-hagicode', { url: serviceUrl, versionId });
    }

    log.info('[OnboardingManager] Onboarding completed');
  }

  /**
   * Reset onboarding state (for testing or manual re-enable)
   */
  async resetOnboarding(): Promise<void> {
    log.info('[OnboardingManager] Resetting onboarding state');
    this.store.delete(OnboardingManager.STORE_KEY);
  }

  /**
   * Send progress event to renderer process
   */
  private sendProgressEvent(channel: string, data: unknown): void {
    // Always get the latest mainWindow reference from global
    const mainWindow = (global as any).mainWindow;

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, data);
    }
  }
}
