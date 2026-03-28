import Store from 'electron-store';
import type {
  SharingAccelerationSettings,
  SharingAccelerationSettingsInput,
  SharingAccelerationSettingsUpdate,
} from '../../types/sharing-acceleration.js';

interface SharingAccelerationStoreSchema {
  settings: SharingAccelerationSettings;
}

const DEFAULT_SETTINGS: SharingAccelerationSettings = {
  enabled: true,
  uploadLimitMbps: 2,
  cacheLimitGb: 5,
  retentionDays: 7,
  hybridThresholdMb: 0,
  onboardingChoiceRecorded: false,
};

export class SharingAccelerationSettingsStore {
  private store: Store<SharingAccelerationStoreSchema>;

  constructor(store?: Store<SharingAccelerationStoreSchema>) {
    this.store = store ?? new Store<SharingAccelerationStoreSchema>({
      name: 'sharing-acceleration',
      defaults: {
        settings: DEFAULT_SETTINGS,
      },
    });
  }

  getSettings(): SharingAccelerationSettings {
    return this.normalize(this.store.get('settings', DEFAULT_SETTINGS));
  }

  updateSettings(update: SharingAccelerationSettingsUpdate | SharingAccelerationSettingsInput): SharingAccelerationSettings {
    const next = this.normalize({
      ...this.getSettings(),
      ...update,
    });
    this.store.set('settings', next);
    return next;
  }

  recordOnboardingChoice(enabled: boolean): SharingAccelerationSettings {
    return this.updateSettings({
      enabled,
      onboardingChoiceRecorded: true,
    });
  }

  private normalize(settings: SharingAccelerationSettings): SharingAccelerationSettings {
    return {
      enabled: Boolean(settings.enabled),
      uploadLimitMbps: this.clampNumber(settings.uploadLimitMbps, 1, 200, DEFAULT_SETTINGS.uploadLimitMbps),
      cacheLimitGb: this.clampNumber(settings.cacheLimitGb, 1, 500, DEFAULT_SETTINGS.cacheLimitGb),
      retentionDays: this.clampNumber(settings.retentionDays, 1, 90, DEFAULT_SETTINGS.retentionDays),
      hybridThresholdMb: DEFAULT_SETTINGS.hybridThresholdMb,
      onboardingChoiceRecorded: Boolean(settings.onboardingChoiceRecorded),
    };
  }

  private clampNumber(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(value)));
  }
}

export { DEFAULT_SETTINGS as defaultSharingAccelerationSettings };
