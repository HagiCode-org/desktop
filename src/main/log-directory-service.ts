import {
  logDirectoryTargets,
  type LogDirectoryOpenResult,
  type LogDirectoryTarget,
  type LogDirectoryTargetStatus,
} from '../types/log-directory.js';

interface ActiveVersionLike {
  id: string;
}

interface LoggerLike {
  info?: (...args: unknown[]) => void;
  warn?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
}

export interface LogDirectoryServiceDeps {
  getDesktopLogsPath: () => string;
  getActiveVersion: () => Promise<ActiveVersionLike | null>;
  getVersionLogsPath: (versionId: string) => string;
  access: (path: string) => Promise<unknown>;
  openPath: (path: string) => Promise<string>;
  logger?: LoggerLike;
}

interface ResolvedLogDirectoryTarget {
  target: LogDirectoryTarget;
  path: string | null;
  exists: boolean;
  error?: 'logs_not_found' | 'no_active_version';
}

async function pathExists(access: LogDirectoryServiceDeps['access'], targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function resolveTarget(
  deps: LogDirectoryServiceDeps,
  target: LogDirectoryTarget,
): Promise<ResolvedLogDirectoryTarget> {
  if (target === 'desktop') {
    const desktopLogsPath = deps.getDesktopLogsPath();
    const exists = await pathExists(deps.access, desktopLogsPath);

    return {
      target,
      path: desktopLogsPath,
      exists,
      error: exists ? undefined : 'logs_not_found',
    };
  }

  const activeVersion = await deps.getActiveVersion();
  if (!activeVersion) {
    return {
      target,
      path: null,
      exists: false,
      error: 'no_active_version',
    };
  }

  const webAppLogsPath = deps.getVersionLogsPath(activeVersion.id);
  const exists = await pathExists(deps.access, webAppLogsPath);

  return {
    target,
    path: webAppLogsPath,
    exists,
    error: exists ? undefined : 'logs_not_found',
  };
}

export function createLogDirectoryService(deps: LogDirectoryServiceDeps) {
  const logger = deps.logger;

  return {
    async listTargets(): Promise<LogDirectoryTargetStatus[]> {
      const resolvedTargets = await Promise.all(
        logDirectoryTargets.map((target) => resolveTarget(deps, target)),
      );

      return resolvedTargets.map((resolvedTarget) => ({
        target: resolvedTarget.target,
        available: resolvedTarget.exists,
        exists: resolvedTarget.exists,
        path: resolvedTarget.path,
        reason: resolvedTarget.error,
      }));
    },

    async open(target: LogDirectoryTarget): Promise<LogDirectoryOpenResult> {
      const resolvedTarget = await resolveTarget(deps, target);

      if (!resolvedTarget.path || !resolvedTarget.exists || resolvedTarget.error) {
        logger?.warn?.('[LogDirectoryService] Target unavailable:', {
          target,
          path: resolvedTarget.path,
          error: resolvedTarget.error,
        });

        return {
          success: false,
          error: resolvedTarget.error ?? 'logs_not_found',
        };
      }

      const openResult = await deps.openPath(resolvedTarget.path);
      if (openResult) {
        logger?.warn?.('[LogDirectoryService] Failed to open logs folder:', {
          target,
          path: resolvedTarget.path,
          openResult,
        });

        return {
          success: false,
          error: 'open_failed',
          path: resolvedTarget.path,
        };
      }

      logger?.info?.('[LogDirectoryService] Opened logs folder:', {
        target,
        path: resolvedTarget.path,
      });

      return {
        success: true,
        path: resolvedTarget.path,
      };
    },
  };
}
