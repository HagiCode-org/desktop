import type {
  ManagedNpmPackageId,
  ManagedNpmPackageStatusSnapshot,
  DependencyManagementOperationProgress,
} from '../../../types/dependency-management.js';
import type { DependencyManagementRepairIntent } from '../../store/slices/viewSlice.js';

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

export function packageBadgeVariant(status: ManagedNpmPackageStatusSnapshot['status']) {
  if (status === 'installed') {
    return 'default' as const;
  }
  if (status === 'unknown') {
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
    && event.operation === 'sync'
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
    status: event.stage === 'failed' ? 'failed' : batchSyncState.status,
    error: event.stage === 'failed' ? event.message : batchSyncState.error,
  };
}

export function managedPackageRowClassName(status: ManagedNpmPackageStatusSnapshot['status']): string {
  return status === 'installed'
    ? 'bg-emerald-500/10 hover:bg-emerald-500/15'
    : 'bg-red-500/10 hover:bg-red-500/15';
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
    if (item.status === 'installed') {
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
    return !item || item.status === 'not-installed' || item.status === 'unknown';
  });

  return {
    ready: pendingPackageIds.length === 0,
    pendingPackageIds,
  };
}

export function getSelectablePackageIds(
  packages: readonly ManagedNpmPackageStatusSnapshot[],
  options: {
    hagiscriptGateOpen: boolean;
    actionsDisabled: boolean;
  },
): ManagedNpmPackageId[] {
  return packages
    .filter((item) => options.hagiscriptGateOpen && !options.actionsDisabled && item.status !== 'unknown')
    .map((item) => item.id);
}

export function getSelectedEligiblePackageIds(
  selectedPackageIds: readonly ManagedNpmPackageId[],
  selectablePackageIds: readonly ManagedNpmPackageId[],
): ManagedNpmPackageId[] {
  return selectedPackageIds.filter((id) => selectablePackageIds.includes(id));
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
