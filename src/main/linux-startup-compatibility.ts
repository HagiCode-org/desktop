import fs from 'node:fs';
import path from 'node:path';

interface ElectronCommandLineLike {
  appendSwitch(name: string, value?: string): void;
}

interface ElectronAppLike {
  disableHardwareAcceleration(): void;
  commandLine: ElectronCommandLineLike;
}

type EnvSource = NodeJS.ProcessEnv | Record<string, string | undefined>;
type ExistsSync = (targetPath: string) => boolean;

const FORCED_STEAM_COMPAT_ENV_KEY = 'HAGICODE_FORCE_STEAM_COMPAT';

export type StartupCompatibilityMode = 'default' | 'steam-linux-software-rendering';
export type StartupCompatibilityLaunchSource = 'steam' | 'direct-cli';
export type StartupCompatibilityDetectorCategory =
  | 'not-packaged-linux'
  | 'direct-cli-default'
  | 'steam-runtime-env'
  | 'steam-runtime-env+portable-payload'
  | 'steam-runtime-env+steam-install-path'
  | 'steam-launch-args'
  | 'steam-launch-args+portable-payload';

export interface ElectronStartupSwitch {
  name: string;
  value?: string;
}

export interface StartupCompatibilitySnapshot {
  enabled: boolean;
  mode: StartupCompatibilityMode;
  launchSource: StartupCompatibilityLaunchSource;
  detectorCategory: StartupCompatibilityDetectorCategory;
}

export interface SteamLinuxStartupCompatibilityDecision extends StartupCompatibilitySnapshot {
  platform: NodeJS.Platform;
  isPackaged: boolean;
  portablePayloadDetected: boolean;
  portablePayloadRoot: string | null;
  portablePayloadSignals: string[];
  steamRuntimeHints: string[];
  launchArgHints: string[];
  pathHints: string[];
  electronSwitches: readonly ElectronStartupSwitch[];
  disableHardwareAcceleration: boolean;
}

export interface ResolveSteamLinuxStartupCompatibilityOptions {
  platform?: NodeJS.Platform;
  isPackaged?: boolean;
  env?: EnvSource;
  argv?: readonly string[];
  execPath?: string;
  cwd?: string;
  resourcesPath?: string;
  portablePayloadRoot?: string;
  existsSync?: ExistsSync;
}

const PORTABLE_FIXED_ROOT_SEGMENTS = ['extra', 'portable-fixed', 'current'] as const;
const PORTABLE_SIGNAL_PATHS = [
  { label: 'manifest', relativePath: 'manifest.json' },
  { label: 'service-dll', relativePath: path.join('lib', 'PCode.Web.dll') },
] as const;

const STRONG_STEAM_ENV_KEYS = new Set([
  'SteamAppId',
  'SteamGameId',
  'STEAM_COMPAT_CLIENT_INSTALL_PATH',
  'STEAM_COMPAT_DATA_PATH',
  'PRESSURE_VESSEL_RUNTIME',
  'PRESSURE_VESSEL_PREFIX',
]);

const STEAM_ENV_KEYS = [
  ...STRONG_STEAM_ENV_KEYS,
  'STEAM_RUNTIME',
  'SteamPath',
] as const;

const STEAM_ARG_HINT_PATTERNS = [
  /steam:\/\//i,
  /steamappid/i,
  /steamgameid/i,
  /steam-runtime/i,
  /pressure-vessel/i,
] as const;

const STEAM_PATH_HINT_PATTERNS = [
  /[/\\]steamapps(?:[/\\]|$)/i,
  /steamlinuxruntime/i,
  /pressure-vessel/i,
] as const;

const STEAM_LINUX_COMPATIBILITY_SWITCHES: readonly ElectronStartupSwitch[] = Object.freeze([
  { name: 'disable-gpu' },
  { name: 'disable-gpu-compositing' },
  { name: 'disable-gpu-rasterization' },
]);

let recordedStartupCompatibilityDecision: SteamLinuxStartupCompatibilityDecision | null = null;

function collectSteamRuntimeHints(env: EnvSource): string[] {
  return STEAM_ENV_KEYS.filter((key) => {
    const value = env[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

function isTruthyEnvFlag(value: string | undefined): boolean {
  if (typeof value !== 'string') {
    return false;
  }

  const normalizedValue = value.trim().toLowerCase();
  return normalizedValue === '1' || normalizedValue === 'true' || normalizedValue === 'yes' || normalizedValue === 'on';
}

function collectMatchingValues(values: readonly string[], patterns: readonly RegExp[], prefix: string): string[] {
  const matches = new Set<string>();

  for (const value of values) {
    for (const pattern of patterns) {
      if (pattern.test(value)) {
        matches.add(`${prefix}:${value}`);
        break;
      }
    }
  }

  return [...matches];
}

function resolvePackagedPortablePayloadRoot(resourcesPath: string | undefined): string | null {
  if (!resourcesPath || resourcesPath.trim().length === 0) {
    return null;
  }

  return path.join(resourcesPath, ...PORTABLE_FIXED_ROOT_SEGMENTS);
}

function detectPortablePayloadSignals(
  portablePayloadRoot: string | null,
  existsSync: ExistsSync,
): string[] {
  if (!portablePayloadRoot) {
    return [];
  }

  return PORTABLE_SIGNAL_PATHS
    .filter((signal) => existsSync(path.join(portablePayloadRoot, signal.relativePath)))
    .map((signal) => signal.label);
}

function resolveDetectorCategory(
  isPackagedLinux: boolean,
  steamRuntimeHints: string[],
  launchArgHints: string[],
  pathHints: string[],
  portablePayloadSignals: string[],
): StartupCompatibilityDetectorCategory {
  if (!isPackagedLinux) {
    return 'not-packaged-linux';
  }

  if (launchArgHints.length > 0) {
    if (portablePayloadSignals.length > 0) {
      return 'steam-launch-args+portable-payload';
    }

    return 'steam-launch-args';
  }

  if (steamRuntimeHints.length > 0) {
    if (portablePayloadSignals.length > 0) {
      return 'steam-runtime-env+portable-payload';
    }

    if (pathHints.length > 0) {
      return 'steam-runtime-env+steam-install-path';
    }

    return 'steam-runtime-env';
  }

  return 'direct-cli-default';
}

function shouldEnableCompatibility(
  isPackagedLinux: boolean,
  steamRuntimeHints: string[],
  launchArgHints: string[],
  pathHints: string[],
  portablePayloadSignals: string[],
): boolean {
  if (!isPackagedLinux) {
    return false;
  }

  const strongSteamEnvHints = steamRuntimeHints.filter((hint) => STRONG_STEAM_ENV_KEYS.has(hint));
  if (strongSteamEnvHints.length > 0) {
    return true;
  }

  if (launchArgHints.length > 0 && (portablePayloadSignals.length > 0 || pathHints.length > 0)) {
    return true;
  }

  if (steamRuntimeHints.length >= 2 && (portablePayloadSignals.length > 0 || pathHints.length > 0)) {
    return true;
  }

  return false;
}

export function createStartupCompatibilitySnapshot(
  decision: SteamLinuxStartupCompatibilityDecision,
): StartupCompatibilitySnapshot {
  return {
    enabled: decision.enabled,
    mode: decision.mode,
    launchSource: decision.launchSource,
    detectorCategory: decision.detectorCategory,
  };
}

export function resolveSteamLinuxStartupCompatibility(
  options: ResolveSteamLinuxStartupCompatibilityOptions = {},
): SteamLinuxStartupCompatibilityDecision {
  const platform = options.platform ?? process.platform;
  const isPackaged = options.isPackaged ?? false;
  const env = options.env ?? process.env;
  const argv = options.argv ?? process.argv;
  const execPath = options.execPath ?? process.execPath;
  const cwd = options.cwd ?? process.cwd();
  const processResourcesPath =
    'resourcesPath' in process
      ? (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
      : undefined;
  const resourcesPath = options.resourcesPath ?? processResourcesPath;
  const existsSync = options.existsSync ?? fs.existsSync;

  const forceSteamCompat = isTruthyEnvFlag(env[FORCED_STEAM_COMPAT_ENV_KEY]);
  const isEligibleLinuxLaunch = platform === 'linux' && (isPackaged || forceSteamCompat);
  const portablePayloadRoot = options.portablePayloadRoot ?? resolvePackagedPortablePayloadRoot(resourcesPath);
  const portablePayloadSignals = detectPortablePayloadSignals(portablePayloadRoot, existsSync);
  const steamRuntimeHints = collectSteamRuntimeHints(env);
  const launchArgHints = collectMatchingValues(argv, STEAM_ARG_HINT_PATTERNS, 'arg');
  const pathHints = collectMatchingValues(
    [execPath, cwd, resourcesPath].filter((value): value is string => Boolean(value && value.trim().length > 0)),
    STEAM_PATH_HINT_PATTERNS,
    'path',
  );

  const enabled = shouldEnableCompatibility(
    isEligibleLinuxLaunch,
    steamRuntimeHints,
    launchArgHints,
    pathHints,
    portablePayloadSignals,
  ) || forceSteamCompat;
  const detectorCategory = resolveDetectorCategory(
    isEligibleLinuxLaunch,
    steamRuntimeHints,
    launchArgHints,
    pathHints,
    portablePayloadSignals,
  );

  return {
    platform,
    isPackaged,
    enabled,
    mode: enabled ? 'steam-linux-software-rendering' : 'default',
    launchSource: steamRuntimeHints.length > 0 || launchArgHints.length > 0 ? 'steam' : 'direct-cli',
    detectorCategory,
    portablePayloadDetected: portablePayloadSignals.length > 0,
    portablePayloadRoot,
    portablePayloadSignals,
    steamRuntimeHints,
    launchArgHints,
    pathHints,
    electronSwitches: enabled ? STEAM_LINUX_COMPATIBILITY_SWITCHES : [],
    disableHardwareAcceleration: enabled,
  };
}

export function recordStartupCompatibilityDecision(
  decision: SteamLinuxStartupCompatibilityDecision,
): SteamLinuxStartupCompatibilityDecision {
  recordedStartupCompatibilityDecision = decision;
  return decision;
}

export function getRecordedStartupCompatibilityDecision(): SteamLinuxStartupCompatibilityDecision | null {
  return recordedStartupCompatibilityDecision;
}

export function clearRecordedStartupCompatibilityDecision(): void {
  recordedStartupCompatibilityDecision = null;
}

export function buildStartupCompatibilityLogContext(
  decision: SteamLinuxStartupCompatibilityDecision,
): Record<string, unknown> {
  return {
    launchSource: decision.launchSource,
    compatibilityMode: decision.mode,
    compatibilityEnabled: decision.enabled,
    detectorCategory: decision.detectorCategory,
    portablePayloadDetected: decision.portablePayloadDetected,
    portablePayloadSignals: decision.portablePayloadSignals,
    steamRuntimeHints: decision.steamRuntimeHints,
    launchArgHints: decision.launchArgHints,
    pathHints: decision.pathHints,
  };
}

export function buildStartupCompatibilityDiagnosticLine(
  decision: SteamLinuxStartupCompatibilityDecision | null,
): string | null {
  if (!decision) {
    return null;
  }

  return [
    '[StartupCompatibility]',
    `launchSource=${decision.launchSource}`,
    `compatibilityEnabled=${decision.enabled}`,
    `mode=${decision.mode}`,
    `detectorCategory=${decision.detectorCategory}`,
  ].join(' ');
}

export function applySteamLinuxStartupCompatibility(
  electronApp: ElectronAppLike,
  options: ResolveSteamLinuxStartupCompatibilityOptions = {},
): SteamLinuxStartupCompatibilityDecision {
  const decision = recordStartupCompatibilityDecision(resolveSteamLinuxStartupCompatibility(options));
  if (!decision.enabled) {
    return decision;
  }

  electronApp.disableHardwareAcceleration();
  for (const electronSwitch of decision.electronSwitches) {
    electronApp.commandLine.appendSwitch(electronSwitch.name, electronSwitch.value);
  }

  return decision;
}
