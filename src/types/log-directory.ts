export const logDirectoryTargets = ['desktop', 'web-app'] as const;

/**
 * Stable target identifiers exposed through preload so renderer callers do not
 * need to know any platform-specific path conventions. The `web-app` target
 * resolves against the Desktop-managed backend runtime logs directory derived
 * from the effective server data home.
 */
export type LogDirectoryTarget = (typeof logDirectoryTargets)[number];

export const logDirectoryErrorCodes = ['logs_not_found', 'no_active_version', 'open_failed'] as const;

/**
 * Stable error codes returned by the main process for all log-directory IPC calls.
 */
export type LogDirectoryErrorCode = (typeof logDirectoryErrorCodes)[number];

export interface LogDirectoryTargetStatus {
  target: LogDirectoryTarget;
  available: boolean;
  exists: boolean;
  path: string | null;
  reason?: LogDirectoryErrorCode;
}

export interface LogDirectoryOpenResult {
  success: boolean;
  error?: LogDirectoryErrorCode;
  path?: string;
}

export interface LogDirectoryBridge {
  listTargets: () => Promise<LogDirectoryTargetStatus[]>;
  open: (target: LogDirectoryTarget) => Promise<LogDirectoryOpenResult>;
}
