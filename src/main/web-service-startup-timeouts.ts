export const WEB_SERVICE_STARTUP_TIMEOUT_ENV_KEY = 'HAGICODE_DESKTOP_STARTUP_TIMEOUT_MS';

/** Silence longer than this, with the port still closed, marks the start as slow. */
export const DEFAULT_STARTUP_PHASE_WINDOW_MS = 30_000;
export const DEFAULT_STARTUP_LIMIT_MS = 120_000;
export const FIRST_LAUNCH_STARTUP_LIMIT_MS = 180_000;
export const MIN_STARTUP_LIMIT_MS = 30_000;
export const MAX_STARTUP_LIMIT_MS = 600_000;

export interface ResolveStartupTimeoutsOptions {
  /** Explicit dependency value. Wins over the environment and is not clamped. */
  depsTimeoutMs?: number;
  /** Raw value of HAGICODE_DESKTOP_STARTUP_TIMEOUT_MS. */
  envValue?: string;
  /** True when the Desktop state file has no lastSuccessfulPort. */
  isFirstLaunch: boolean;
  phaseWindowMs?: number;
}

export interface ResolvedStartupTimeouts {
  startupLimitMs: number;
  phaseWindowMs: number;
  /** Set when the environment value was ignored; the caller logs it. */
  warning: string | null;
}

/**
 * Resolves the overall startup limit in this order: explicit dependency,
 * environment override clamped to 30 s–600 s, then the first-launch or normal default.
 */
export function resolveStartupTimeouts(options: ResolveStartupTimeoutsOptions): ResolvedStartupTimeouts {
  const phaseWindowMs = options.phaseWindowMs ?? DEFAULT_STARTUP_PHASE_WINDOW_MS;

  if (options.depsTimeoutMs !== undefined) {
    return { startupLimitMs: options.depsTimeoutMs, phaseWindowMs, warning: null };
  }

  const rawEnvValue = options.envValue?.trim();
  if (rawEnvValue) {
    const parsed = /^\d+$/.test(rawEnvValue) ? Number(rawEnvValue) : Number.NaN;
    if (Number.isFinite(parsed) && parsed > 0) {
      const clamped = Math.min(MAX_STARTUP_LIMIT_MS, Math.max(MIN_STARTUP_LIMIT_MS, parsed));
      return { startupLimitMs: clamped, phaseWindowMs, warning: null };
    }

    return {
      startupLimitMs: defaultStartupLimitMs(options.isFirstLaunch),
      phaseWindowMs,
      warning: `Ignoring ${WEB_SERVICE_STARTUP_TIMEOUT_ENV_KEY}=${rawEnvValue}: expected a positive number of milliseconds.`,
    };
  }

  return { startupLimitMs: defaultStartupLimitMs(options.isFirstLaunch), phaseWindowMs, warning: null };
}

function defaultStartupLimitMs(isFirstLaunch: boolean): number {
  return isFirstLaunch ? FIRST_LAUNCH_STARTUP_LIMIT_MS : DEFAULT_STARTUP_LIMIT_MS;
}
