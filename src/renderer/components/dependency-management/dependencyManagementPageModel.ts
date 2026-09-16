import {
  getManagedPackageRequiredVersionRange,
  isManagedPackageVersionSatisfied,
} from '../../../shared/npm-managed-packages.js';
import type {
  ManagedNpmPackageDefinition,
  ManagedNpmPackageId,
  ManagedNpmPackageStatusSnapshot,
} from '../../../types/dependency-management.js';
import type { DependencyManagementRepairIntent } from '../../store/slices/viewSlice.js';
import { buildManagedPackageGlobalInstallCommand } from '../../../shared/npm-managed-packages.js';

export type ManagedPackageDisplayStatus = ManagedNpmPackageStatusSnapshot['status'] | 'outdated';

export function isManagedPackageOutdated(item: ManagedNpmPackageStatusSnapshot): boolean {
  return item.status === 'installed' && !isManagedPackageVersionSatisfied(item.definition, item.version);
}

export function getManagedPackageDisplayStatus(item: ManagedNpmPackageStatusSnapshot): ManagedPackageDisplayStatus {
  return isManagedPackageOutdated(item) ? 'outdated' : item.status;
}

export function getManagedPackageRequiredVersion(item: ManagedNpmPackageStatusSnapshot): string | null {
  return getManagedPackageRequiredVersionRange(item.definition);
}

export function buildBatchInstallCommand(
  definitions: ManagedNpmPackageDefinition[],
  registryUrl?: string | null,
): string {
  // Keep each package command independent so install arguments match the single-package path.
  return definitions
    .map((definition) => buildManagedPackageGlobalInstallCommand(definition, registryUrl))
    .join('\n');
}

export function packageBadgeVariant(item: ManagedNpmPackageStatusSnapshot) {
  const displayStatus = getManagedPackageDisplayStatus(item);

  if (displayStatus === 'installed') {
    return 'default' as const;
  }
  if (displayStatus === 'outdated') {
    return 'secondary' as const;
  }
  if (displayStatus === 'unknown') {
    return 'destructive' as const;
  }
  return 'secondary' as const;
}

export function managedPackageRowClassName(item: ManagedNpmPackageStatusSnapshot): string {
  const displayStatus = getManagedPackageDisplayStatus(item);

  if (displayStatus === 'installed') {
    return 'bg-emerald-500/10 hover:bg-emerald-500/15';
  }

  if (displayStatus === 'outdated') {
    return 'bg-amber-500/10 hover:bg-amber-500/15';
  }

  return 'bg-red-500/10 hover:bg-red-500/15';
}

export function prioritizePackagesForRepair(
  packages: readonly ManagedNpmPackageStatusSnapshot[],
  highlightedPackageIds: readonly ManagedNpmPackageId[],
): ManagedNpmPackageStatusSnapshot[] {
  if (highlightedPackageIds.length === 0) {
    return [...packages];
  }

  const highlighted = new Set(highlightedPackageIds);
  const sortWeight = (item: ManagedNpmPackageStatusSnapshot): number => {
    if (!highlighted.has(item.id)) {
      return 2;
    }
    if (item.status === 'installed' && !isManagedPackageOutdated(item)) {
      return 1;
    }
    return 0;
  };

  return [...packages].sort((left, right) => sortWeight(left) - sortWeight(right));
}

export interface DependencyRepairEvaluation {
  ready: boolean;
  pendingPackageIds: ManagedNpmPackageId[];
}

export function evaluateDependencyRepairIntent(
  packages: readonly ManagedNpmPackageStatusSnapshot[],
  intent: Pick<DependencyManagementRepairIntent, 'targetPackageIds'> | null,
): DependencyRepairEvaluation {
  const targetPackageIds = intent?.targetPackageIds ?? [];
  if (targetPackageIds.length === 0) {
    return {
      ready: false,
      pendingPackageIds: [],
    };
  }

  const packageById = new Map(packages.map((item) => [item.id, item]));
  const pendingPackageIds = targetPackageIds.filter((packageId) => {
    const item = packageById.get(packageId);
    return !item || item.status === 'not-installed' || item.status === 'unknown' || isManagedPackageOutdated(item);
  });
  return {
    ready: pendingPackageIds.length === 0,
    pendingPackageIds,
  };
}
