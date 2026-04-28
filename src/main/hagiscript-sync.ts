import type {
  DependencyManagementEnvironmentStatus,
  ManagedNpmPackageDefinition,
} from '../types/dependency-management.js';

export interface HagiscriptSyncManifestEntry {
  version: string;
  target?: string;
}

export interface HagiscriptSyncManifest {
  packages: Record<string, HagiscriptSyncManifestEntry>;
}

function looksLikeSemverRange(selector: string): boolean {
  return /^[vV0-9*<>=~^xX|.\-\s]+$/.test(selector.trim());
}

export function getHagiscriptInstallTarget(definition: ManagedNpmPackageDefinition): string {
  const installSpec = definition.installSpec.trim();
  const scopedTargetPrefix = `${definition.packageName}@`;
  if (installSpec === definition.packageName) {
    return 'latest';
  }

  if (installSpec.startsWith(scopedTargetPrefix)) {
    const selector = installSpec.slice(scopedTargetPrefix.length).trim();
    return selector || 'latest';
  }

  return 'latest';
}

export function buildHagiscriptSyncManifest(
  definitions: readonly ManagedNpmPackageDefinition[],
): HagiscriptSyncManifest {
  const packages = Object.fromEntries(definitions.map((definition) => {
    const target = getHagiscriptInstallTarget(definition);
    const version = looksLikeSemverRange(target) ? target.replace(/^v(?=\d)/, '') : '*';
    return [definition.packageName, { version, target }];
  }));

  return { packages };
}

export function buildHagiscriptSyncArgs(
  environment: DependencyManagementEnvironmentStatus,
  manifestPath: string,
  registryUrl?: string | null,
): string[] {
  const args = [
    'npm-sync',
    '--runtime',
    environment.nodeRuntimeRoot,
    '--manifest',
    manifestPath,
  ];

  if (registryUrl) {
    args.push('--registry-mirror', registryUrl);
  }

  return args;
}
