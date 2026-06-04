import path from 'node:path';

const MANAGED_SERVER_DATA_DIRECTORY_NAME = 'data';
const MANAGED_SERVER_LOGS_DIRECTORY_NAME = 'logs';

function sanitizeAbsolutePath(targetPath: string | null | undefined): string | null {
  if (typeof targetPath !== 'string') {
    return null;
  }

  const trimmed = targetPath.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return path.resolve(trimmed);
}

export function resolveManagedServerDataHome(dataDirectory: string | null | undefined): string | null {
  const absoluteDataDirectory = sanitizeAbsolutePath(dataDirectory);
  if (!absoluteDataDirectory) {
    return null;
  }

  return path.dirname(absoluteDataDirectory);
}

export function resolveManagedServerLogsDirectory(dataDirectory: string | null | undefined): string | null {
  const serverDataHome = resolveManagedServerDataHome(dataDirectory);
  if (!serverDataHome) {
    return null;
  }

  return path.join(serverDataHome, MANAGED_SERVER_LOGS_DIRECTORY_NAME);
}

export function resolveManagedServerDefaultDataDirectory(serverDataHome: string | null | undefined): string | null {
  const absoluteServerDataHome = sanitizeAbsolutePath(serverDataHome);
  if (!absoluteServerDataHome) {
    return null;
  }

  return path.join(absoluteServerDataHome, MANAGED_SERVER_DATA_DIRECTORY_NAME);
}
