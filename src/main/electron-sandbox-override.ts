interface ElectronCommandLineLike {
  appendSwitch(name: string, value?: string): void;
}

interface ElectronAppLike {
  commandLine: ElectronCommandLineLike;
}

type EnvSource = NodeJS.ProcessEnv | Record<string, string | undefined>;

export const ELECTRON_SANDBOX_OVERRIDE_ENV_KEY = 'HAGICODE_DISABLE_ELECTRON_SANDBOX';

export type ElectronSandboxStartupMode = 'default' | 'sandbox-disabled-env-override';

export interface ElectronStartupSwitch {
  name: string;
  value?: string;
}

export interface ElectronSandboxOverrideDecision {
  enabled: boolean;
  mode: ElectronSandboxStartupMode;
  envKey: typeof ELECTRON_SANDBOX_OVERRIDE_ENV_KEY;
  rawValue: string | null;
  normalizedValue: string | null;
  truthyValues: readonly string[];
  electronSwitches: readonly ElectronStartupSwitch[];
  reason: 'truthy-env-var' | 'missing-env-var' | 'falsy-env-var';
  processLevelOverride: boolean;
  rendererSandboxSettingsChanged: false;
  nodeIntegrationChanged: false;
}

export interface ResolveElectronSandboxOverrideOptions {
  env?: EnvSource;
}

export const ELECTRON_SANDBOX_OVERRIDE_TRUTHY_VALUES = Object.freeze(['1', 'true', 'yes', 'on']);

const ELECTRON_SANDBOX_DISABLE_SWITCHES: readonly ElectronStartupSwitch[] = Object.freeze([
  { name: 'no-sandbox' },
]);

function normalizeEnvValue(value: string | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  return value.trim().toLowerCase();
}

export function isTruthyElectronSandboxOverride(value: string | undefined): boolean {
  const normalizedValue = normalizeEnvValue(value);
  return normalizedValue !== null && ELECTRON_SANDBOX_OVERRIDE_TRUTHY_VALUES.includes(normalizedValue);
}

export function resolveElectronSandboxOverride(
  options: ResolveElectronSandboxOverrideOptions = {},
): ElectronSandboxOverrideDecision {
  const env = options.env ?? process.env;
  const rawValue = env[ELECTRON_SANDBOX_OVERRIDE_ENV_KEY] ?? null;
  const normalizedValue = normalizeEnvValue(rawValue ?? undefined);
  const enabled = isTruthyElectronSandboxOverride(rawValue ?? undefined);

  return {
    enabled,
    mode: enabled ? 'sandbox-disabled-env-override' : 'default',
    envKey: ELECTRON_SANDBOX_OVERRIDE_ENV_KEY,
    rawValue,
    normalizedValue,
    truthyValues: ELECTRON_SANDBOX_OVERRIDE_TRUTHY_VALUES,
    electronSwitches: enabled ? ELECTRON_SANDBOX_DISABLE_SWITCHES : [],
    reason: enabled ? 'truthy-env-var' : rawValue === null ? 'missing-env-var' : 'falsy-env-var',
    processLevelOverride: enabled,
    rendererSandboxSettingsChanged: false,
    nodeIntegrationChanged: false,
  };
}

export function applyElectronSandboxOverride(
  electronApp: ElectronAppLike,
  options: ResolveElectronSandboxOverrideOptions = {},
): ElectronSandboxOverrideDecision {
  const decision = resolveElectronSandboxOverride(options);

  for (const electronSwitch of decision.electronSwitches) {
    electronApp.commandLine.appendSwitch(electronSwitch.name, electronSwitch.value);
  }

  return decision;
}

export function buildElectronSandboxOverrideLogContext(
  decision: ElectronSandboxOverrideDecision,
): Record<string, unknown> {
  return {
    envKey: decision.envKey,
    overrideEnabled: decision.enabled,
    startupMode: decision.mode,
    reason: decision.reason,
    normalizedValue: decision.normalizedValue,
    electronSwitches: decision.electronSwitches.map((electronSwitch) => electronSwitch.name),
    processLevelOverride: decision.processLevelOverride,
    rendererSandboxSettingsChanged: decision.rendererSandboxSettingsChanged,
    nodeIntegrationChanged: decision.nodeIntegrationChanged,
  };
}

