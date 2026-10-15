export const MAX_ATTEMPTS: number;
export const BACKOFF_MS: readonly number[];
export const NPM_FETCH_RETRY_FLAGS: readonly string[];
export function isInstallAllowed(env?: Record<string, string | undefined>): boolean;
export function minimalInstallEnv(env?: Record<string, string | undefined>): Record<string, string>;
export interface InstallPlan { kind: string; argv: string[]; display: string }
export function buildInstallPlan(
  row: { id: string; install: { kind: string; command?: string }; managedPackageId: string | null },
  context: { platform: string; managedPackages: ReadonlyArray<{ id: string; externalCli?: { installers: Record<string, { command: string; args: string[] }> } }>; buildInstallArgs: (definition: never) => string[] },
): InstallPlan;
export function runWithRetries(input: {
  plan: InstallPlan;
  run: (plan: InstallPlan, options: { timeoutMs?: number }) => Promise<{ exitCode: number | null; stderrTail?: string }>;
  sleep: (ms: number) => Promise<void>;
  maxAttempts?: number;
  backoffMs?: readonly number[];
  timeoutMs?: number;
}): Promise<{ attempts: number; succeeded: boolean; exitCode: number | null; stderrTail: string }>;
