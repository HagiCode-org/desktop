export type WebServiceStartErrorKind = 'no_active_version' | 'version_not_ready' | 'dependencies_missing' | 'other';

/** Telemetry-safe failure detail. Every field is an enumeration or a count; no message text. */
export interface StartFailureDetail {
  failedPhase?: string;
  missingDependency?: 'dotnet-runtime' | 'nodejs' | 'java-runtime' | 'claude-code' | 'cli-tool' | 'unknown';
  missingCount?: number;
}

export type MissingStartDependency = 'nodejs' | 'cli-tool' | 'unknown';

export interface WebServiceStartDependencyMissing {
  missingDependency: MissingStartDependency;
  missingCount: number;
}

/**
 * Maps a failed start-readiness check to the telemetry dependency category and count.
 * - the Node/npm toolchain (the readiness environment) is unavailable: `nodejs`
 * - required managed npm packages are unsatisfied: `cli-tool`, counted
 * - anything else, including an uninitialized dependency service: `unknown`
 */
export function classifyMissingStartDependencies(input:
  | { reason: 'service-uninitialized' }
  | { reason: 'environment-unavailable' }
  | { reason: 'required-packages'; unsatisfiedCount: number }): WebServiceStartDependencyMissing {
  switch (input.reason) {
    case 'environment-unavailable':
      return { missingDependency: 'nodejs', missingCount: 1 };
    case 'required-packages':
      return input.unsatisfiedCount > 0
        ? { missingDependency: 'cli-tool', missingCount: input.unsatisfiedCount }
        : { missingDependency: 'unknown', missingCount: 1 };
    default:
      return { missingDependency: 'unknown', missingCount: 1 };
  }
}

export interface StartOutcome {
  success: boolean;
  error?: string;
  telemetry?: StartFailureDetail;
}

/**
 * Builds the `web_service_start_finished` properties. Success carries no failure detail. Failures
 * carry `failedPhase`; the dependency fields appear only with `dependencies_missing`.
 */
export function buildStartFinishedProperties(input: {
  success: boolean;
  errorKind?: WebServiceStartErrorKind;
  durationMs: number;
  detail?: StartFailureDetail;
}): Record<string, unknown> {
  if (input.success) {
    return { status: 'success', duration: input.durationMs };
  }
  const errorKind = input.errorKind ?? 'other';
  const properties: Record<string, unknown> = {
    status: 'failure',
    errorKind,
    duration: input.durationMs,
  };
  if (input.detail?.failedPhase !== undefined) properties.failedPhase = input.detail.failedPhase;
  if (errorKind === 'dependencies_missing') {
    if (input.detail?.missingDependency !== undefined) properties.missingDependency = input.detail.missingDependency;
    if (input.detail?.missingCount !== undefined) properties.missingCount = input.detail.missingCount;
  }
  return properties;
}

export interface OnboardingStartDeps<TResult extends StartOutcome> {
  startWebService: (versionId: string, onProgress: (progress: unknown) => void) => Promise<TResult>;
  onProgress: (progress: unknown) => void;
  track: (name: 'web_service_start_requested' | 'web_service_start_finished', properties: Record<string, unknown>) => void;
  reportFirstServiceStarted: () => void;
  now?: () => number;
}

/**
 * Onboarding start path (the live `onboarding:start-service` handler). It is the only emitter of
 * both start events for onboarding starts: `requested` (trigger `onboarding`) before the attempt,
 * and exactly one `finished` after it, including when the attempt throws.
 */
export async function runOnboardingStartService<TResult extends StartOutcome>(
  versionId: string,
  deps: OnboardingStartDeps<TResult>,
): Promise<TResult | { success: false; error: string }> {
  const now = deps.now ?? (() => Date.now());
  deps.track('web_service_start_requested', { trigger: 'onboarding' });
  const startedAt = now();
  try {
    const result = await deps.startWebService(versionId, deps.onProgress);
    deps.track('web_service_start_finished', buildStartFinishedProperties({
      success: result.success,
      errorKind: 'other',
      durationMs: now() - startedAt,
      detail: result.telemetry,
    }));
    if (result.success) deps.reportFirstServiceStarted();
    return result;
  } catch (error) {
    deps.track('web_service_start_finished', buildStartFinishedProperties({
      success: false,
      errorKind: 'other',
      durationMs: now() - startedAt,
    }));
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
