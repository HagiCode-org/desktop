import { spawn } from 'node:child_process';
import axios from 'axios';
import { app, BrowserWindow, shell } from 'electron';
import Store from 'electron-store';
import log from 'electron-log';
import { VersionManager } from './version-manager.js';
import { DependencyManager } from './dependency-manager.js';
import {
  buildOnboardingStartupFailureResult,
  recoverOnboardingStartupFailure,
} from './onboarding-startup-recovery.js';
import { PCodeWebServiceManager } from './web-service-manager.js';
import { manifestReader } from './manifest-reader.js';
import { loadConsoleEnvironment } from './shell-env-loader.js';
import type {
  AcceptLegalDocumentsPayload,
  StoredOnboardingState,
  DownloadProgress,
  DependencyItem,
  ServiceLaunchProgress,
  OnboardingStartServiceResult,
  OnboardingRecoveryResult,
  LegalConsentState,
  LegalMetadataCacheState,
  LegalMetadataSource,
  OnboardingTriggerResult,
  PublishedLegalDocument,
  PublishedLegalDocumentsPayload,
  ResolvedLegalDocument,
  ResolvedLegalDocumentsPayload,
  LegalDocumentType,
} from '../types/onboarding.js';

interface OnboardingManagerOptions {
  legalMetadataUrl?: string;
  fetchLegalMetadata?: (url: string) => Promise<PublishedLegalDocumentsPayload>;
  openExternal?: (url: string) => Promise<void>;
  exitApplication?: () => void;
  now?: () => Date;
}

interface ResolvedLegalMetadataSnapshot {
  payload: PublishedLegalDocumentsPayload | null;
  source: LegalMetadataSource;
  cachedAt: string | null;
  lastSuccessfulFetchAt: string | null;
}

/**
 * OnboardingManager manages the first-time user onboarding flow
 * Coordinates between VersionManager, DependencyManager, and WebServiceManager
 */
export class OnboardingManager {
  private static readonly PORTABLE_VERSION_ONBOARDING_ERROR =
    'Portable version mode skips onboarding because the packaged runtime is already provisioned.';
  private static readonly STORE_KEY = 'onboarding';
  private static readonly LEGAL_CONSENT_STORE_KEY = 'legalConsent';
  private static readonly LEGAL_METADATA_CACHE_STORE_KEY = 'legalMetadataCache';
  private static readonly DEFAULT_LEGAL_METADATA_URL = 'https://index.hagicode.com/legal-documents.json';

  private versionManager: VersionManager;
  private dependencyManager: DependencyManager;
  private webServiceManager: PCodeWebServiceManager;
  private store: Store;
  private mainWindow: BrowserWindow | null;
  private legalMetadataUrl: string;
  private fetchLegalMetadata: (url: string) => Promise<PublishedLegalDocumentsPayload>;
  private openExternal: (url: string) => Promise<void>;
  private exitApplication: () => void;
  private now: () => Date;
  private lastResolvedLegalMetadata: ResolvedLegalMetadataSnapshot | null = null;

  // Idempotency flags to prevent duplicate operations
  private isDownloading = false;
  private isInstallingDependencies = false;
  private isStartingService = false;

  constructor(
    versionManager: VersionManager,
    dependencyManager: DependencyManager,
    webServiceManager: PCodeWebServiceManager,
    store: Store,
    options: OnboardingManagerOptions = {}
  ) {
    this.versionManager = versionManager;
    this.dependencyManager = dependencyManager;
    this.webServiceManager = webServiceManager;
    this.store = store;
    this.mainWindow = null;

    // Get reference to main window from global
    this.mainWindow = (global as any).mainWindow || null;
    this.legalMetadataUrl = options.legalMetadataUrl ?? OnboardingManager.DEFAULT_LEGAL_METADATA_URL;
    this.fetchLegalMetadata = options.fetchLegalMetadata ?? OnboardingManager.fetchPublishedLegalMetadata;
    this.openExternal = options.openExternal ?? (async (url) => {
      await shell.openExternal(url, { activate: true });
    });
    this.exitApplication = options.exitApplication ?? (() => {
      this.mainWindow?.close();
      app.quit();
    });
    this.now = options.now ?? (() => new Date());
  }

  /**
   * Check if onboarding should be triggered
   * Returns true if:
   * - User has not skipped onboarding
   * - User has not completed onboarding
   * - No installed versions exist OR onboarding was explicitly marked as incomplete
   */
  async checkTriggerCondition(): Promise<OnboardingTriggerResult> {
    try {
      log.info('[OnboardingManager] Checking trigger condition...');
      const storedState = this.getStoredState();
      log.info('[OnboardingManager] Stored onboarding state:', storedState);

      const installedVersions = await this.versionManager.getInstalledVersions();
      const runtimeProvisioned = this.versionManager.isPortableVersionMode() || installedVersions.length > 0;

      if (storedState.isCompleted && storedState.version) {
        const versionStillExists = installedVersions.some((version) => version.id === storedState.version);
        if (!versionStillExists && !runtimeProvisioned) {
          log.info('[OnboardingManager] Completed version no longer exists, resetting onboarding state');
          await this.resetOnboarding();
        }
      }

      const legalMetadata = await this.resolveLegalMetadataSnapshot({ refresh: true });
      const legalConsent = this.getLegalConsentState();
      const legalAccepted = this.hasAcceptedCurrentLegalDocuments(legalConsent, legalMetadata.payload);

      if (!legalAccepted) {
        const mode = runtimeProvisioned ? 'legal-only' : 'full';
        return {
          shouldShow: true,
          mode,
          reason: legalMetadata.payload ? 'legal-consent-required' : 'legal-metadata-unavailable',
          runtimeProvisioned,
          metadataSource: legalMetadata.source,
        };
      }

      if (runtimeProvisioned) {
        return {
          shouldShow: false,
          mode: 'none',
          reason: this.versionManager.isPortableVersionMode()
            ? 'portable-version-provisioned'
            : 'runtime-already-provisioned',
          runtimeProvisioned,
          metadataSource: legalMetadata.source,
        };
      }

      if (storedState.isSkipped) {
        return {
          shouldShow: false,
          mode: 'none',
          reason: 'skipped',
          runtimeProvisioned,
          metadataSource: legalMetadata.source,
        };
      }

      return {
        shouldShow: true,
        mode: 'full',
        reason: 'runtime-onboarding-required',
        runtimeProvisioned,
        metadataSource: legalMetadata.source,
      };
    } catch (error) {
      log.error('[OnboardingManager] Failed to check trigger condition:', error);
      return {
        shouldShow: false,
        mode: 'none',
        reason: 'error',
        runtimeProvisioned: false,
        metadataSource: 'unavailable',
      };
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

  getLegalConsentState(): LegalConsentState | null {
    return this.store.get(OnboardingManager.LEGAL_CONSENT_STORE_KEY, null) as LegalConsentState | null;
  }

  private setLegalConsentState(state: LegalConsentState): void {
    this.store.set(OnboardingManager.LEGAL_CONSENT_STORE_KEY, state);
    log.info('[OnboardingManager] Legal consent updated:', state);
  }

  private getLegalMetadataCache(): LegalMetadataCacheState | null {
    return this.store.get(OnboardingManager.LEGAL_METADATA_CACHE_STORE_KEY, null) as LegalMetadataCacheState | null;
  }

  private setLegalMetadataCache(payload: PublishedLegalDocumentsPayload): LegalMetadataCacheState {
    const timestamp = this.now().toISOString();
    const cacheState: LegalMetadataCacheState = {
      payload,
      cachedAt: timestamp,
      lastSuccessfulFetchAt: timestamp,
    };
    this.store.set(OnboardingManager.LEGAL_METADATA_CACHE_STORE_KEY, cacheState);
    return cacheState;
  }

  async getResolvedLegalDocuments(
    locale: string,
    refresh = false,
  ): Promise<ResolvedLegalDocumentsPayload> {
    const resolvedLocale = OnboardingManager.normalizeLocale(locale);
    const snapshot = await this.resolveLegalMetadataSnapshot({ refresh });

    return {
      schemaVersion: snapshot.payload?.schemaVersion ?? null,
      publishedAt: snapshot.payload?.publishedAt ?? null,
      resolvedLocale,
      source: snapshot.source,
      cachedAt: snapshot.cachedAt,
      lastSuccessfulFetchAt: snapshot.lastSuccessfulFetchAt,
      documents: (snapshot.payload?.documents ?? []).map((document) =>
        this.resolveLegalDocument(document, resolvedLocale),
      ),
    };
  }

  async openLegalDocument(documentType: LegalDocumentType, locale: string): Promise<{ success: boolean; error?: string }> {
    try {
      const metadata = await this.getResolvedLegalDocuments(locale);
      const target = metadata.documents.find((document) => document.documentType === documentType);

      if (!target) {
        return { success: false, error: `No legal document metadata found for ${documentType}` };
      }

      await this.openExternal(target.browserOpenUrl);
      return { success: true };
    } catch (error) {
      log.error('[OnboardingManager] Failed to open legal document:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async acceptLegalDocuments(payload: AcceptLegalDocumentsPayload): Promise<{ success: boolean; error?: string }> {
    try {
      const metadata = await this.getResolvedLegalDocuments(payload.locale);
      if (metadata.documents.length === 0) {
        return { success: false, error: 'Legal document metadata is unavailable' };
      }

      const acceptedRevisions = new Map(
        payload.documents.map((document) => [document.documentType, document.revision]),
      );
      const currentRevisions = new Map(
        metadata.documents.map((document) => [document.documentType, document.revision]),
      );

      for (const requiredType of ['eula', 'privacy-policy'] as const) {
        if (acceptedRevisions.get(requiredType) !== currentRevisions.get(requiredType)) {
          return {
            success: false,
            error: `Legal document revision mismatch for ${requiredType}`,
          };
        }
      }

      this.setLegalConsentState({
        eulaRevision: currentRevisions.get('eula') ?? '',
        privacyPolicyRevision: currentRevisions.get('privacy-policy') ?? '',
        acceptedAt: this.now().toISOString(),
        locale: OnboardingManager.normalizeLocale(payload.locale),
        acceptedFrom: payload.mode,
      });

      return { success: true };
    } catch (error) {
      log.error('[OnboardingManager] Failed to accept legal documents:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async declineLegalDocuments(): Promise<{ success: boolean; error?: string }> {
    try {
      this.exitApplication();
      return { success: true };
    } catch (error) {
      log.error('[OnboardingManager] Failed to decline legal documents:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
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
    if (this.versionManager.isPortableVersionMode()) {
      log.info('[OnboardingManager] Skipping package download in portable version mode');
      return { success: false, error: OnboardingManager.PORTABLE_VERSION_ONBOARDING_ERROR };
    }

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

  private hasAcceptedCurrentLegalDocuments(
    legalConsent: LegalConsentState | null,
    publishedMetadata: PublishedLegalDocumentsPayload | null,
  ): boolean {
    if (!legalConsent || !publishedMetadata) {
      return false;
    }

    const eula = publishedMetadata.documents.find((document) => document.documentType === 'eula');
    const privacyPolicy = publishedMetadata.documents.find((document) => document.documentType === 'privacy-policy');

    if (!eula || !privacyPolicy) {
      return false;
    }

    return (
      legalConsent.eulaRevision === eula.revision &&
      legalConsent.privacyPolicyRevision === privacyPolicy.revision
    );
  }

  private resolveLegalDocument(
    document: PublishedLegalDocument,
    locale: string,
  ): ResolvedLegalDocument {
    const normalizedLocale = OnboardingManager.normalizeLocale(locale);
    const localeEntry =
      document.locales[normalizedLocale] ??
      document.locales['zh-CN'] ??
      document.locales['en-US'] ??
      Object.values(document.locales)[0];

    return {
      documentType: document.documentType,
      title: localeEntry?.title ?? document.documentType,
      effectiveDate: document.effectiveDate,
      revision: document.revision,
      canonicalUrl: document.canonicalUrl,
      browserOpenUrl: localeEntry?.browserOpenUrl ?? document.canonicalUrl,
    };
  }

  private async resolveLegalMetadataSnapshot(
    options: { refresh?: boolean } = {},
  ): Promise<ResolvedLegalMetadataSnapshot> {
    if (!options.refresh && this.lastResolvedLegalMetadata) {
      return this.lastResolvedLegalMetadata;
    }

    try {
      const payload = await this.fetchLegalMetadata(this.legalMetadataUrl);
      const cacheState = this.setLegalMetadataCache(payload);
      const snapshot: ResolvedLegalMetadataSnapshot = {
        payload,
        source: 'remote',
        cachedAt: cacheState.cachedAt,
        lastSuccessfulFetchAt: cacheState.lastSuccessfulFetchAt,
      };
      this.lastResolvedLegalMetadata = snapshot;
      return snapshot;
    } catch (error) {
      log.warn('[OnboardingManager] Failed to fetch legal metadata, trying cache:', error);
      const cacheState = this.getLegalMetadataCache();
      if (cacheState?.payload) {
        const snapshot: ResolvedLegalMetadataSnapshot = {
          payload: cacheState.payload,
          source: 'cache',
          cachedAt: cacheState.cachedAt,
          lastSuccessfulFetchAt: cacheState.lastSuccessfulFetchAt,
        };
        this.lastResolvedLegalMetadata = snapshot;
        return snapshot;
      }

      const snapshot: ResolvedLegalMetadataSnapshot = {
        payload: null,
        source: 'unavailable',
        cachedAt: null,
        lastSuccessfulFetchAt: null,
      };
      this.lastResolvedLegalMetadata = snapshot;
      return snapshot;
    }
  }

  private static normalizeLocale(locale: string | undefined): string {
    if (!locale) {
      return 'zh-CN';
    }

    const normalized = locale.toLowerCase();
    if (normalized.startsWith('en')) {
      return 'en-US';
    }

    return 'zh-CN';
  }

  private static async fetchPublishedLegalMetadata(url: string): Promise<PublishedLegalDocumentsPayload> {
    const response = await axios.get<PublishedLegalDocumentsPayload>(url, {
      timeout: 5000,
      responseType: 'json',
    });

    return response.data;
  }

  /**
   * Install dependencies for a version
   *
   * Uses batch installation via installFromManifest to install all missing dependencies
   * in a single script call, significantly reducing installation time overhead.
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

      // Set manifest for dependency manager (working directory no longer needed)
      this.dependencyManager.setManifest(manifest);

      // Get initial status (now all return as not installed)
      const initialStatus = await this.dependencyManager.checkFromManifest(dependencies, null);

      // Create dependency items with status
      const dependencyItems: DependencyItem[] = initialStatus.map(dep => ({
        name: dep.name,
        type: dep.type,
        status: dep.installed ? 'installed' as const : 'pending' as const,
        progress: dep.installed ? 100 : 0,
        version: dep.version,
        requiredVersion: dep.requiredVersion,
        error: dep.installed ? undefined : dep.description,
        installHint: dep.downloadUrl,
        resolutionSource: dep.resolutionSource,
        sourcePath: dep.sourcePath,
        primaryAction: dep.primaryAction,
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

      // Install all missing dependencies in a single batch operation
      if (missingDeps.length > 0) {
        // Mark all missing dependencies as installing
        for (const dep of missingDeps) {
          const itemIndex = dependencyItems.findIndex(item => item.name === dep.name);
          if (itemIndex >= 0) {
            dependencyItems[itemIndex].status = 'installing';
            dependencyItems[itemIndex].progress = 0;
          }
        }
        if (onProgress) {
          onProgress([...dependencyItems]);
        }

        try {
          // Use batch installation to install all dependencies in one script call
          const installResult = await this.dependencyManager.installFromManifest(
            manifest,
            missingDeps,
            (progress) => {
              // Update status based on progress callback
              const itemIndex = dependencyItems.findIndex(item => item.name === progress.dependency);
              if (itemIndex >= 0) {
                if (progress.status === 'installing') {
                  dependencyItems[itemIndex].status = 'installing';
                  dependencyItems[itemIndex].progress = 50;
                } else if (progress.status === 'success') {
                  dependencyItems[itemIndex].status = 'installed';
                  dependencyItems[itemIndex].progress = 100;
                } else if (progress.status === 'error') {
                  dependencyItems[itemIndex].status = 'error';
                  dependencyItems[itemIndex].progress = 0;
                }
                if (onProgress) {
                  onProgress([...dependencyItems]);
                }
              }
            }
          );

          // Handle any failed installations
          if (installResult.failed.length > 0) {
            for (const failed of installResult.failed) {
              const itemIndex = dependencyItems.findIndex(item => item.name === failed.dependency);
              if (itemIndex >= 0) {
                dependencyItems[itemIndex].status = 'error';
                dependencyItems[itemIndex].error = failed.error;
              }
              log.error('[OnboardingManager] Failed to install dependency:', failed.dependency, failed.error);
            }
            if (onProgress) {
              onProgress([...dependencyItems]);
            }
          }

          log.info('[OnboardingManager] Batch installation completed:', installResult.success.length, 'success,', installResult.failed.length, 'failed');
        } catch (error) {
          // Mark all missing dependencies as error on failure
          for (const dep of missingDeps) {
            const itemIndex = dependencyItems.findIndex(item => item.name === dep.name);
            if (itemIndex >= 0) {
              dependencyItems[itemIndex].status = 'error';
              dependencyItems[itemIndex].error = error instanceof Error ? error.message : String(error);
            }
          }
          if (onProgress) {
            onProgress([...dependencyItems]);
          }
          log.error('[OnboardingManager] Batch installation failed:', error);
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

      // Set manifest for dependency manager (working directory no longer needed)
      this.dependencyManager.setManifest(manifest);

      const status = await this.dependencyManager.checkFromManifest(dependencies, null);

      // Create dependency items with status
      const dependencyItems: DependencyItem[] = status.map(dep => ({
        name: dep.name,
        type: dep.type,
        status: dep.installed ? 'installed' as const : 'pending' as const,
        progress: dep.installed ? 100 : 0,
        version: dep.version,
        requiredVersion: dep.requiredVersion,
        error: dep.installed ? undefined : dep.description,
        installHint: dep.downloadUrl,
        resolutionSource: dep.resolutionSource,
        sourcePath: dep.sourcePath,
        primaryAction: dep.primaryAction,
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
   * Note: This method always allows service launch without standalone port-monitoring checks.
   * Runtime dependency validation is handled by WebServiceManager.start().
   */
  async startWebService(
    versionId: string,
    onProgress?: (progress: ServiceLaunchProgress) => void
  ): Promise<OnboardingStartServiceResult> {
    if (this.versionManager.isPortableVersionMode()) {
      log.info('[OnboardingManager] Onboarding service start skipped in portable version mode');
      return {
        success: false,
        error: OnboardingManager.PORTABLE_VERSION_ONBOARDING_ERROR,
      };
    }

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

      // Read manifest and set entryPoint
      const manifest = await manifestReader.readManifest(version.installedPath);
      if (manifest) {
        const entryPoint = manifestReader.parseEntryPoint(manifest);
        this.webServiceManager.setEntryPoint(entryPoint);
      } else {
        log.warn('[OnboardingManager] No manifest found, entryPoint may not be available');
        this.webServiceManager.setEntryPoint(null);
      }

      // Start the service using the standard startup logic (same as homepage)
      const startResult = await this.webServiceManager.start();
      const status = await this.webServiceManager.getStatus();

      if (startResult.success) {
        // Send success progress
        if (onProgress) {
          onProgress({
            phase: 'running',
            progress: 100,
            message: 'Service started successfully',
            port: startResult.port ?? status.port ?? undefined,
            url: startResult.url ?? status.url ?? undefined,
          });
        }

        log.info('[OnboardingManager] Web service started successfully');
        this.isStartingService = false;
        return { success: true };
      } else {
        const failureResult = buildOnboardingStartupFailureResult(startResult, status.port);
        const error = failureResult.error || 'Failed to start service';
        log.error('[OnboardingManager] Failed to start web service:', error);
        this.isStartingService = false;
        return failureResult;
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
   * Recover from an onboarding startup failure by reinstalling the selected
   * version and re-showing the wizard from a clean onboarding state.
   */
  async recoverFromStartupFailure(versionId: string): Promise<OnboardingRecoveryResult> {
    try {
      log.info('[OnboardingManager] Recovering from startup failure for version:', versionId);
      const result = await recoverOnboardingStartupFailure({
        versionId,
        reinstallVersion: (targetVersionId) => this.versionManager.reinstallVersion(targetVersionId),
        getInstalledVersions: () => this.versionManager.getInstalledVersions(),
        getActiveVersion: () => this.versionManager.getActiveVersion(),
        resetOnboarding: () => this.resetOnboarding(),
        sendProgressEvent: (channel, data) => this.sendProgressEvent(channel, data),
      });
      if (result.success) {
        log.info('[OnboardingManager] Startup recovery completed');
      }
      return result;
    } catch (error) {
      log.error('[OnboardingManager] Failed to recover from startup failure:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
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
      completedAt: this.now().toISOString(),
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

  private static mergeRuntimeEnv(
    baseEnv: NodeJS.ProcessEnv,
    consoleEnv: Record<string, string>,
  ): NodeJS.ProcessEnv {
    return {
      ...baseEnv,
      ...consoleEnv,
    };
  }

  private async buildRuntimeEnv(): Promise<NodeJS.ProcessEnv> {
    const consoleEnv = await loadConsoleEnvironment();
    return OnboardingManager.mergeRuntimeEnv(process.env, consoleEnv);
  }

  private static buildSpawnInvocation(
    command: string,
    args: string[],
    platform: NodeJS.Platform = process.platform,
  ): { command: string; args: string[]; shell?: boolean } {
    if (platform !== 'win32') {
      return { command, args };
    }

    const lowerCommand = command.toLowerCase();
    const needsCmdShim = lowerCommand.endsWith('.cmd') || lowerCommand.endsWith('.bat');
    if (!needsCmdShim) {
      return { command, args };
    }

    return {
      command,
      args,
      shell: true,
    };
  }

  private runCommand(
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const spawnInvocation = OnboardingManager.buildSpawnInvocation(command, args);
      const child = spawn(spawnInvocation.command, spawnInvocation.args, {
        env,
        shell: spawnInvocation.shell,
        windowsHide: true,
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout?.on('data', (chunk) => {
        stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      });
      child.stderr?.on('data', (chunk) => {
        stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      });

      child.on('error', (error) => {
        resolve({
          exitCode: 1,
          stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
          stderr: `${Buffer.concat(stderrChunks).toString('utf-8')}\n${error.message}`,
        });
      });

      child.on('close', (code) => {
        resolve({
          exitCode: code ?? 1,
          stdout: Buffer.concat(stdoutChunks).toString('utf-8'),
          stderr: Buffer.concat(stderrChunks).toString('utf-8'),
        });
      });
    });
  }

}
