import { spawnSync } from 'node:child_process';

interface ElectronCommandLineLike {
  appendSwitch(name: string, value?: string): void;
}

interface ElectronAppLike {
  commandLine: ElectronCommandLineLike;
}

type EnvSource = NodeJS.ProcessEnv | Record<string, string | undefined>;

export type SteamLinuxLaunchSource = 'steam' | 'direct-cli';
export type SteamLinuxDetectorCategory =
  | 'non-linux'
  | 'host-reexec'
  | 'explicit-wrapper-env'
  | 'steam-env'
  | 'direct-cli';
export type SteamLinuxCompatibilityMode =
  | 'steam-linux-host-reexec'
  | 'steam-linux-detected'
  | 'default';

export interface SteamLinuxStartupCompatibilityDecision {
  launchSource: SteamLinuxLaunchSource;
  detectorCategory: SteamLinuxDetectorCategory;
  compatibilityMode: SteamLinuxCompatibilityMode;
  compatibilityEnabled: boolean;
  electronSwitches: readonly ElectronStartupSwitch[];
}

export interface ElectronStartupSwitch {
  name: string;
  value?: string;
}

export interface ResolveSteamLinuxStartupCompatibilityOptions {
  env?: EnvSource;
  platform?: NodeJS.Platform;
}

export interface SteamLinuxHostRelaunchOptions {
  argv?: readonly string[];
  cwd?: string;
  env?: EnvSource;
  execPath?: string;
  platform?: NodeJS.Platform;
}

export interface SteamLinuxHostRelaunchResult {
  attempted: boolean;
  handled: boolean;
  reason: SteamLinuxHostRelaunchReason;
  launcherPath?: string;
  status?: number | null;
  signal?: NodeJS.Signals | null;
  error?: string;
}

export type SteamLinuxHostRelaunchReason =
  | 'non-linux'
  | 'not-steam-linux'
  | 'already-host-reexec'
  | 'not-pressure-vessel'
  | 'missing-exec-path'
  | 'launcher-not-found'
  | 'host-launch-completed'
  | 'host-launch-error';

const STEAM_LINUX_COMPATIBILITY_SWITCHES: readonly ElectronStartupSwitch[] = Object.freeze([]);

const EXPLICIT_STEAM_LINUX_ENV_KEY = 'HAGICODE_STEAM_LINUX';
const STEAM_HOST_REEXEC_ENV_KEY = 'HAGICODE_STEAM_HOST_REEXEC';
const STEAM_RUNTIME_LAUNCH_CLIENT = 'steam-runtime-launch-client';

function isTruthy(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function hasSteamLaunchEnvironment(env: EnvSource): boolean {
  return Boolean(
    env.SteamAppId
      || env.SteamGameId
      || env.STEAM_COMPAT_APP_ID
      || env.STEAM_COMPAT_DATA_PATH
      || env.SteamOverlayGameId
      || env.STEAM_RUNTIME
      || env.PRESSURE_VESSEL_APP_ID,
  );
}

function hasPressureVesselEnvironment(env: EnvSource): boolean {
  return env.container === 'pressure-vessel'
    || Boolean(
      env.PRESSURE_VESSEL_RUNTIME
        || env.PRESSURE_VESSEL_RUNTIME_BASE
        || env.PRESSURE_VESSEL_VARIABLE_DIR
        || env.PRESSURE_VESSEL_APP_ID,
    );
}

function buildHostRelaunchArgs(options: Required<Pick<SteamLinuxHostRelaunchOptions, 'cwd' | 'execPath'>> & {
  argv: readonly string[];
}): string[] {
  const userArgs = options.argv.slice(1);

  return [
    '--host',
    `--directory=${options.cwd}`,
    '--',
    '/usr/bin/env',
    `${STEAM_HOST_REEXEC_ENV_KEY}=1`,
    `${EXPLICIT_STEAM_LINUX_ENV_KEY}=1`,
    options.execPath,
    ...userArgs,
  ];
}

export function resolveSteamLinuxStartupCompatibility(
  options: ResolveSteamLinuxStartupCompatibilityOptions = {},
): SteamLinuxStartupCompatibilityDecision {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;

  if (platform !== 'linux') {
    return {
      launchSource: 'direct-cli',
      detectorCategory: 'non-linux',
      compatibilityMode: 'default',
      compatibilityEnabled: false,
      electronSwitches: [],
    };
  }

  const detectorCategory: SteamLinuxDetectorCategory = isTruthy(env[STEAM_HOST_REEXEC_ENV_KEY])
    ? 'host-reexec'
    : isTruthy(env[EXPLICIT_STEAM_LINUX_ENV_KEY])
    ? 'explicit-wrapper-env'
    : hasSteamLaunchEnvironment(env)
      ? 'steam-env'
      : 'direct-cli';
  const compatibilityEnabled = detectorCategory !== 'direct-cli';
  const compatibilityMode: SteamLinuxCompatibilityMode = detectorCategory === 'host-reexec'
    ? 'steam-linux-host-reexec'
    : compatibilityEnabled
      ? 'steam-linux-detected'
      : 'default';
  const electronSwitches = compatibilityEnabled ? STEAM_LINUX_COMPATIBILITY_SWITCHES : [];

  return {
    launchSource: compatibilityEnabled ? 'steam' : 'direct-cli',
    detectorCategory,
    compatibilityMode,
    compatibilityEnabled,
    electronSwitches,
  };
}

export function relaunchSteamLinuxOnHostIfNeeded(
  options: SteamLinuxHostRelaunchOptions = {},
): SteamLinuxHostRelaunchResult {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;

  if (platform !== 'linux') {
    return { attempted: false, handled: false, reason: 'non-linux' };
  }

  if (!isTruthy(env[EXPLICIT_STEAM_LINUX_ENV_KEY]) && !hasSteamLaunchEnvironment(env)) {
    return { attempted: false, handled: false, reason: 'not-steam-linux' };
  }

  if (isTruthy(env[STEAM_HOST_REEXEC_ENV_KEY])) {
    return { attempted: false, handled: false, reason: 'already-host-reexec' };
  }

  if (!hasPressureVesselEnvironment(env)) {
    return { attempted: false, handled: false, reason: 'not-pressure-vessel' };
  }

  const execPath = options.execPath ?? process.execPath;
  if (!execPath) {
    return { attempted: false, handled: false, reason: 'missing-exec-path' };
  }

  const argv = options.argv ?? process.argv;
  const cwd = options.cwd ?? process.cwd();
  const launcherArgs = buildHostRelaunchArgs({ argv, cwd, execPath });
  const launchResult = spawnSync(STEAM_RUNTIME_LAUNCH_CLIENT, launcherArgs, {
    stdio: 'inherit',
  });

  if (launchResult.error) {
    const nodeError = launchResult.error as NodeJS.ErrnoException;
    return {
      attempted: true,
      handled: false,
      reason: nodeError.code === 'ENOENT' ? 'launcher-not-found' : 'host-launch-error',
      launcherPath: STEAM_RUNTIME_LAUNCH_CLIENT,
      error: launchResult.error.message,
    };
  }

  return {
    attempted: true,
    handled: launchResult.status === 0 && launchResult.signal === null,
    reason: launchResult.status === 0 && launchResult.signal === null
      ? 'host-launch-completed'
      : 'host-launch-error',
    launcherPath: STEAM_RUNTIME_LAUNCH_CLIENT,
    status: launchResult.status,
    signal: launchResult.signal,
  };
}

export function applySteamLinuxStartupCompatibility(
  electronApp: ElectronAppLike,
  options: ResolveSteamLinuxStartupCompatibilityOptions = {},
): SteamLinuxStartupCompatibilityDecision {
  const decision = resolveSteamLinuxStartupCompatibility(options);

  for (const electronSwitch of decision.electronSwitches) {
    electronApp.commandLine.appendSwitch(electronSwitch.name, electronSwitch.value);
  }

  return decision;
}

export function buildSteamLinuxStartupCompatibilityLogContext(
  decision: SteamLinuxStartupCompatibilityDecision,
): Record<string, unknown> {
  return {
    launchSource: decision.launchSource,
    compatibilityMode: decision.compatibilityMode,
    compatibilityEnabled: decision.compatibilityEnabled,
    detectorCategory: decision.detectorCategory,
    electronSwitches: decision.electronSwitches.map((electronSwitch) => (
      electronSwitch.value ? `${electronSwitch.name}=${electronSwitch.value}` : electronSwitch.name
    )),
  };
}
