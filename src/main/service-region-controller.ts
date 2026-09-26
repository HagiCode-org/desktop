import type { ServiceRegion, ServiceRegionState, SetServiceRegionResult } from '../types/service-region.js';
import {
  isServiceRegion,
  resolveEffectiveServiceRegion,
  serviceRegionForOfficialIndexUrl,
} from '../shared/service-region.js';

export interface ServiceRegionPreferenceStore {
  getServiceRegionPreference(): ServiceRegion | undefined;
  setServiceRegionPreference(region: ServiceRegion): void;
  clearServiceRegionPreference(): void;
}

export interface ServiceRegionSourceManager {
  getCurrentSourceConfig(): { id: string; type: 'http-index' | 'local-folder'; indexUrl?: string } | null;
  switchSource(sourceId: string): Promise<boolean>;
  switchToServiceRegion(region: ServiceRegion): Promise<boolean>;
}

export class ServiceRegionController {
  private readonly preferenceStore: ServiceRegionPreferenceStore;
  private readonly versionManager: ServiceRegionSourceManager;
  private transition: Promise<void> = Promise.resolve();

  constructor(
    preferenceStore: ServiceRegionPreferenceStore,
    versionManager: ServiceRegionSourceManager,
  ) {
    this.preferenceStore = preferenceStore;
    this.versionManager = versionManager;
  }

  getState(): ServiceRegionState {
    const preference = this.preferenceStore.getServiceRegionPreference();
    const activeSource = this.versionManager.getCurrentSourceConfig();
    return {
      region: resolveEffectiveServiceRegion(preference, activeSource),
      isExplicit: preference !== undefined,
    };
  }

  async setRegion(value: unknown): Promise<SetServiceRegionResult> {
    if (!isServiceRegion(value)) {
      return { success: false, error: 'Invalid service region' };
    }

    const resultPromise = this.transition.then(() => this.applyRegion(value));
    this.transition = resultPromise.then(() => undefined, () => undefined);
    return resultPromise;
  }

  async resetPreference(): Promise<SetServiceRegionResult> {
    const resultPromise = this.transition.then(() => {
      try {
        this.preferenceStore.clearServiceRegionPreference();
        return { success: true, state: this.getState() };
      } catch (error) {
        return {
          success: false,
          state: this.getState(),
          error: messageOf(error),
        };
      }
    });
    this.transition = resultPromise.then(() => undefined, () => undefined);
    return resultPromise;
  }

  private async applyRegion(region: ServiceRegion): Promise<SetServiceRegionResult> {
    const previousPreference = this.preferenceStore.getServiceRegionPreference();
    const previousSource = this.versionManager.getCurrentSourceConfig();

    try {
      if (!await this.versionManager.switchToServiceRegion(region)) {
        return {
          success: false,
          state: this.getState(),
          error: 'Failed to switch to the selected official package source',
        };
      }

      this.preferenceStore.setServiceRegionPreference(region);
      return {
        success: true,
        state: this.getState(),
      };
    } catch (error) {
      const rollbackErrors: string[] = [];
      let sourceRollbackFailed = false;
      try {
        if (previousPreference === undefined) {
          this.preferenceStore.clearServiceRegionPreference();
        } else {
          this.preferenceStore.setServiceRegionPreference(previousPreference);
        }
      } catch (rollbackError) {
        rollbackErrors.push(`preference rollback failed: ${messageOf(rollbackError)}`);
      }

      if (previousSource) {
        try {
          if (!await this.versionManager.switchSource(previousSource.id)) {
            rollbackErrors.push('package source rollback failed');
            sourceRollbackFailed = true;
          }
        } catch (rollbackError) {
          rollbackErrors.push(`package source rollback failed: ${messageOf(rollbackError)}`);
          sourceRollbackFailed = true;
        }
      }

      if (sourceRollbackFailed || !previousSource) {
        const activeSource = this.versionManager.getCurrentSourceConfig();
        const activeOfficialRegion = activeSource?.type === 'http-index'
          ? serviceRegionForOfficialIndexUrl(activeSource.indexUrl)
          : undefined;
        if (activeOfficialRegion) {
          try {
            this.preferenceStore.setServiceRegionPreference(activeOfficialRegion);
          } catch (reconciliationError) {
            rollbackErrors.push(`effective-region reconciliation failed: ${messageOf(reconciliationError)}`);
          }
        }
      }

      const rollbackMessage = rollbackErrors.length > 0
        ? `; ${rollbackErrors.join('; ')}`
        : '';
      return {
        success: false,
        state: this.getState(),
        error: `${messageOf(error)}${rollbackMessage}`,
      };
    }
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
