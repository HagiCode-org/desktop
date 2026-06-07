import type { NpmSyncManifest } from '@hagicode/hagiscript-sdk';
import type { ManagedNpmPackageDefinition } from '../types/dependency-management.js';
import { getManagedPackageRequiredVersionRange } from '../shared/npm-managed-packages.js';

function looksLikeSemverRange(selector: string): boolean {
  return /^[vV0-9*<>=~^xX|.\-\s]+$/.test(selector.trim());
}

export function getManagedPackageInstallTarget(definition: ManagedNpmPackageDefinition): string {
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

export function buildDesktopNpmSyncManifest(
  definitions: readonly ManagedNpmPackageDefinition[],
  registryMirror?: string | null,
): NpmSyncManifest {
  const packages = Object.fromEntries(definitions.map((definition) => {
    const target = getManagedPackageInstallTarget(definition);
    const requiredVersionRange = getManagedPackageRequiredVersionRange(definition);
    const version = requiredVersionRange
      ?? (looksLikeSemverRange(target) ? target.replace(/^v(?=\d)/, '') : '*');
    return [definition.packageName, {
      version,
      target,
      ...(definition.installArgs && definition.installArgs.length > 0
        ? { installArgs: [...definition.installArgs] }
        : {}),
    }];
  }));

  return {
    packages,
    syncMode: 'packages',
    ...(registryMirror ? { registryMirror } : {}),
  };
}

export function buildInstalledGlobalPackagesFromDefinitions(
  definitions: readonly ManagedNpmPackageDefinition[],
  installedVersionsByPackageName: Readonly<Record<string, string | null | undefined>>,
): Record<string, string> {
  const installed: Record<string, string> = {};

  for (const definition of definitions) {
    const version = installedVersionsByPackageName[definition.packageName]?.trim();
    if (version) {
      installed[definition.packageName] = version;
    }
  }

  return installed;
}
