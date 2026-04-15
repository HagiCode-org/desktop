import type { ConfigManager as DesktopConfigManager } from './config.js';
import type { ConfigManager as YamlConfigManager } from './config-manager.js';
import type {
  ManagedWebTelemetryPayload,
  ManagedWebTelemetrySettingsInput,
  ManagedWebTelemetrySyncStatus,
  ManagedWebTelemetryWarning,
} from '../types/telemetry.js';

interface ManagedWebTelemetryDependencies {
  configManager: DesktopConfigManager;
  yamlConfigManager?: YamlConfigManager | null;
}

function createLocalOnlyStatus(): ManagedWebTelemetrySyncStatus {
  return {
    state: 'local-only',
    installedVersionIds: [],
    syncedVersionIds: [],
    unsyncedVersionIds: [],
  };
}

function createWarning(status: ManagedWebTelemetrySyncStatus): ManagedWebTelemetryWarning | null {
  if (status.state !== 'partial' || status.unsyncedVersionIds.length === 0) {
    return null;
  }

  return {
    code: 'partial-sync',
    failedVersionIds: [...status.unsyncedVersionIds],
  };
}

export async function getManagedWebTelemetryPayload(
  dependencies: ManagedWebTelemetryDependencies,
): Promise<ManagedWebTelemetryPayload> {
  const settings = dependencies.configManager.getManagedWebTelemetrySettings();
  const status = dependencies.yamlConfigManager
    ? await dependencies.yamlConfigManager.inspectManagedWebTelemetrySettings(settings)
    : createLocalOnlyStatus();

  return {
    settings,
    status,
    warning: createWarning(status),
    applyMode: 'restart-required',
  };
}

export async function setManagedWebTelemetryPayload(
  dependencies: ManagedWebTelemetryDependencies,
  nextSettings: ManagedWebTelemetrySettingsInput,
): Promise<ManagedWebTelemetryPayload> {
  const settings = dependencies.configManager.setManagedWebTelemetrySettings(nextSettings);
  const status = dependencies.yamlConfigManager
    ? await dependencies.yamlConfigManager.updateAllTelemetrySettings(settings)
    : createLocalOnlyStatus();

  return {
    settings,
    status,
    warning: createWarning(status),
    applyMode: 'restart-required',
  };
}
