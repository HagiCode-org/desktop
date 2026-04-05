import path from 'node:path';
import fs from 'node:fs/promises';
import type { PathManager } from './path-manager.js';

export interface SystemVaultDescriptor {
  id: string;
  name: string;
  physicalPath: string;
}

export interface BuildSystemVaultEnvResult {
  descriptors: SystemVaultDescriptor[];
  envEntries: Record<string, string>;
  warnings: string[];
}

export interface SystemVaultPathResolver {
  getDesktopLogsDirectory(): string;
  getDesktopAppsRoot(): string;
  getDesktopConfigDirectory(): string;
}

export interface BuildSystemVaultEnvOptions {
  pathResolver: SystemVaultPathResolver;
  ensureDirectory?: (targetPath: string) => Promise<void>;
  isAbsolutePath?: (targetPath: string) => boolean;
}

export const SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX =
  'SystemManagedVaults__AdditionalDirectories__';

const RESERVED_DESKTOP_SYSTEM_VAULTS = [
  { id: 'desktoplogs', name: 'Desktop Logs', resolvePath: (resolver: SystemVaultPathResolver) => resolver.getDesktopLogsDirectory() },
  { id: 'desktopapps', name: 'Desktop Apps', resolvePath: (resolver: SystemVaultPathResolver) => resolver.getDesktopAppsRoot() },
  { id: 'desktopconfig', name: 'Desktop Config', resolvePath: (resolver: SystemVaultPathResolver) => resolver.getDesktopConfigDirectory() },
] as const;

/**
 * Builds the Desktop-owned system-managed vault descriptors and maps them into
 * ASP.NET Core hierarchical env keys for the managed backend child process.
 */
export async function buildDesktopSystemVaultEnv(
  options: BuildSystemVaultEnvOptions,
): Promise<BuildSystemVaultEnvResult> {
  const ensureDirectory = options.ensureDirectory ?? (targetPath => fs.mkdir(targetPath, { recursive: true }));
  const isAbsolutePath = options.isAbsolutePath ?? path.isAbsolute;
  const descriptors: SystemVaultDescriptor[] = [];
  const warnings: string[] = [];

  for (const definition of RESERVED_DESKTOP_SYSTEM_VAULTS) {
    const physicalPath = definition.resolvePath(options.pathResolver).trim();
    if (!physicalPath) {
      warnings.push(`Skipped Desktop system-managed vault '${definition.id}' because the resolved path was empty.`);
      continue;
    }

    if (!isAbsolutePath(physicalPath)) {
      warnings.push(
        `Skipped Desktop system-managed vault '${definition.id}' because the resolved path is not absolute: ${physicalPath}`,
      );
      continue;
    }

    try {
      await ensureDirectory(physicalPath);
      descriptors.push({
        id: definition.id,
        name: definition.name,
        physicalPath,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Skipped Desktop system-managed vault '${definition.id}' because its directory could not be prepared: ${message}`);
    }
  }

  if (descriptors.length === 0) {
    return { descriptors, envEntries: {}, warnings };
  }

  return {
    descriptors,
    envEntries: buildHierarchicalEnvEntries(descriptors),
    warnings,
  };
}

export function createDesktopSystemVaultPathResolver(
  pathManager: Pick<PathManager, 'getDesktopLogsDirectory' | 'getDesktopAppsRoot' | 'getDesktopConfigDirectory'>,
): SystemVaultPathResolver {
  return {
    getDesktopLogsDirectory: () => pathManager.getDesktopLogsDirectory(),
    getDesktopAppsRoot: () => pathManager.getDesktopAppsRoot(),
    getDesktopConfigDirectory: () => pathManager.getDesktopConfigDirectory(),
  };
}

function buildHierarchicalEnvEntries(descriptors: ReadonlyArray<SystemVaultDescriptor>): Record<string, string> {
  const envEntries: Record<string, string> = {};

  for (const [index, descriptor] of descriptors.entries()) {
    envEntries[`${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}${index}__Id`] = descriptor.id;
    envEntries[`${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}${index}__Name`] = descriptor.name;
    envEntries[`${SYSTEM_MANAGED_VAULT_ADDITIONAL_DIRECTORIES_ENV_PREFIX}${index}__PhysicalPath`] =
      descriptor.physicalPath;
  }

  return envEntries;
}
