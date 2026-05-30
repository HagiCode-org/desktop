import {
  getManagedPackageRequiredVersionRange,
  isManagedPackageVersionSatisfied,
} from '../../../shared/npm-managed-packages.js';
import type {
  ManagedNpmPackageId,
  ManagedNpmPackageStatusSnapshot,
  DependencyManagementOperationProgress,
  VendoredRuntimeId,
  VendoredRuntimeStatusSnapshot,
} from '../../../types/dependency-management.js';
import type { DependencyManagementRepairIntent } from '../../store/slices/viewSlice.js';

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

export type BatchSyncStatus = 'running' | 'completed' | 'failed';

export interface BatchSyncLogEntry {
  timestamp: string;
  stage: DependencyManagementOperationProgress['stage'];
  message: string;
  percentage?: number;
}

export interface BatchSyncState {
  packageIds: ManagedNpmPackageId[];
  status: BatchSyncStatus;
  logs: BatchSyncLogEntry[];
  error?: string;
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

export function isOperationActive(progress?: DependencyManagementOperationProgress): boolean {
  return progress?.stage === 'started' || progress?.stage === 'output';
}

export function buildBatchSyncLogKey(entry: Pick<BatchSyncLogEntry, 'stage' | 'message' | 'percentage'>): string {
  return `${entry.stage}:${entry.message}:${entry.percentage ?? ''}`;
}

export function isBatchSyncEvent(batchSyncState: BatchSyncState | null, event: DependencyManagementOperationProgress): boolean {
  return Boolean(
    batchSyncState
    && batchSyncState.packageIds.includes(event.packageId),
  );
}

export function appendBatchSyncLog(
  batchSyncState: BatchSyncState,
  event: DependencyManagementOperationProgress,
): BatchSyncState {
  const nextEntry: BatchSyncLogEntry = {
    timestamp: event.timestamp,
    stage: event.stage,
    message: event.message,
    percentage: event.percentage,
  };
  const lastEntry = batchSyncState.logs[batchSyncState.logs.length - 1];
  const nextLogs = lastEntry && buildBatchSyncLogKey(lastEntry) === buildBatchSyncLogKey(nextEntry)
    ? batchSyncState.logs
    : [...batchSyncState.logs, nextEntry];

  return {
    ...batchSyncState,
    logs: nextLogs,
    status: event.stage === 'failed'
      ? 'failed'
      : event.stage === 'completed'
        ? 'completed'
        : batchSyncState.status,
    error: event.stage === 'failed' ? event.message : undefined,
  };
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

export function getManagedPackageActionKey(item: ManagedNpmPackageStatusSnapshot): 'install' | 'reinstall' | 'upgrade' {
  const displayStatus = getManagedPackageDisplayStatus(item);

  if (displayStatus === 'outdated') {
    return 'upgrade';
  }

  return item.status === 'installed' ? 'reinstall' : 'install';
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

export function prioritizeVendoredRuntimesForRepair(
  runtimes: readonly VendoredRuntimeStatusSnapshot[],
  highlightedRuntimeIds: readonly VendoredRuntimeId[],
): VendoredRuntimeStatusSnapshot[] {
  if (highlightedRuntimeIds.length === 0) {
    return [...runtimes];
  }

  const highlighted = new Set(highlightedRuntimeIds);
  const sortWeight = (item: VendoredRuntimeStatusSnapshot): number => {
    if (!highlighted.has(item.id)) {
      return 2;
    }
    if (item.installStatus !== 'installed') {
      return 0;
    }
    return 1;
  };

  return [...runtimes].sort((left, right) => sortWeight(left) - sortWeight(right));
}

export interface DependencyRepairEvaluation {
  ready: boolean;
  pendingPackageIds: ManagedNpmPackageId[];
  pendingRuntimeIds: VendoredRuntimeId[];
}

export function evaluateDependencyRepairIntent(
  packages: readonly ManagedNpmPackageStatusSnapshot[],
  vendoredRuntimes: readonly VendoredRuntimeStatusSnapshot[],
  intent: Pick<DependencyManagementRepairIntent, 'targetPackageIds' | 'targetRuntimeIds'> | null,
): DependencyRepairEvaluation {
  const targetPackageIds = intent?.targetPackageIds ?? [];
  const targetRuntimeIds = intent?.targetRuntimeIds ?? [];
  if (targetPackageIds.length === 0 && targetRuntimeIds.length === 0) {
    return {
      ready: false,
      pendingPackageIds: [],
      pendingRuntimeIds: [],
    };
  }

  const packageById = new Map(packages.map((item) => [item.id, item]));
  const runtimeById = new Map(vendoredRuntimes.map((item) => [item.id, item]));
  const pendingPackageIds = targetPackageIds.filter((packageId) => {
    const item = packageById.get(packageId);
    return !item || item.status === 'not-installed' || item.status === 'unknown' || isManagedPackageOutdated(item);
  });
  const pendingRuntimeIds = targetRuntimeIds.filter((runtimeId) => {
    const item = runtimeById.get(runtimeId);
    return !item || item.installStatus !== 'installed';
  });

  return {
    ready: pendingPackageIds.length === 0 && pendingRuntimeIds.length === 0,
    pendingPackageIds,
    pendingRuntimeIds,
  };
}

export function getSelectablePackageIds(
  packages: readonly ManagedNpmPackageStatusSnapshot[],
  options: {
    actionsDisabled: boolean;
  },
): ManagedNpmPackageId[] {
  if (options.actionsDisabled) {
    return [];
  }

  return getInstallEligiblePackageIds(packages, options);
}

export function getInstallEligiblePackageIds(
  packages: readonly ManagedNpmPackageStatusSnapshot[],
): ManagedNpmPackageId[] {
  return packages
    .filter((item) => item.status !== 'unknown')
    .map((item) => item.id);
}

export function getSelectedEligiblePackageIds(
  selectedPackageIds: readonly ManagedNpmPackageId[],
  selectablePackageIds: readonly ManagedNpmPackageId[],
): ManagedNpmPackageId[] {
  return selectedPackageIds.filter((id) => selectablePackageIds.includes(id));
}

export function pruneSelectedPackageIds(
  selectedPackageIds: readonly ManagedNpmPackageId[],
  packages: readonly ManagedNpmPackageStatusSnapshot[],
): ManagedNpmPackageId[] {
  const eligibleIds = new Set(getInstallEligiblePackageIds(packages));
  return selectedPackageIds.filter((id) => eligibleIds.has(id));
}

export function getSelectAllChecked(
  selectedPackageIds: readonly ManagedNpmPackageId[],
  selectablePackageIds: readonly ManagedNpmPackageId[],
): boolean | 'indeterminate' {
  const selectedEligibleIds = getSelectedEligiblePackageIds(selectedPackageIds, selectablePackageIds);
  const allEligibleSelected = selectablePackageIds.length > 0 && selectablePackageIds.every((id) => selectedPackageIds.includes(id));

  return allEligibleSelected ? true : selectedEligibleIds.length > 0 ? 'indeterminate' : false;
}

export function updateSelectedPackageIds(
  current: readonly ManagedNpmPackageId[],
  packageId: ManagedNpmPackageId,
  checked: boolean,
): ManagedNpmPackageId[] {
  return checked
    ? Array.from(new Set([...current, packageId]))
    : current.filter((id) => id !== packageId);
}

export function updateSelectAllPackageIds(
  current: readonly ManagedNpmPackageId[],
  selectablePackageIds: readonly ManagedNpmPackageId[],
  checked: boolean,
): ManagedNpmPackageId[] {
  const currentWithoutEligible = current.filter((id) => !selectablePackageIds.includes(id));
  return checked ? [...currentWithoutEligible, ...selectablePackageIds] : currentWithoutEligible;
}
