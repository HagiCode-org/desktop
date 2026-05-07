import {
  findManagedNpmPackage,
  getManagedPackageRequiredVersionRange,
  isManagedPackageVersionSatisfied,
} from '../shared/npm-managed-packages.js';
import type {
  ManagedNpmPackageStatus,
  VendoredRuntimeInstallStatus,
} from '../types/dependency-management.js';
import type {
  OmniRouteDependencyFailureKind,
  OmniRouteDependencyPackageId,
  OmniRouteDependencyRemediation,
  OmniRouteDependencyRuntimeId,
} from '../types/omniroute-management.js';

export interface OmniRoutePackageDependencyCheck {
  packageId: OmniRouteDependencyPackageId;
  packageStatus: ManagedNpmPackageStatus | null;
  executablePath: string | null;
  installedVersion?: string | null;
}

export interface OmniRouteRuntimeDependencyCheck {
  runtimeId: OmniRouteDependencyRuntimeId;
  runtimeInstallStatus: VendoredRuntimeInstallStatus | null;
}

export type OmniRouteDependencyProblem =
  | {
      kind: 'runtime';
      runtimeId: OmniRouteDependencyRuntimeId;
      issue: 'missing' | 'damaged';
    }
  | {
      kind: 'package';
      packageId: OmniRouteDependencyPackageId;
      issue: 'missing' | 'unknown' | 'version-mismatch';
    };

const PACKAGE_LABELS: Record<OmniRouteDependencyPackageId, string> = {
  pm2: 'PM2',
};

const RUNTIME_LABELS: Record<OmniRouteDependencyRuntimeId, string> = {
  omniroute: 'OmniRoute runtime',
};

function formatLabelList(labels: readonly string[]): string {
  if (labels.length <= 1) {
    return labels[0] ?? 'OmniRoute';
  }
  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

function formatPackageLabelList(packageIds: readonly OmniRouteDependencyPackageId[]): string {
  return formatLabelList(packageIds.map((packageId) => PACKAGE_LABELS[packageId]));
}

function formatRuntimeLabelList(runtimeIds: readonly OmniRouteDependencyRuntimeId[]): string {
  return formatLabelList(runtimeIds.map((runtimeId) => RUNTIME_LABELS[runtimeId]));
}

export function classifyOmniRouteDependencyProblems(input: {
  runtime: OmniRouteRuntimeDependencyCheck;
  packages: readonly OmniRoutePackageDependencyCheck[];
}): OmniRouteDependencyProblem[] {
  const problems: OmniRouteDependencyProblem[] = [];

  if (input.runtime.runtimeInstallStatus === 'not-installed' || input.runtime.runtimeInstallStatus === 'removed') {
    problems.push({
      kind: 'runtime',
      runtimeId: input.runtime.runtimeId,
      issue: 'missing',
    });
  } else if (input.runtime.runtimeInstallStatus === 'failed') {
    problems.push({
      kind: 'runtime',
      runtimeId: input.runtime.runtimeId,
      issue: 'damaged',
    });
  }

  problems.push(...input.packages.flatMap<OmniRouteDependencyProblem>((check) => {
    const definition = findManagedNpmPackage(check.packageId);
    if (check.packageStatus === 'installed' && check.executablePath) {
      const versionSatisfied = definition
        ? isManagedPackageVersionSatisfied(definition, check.installedVersion ?? null)
        : true;
      if (versionSatisfied) {
        return [];
      }

      return [{
        kind: 'package',
        packageId: check.packageId,
        issue: 'version-mismatch',
      }];
    }

    if (check.packageStatus === 'installed' && !check.executablePath) {
      return [{
        kind: 'package',
        packageId: check.packageId,
        issue: 'unknown',
      }];
    }

    return [{
      kind: 'package',
      packageId: check.packageId,
      issue: check.packageStatus === 'not-installed' ? 'missing' : 'unknown',
    }];
  }));

  return problems;
}

export function buildOmniRouteDependencyRemediation(input: {
  runtime: OmniRouteRuntimeDependencyCheck;
  packages: readonly OmniRoutePackageDependencyCheck[];
}): OmniRouteDependencyRemediation | undefined {
  const problems = classifyOmniRouteDependencyProblems(input);
  if (problems.length === 0) {
    return undefined;
  }

  const targetRuntimeIds = Array.from(new Set(
    problems.filter((problem) => problem.kind === 'runtime').map((problem) => problem.runtimeId),
  ));
  const targetPackageIds = Array.from(new Set(
    problems.filter((problem) => problem.kind === 'package').map((problem) => problem.packageId),
  ));
  const runtimeProblems = problems.filter((problem) => problem.kind === 'runtime');
  const packageProblems = problems.filter((problem) => problem.kind === 'package');
  const failureKind: OmniRouteDependencyFailureKind = runtimeProblems.length > 0 && packageProblems.length > 0
    ? 'runtime-and-package'
    : runtimeProblems.some((problem) => problem.issue === 'damaged')
      ? 'runtime-damaged'
      : runtimeProblems.some((problem) => problem.issue === 'missing')
        ? 'runtime-missing'
        : packageProblems.every((problem) => problem.issue === 'missing')
          ? 'dependency-missing'
          : packageProblems.every((problem) => problem.issue === 'version-mismatch')
            ? 'dependency-version-mismatch'
            : 'dependency-unknown';
  const packageList = formatPackageLabelList(targetPackageIds);
  const runtimeList = formatRuntimeLabelList(targetRuntimeIds);
  const versionGuidance = targetPackageIds.map((packageId) => {
    const definition = findManagedNpmPackage(packageId);
    const requiredVersionRange = definition ? getManagedPackageRequiredVersionRange(definition) : null;
    return requiredVersionRange ? `${PACKAGE_LABELS[packageId]} must satisfy ${requiredVersionRange}` : PACKAGE_LABELS[packageId];
  }).join('; ');
  const message = failureKind === 'runtime-and-package'
    ? `Desktop-managed ${runtimeList} and ${packageList} need repair. Restore the vendored runtime and PM2 from Dependency Management, then retry.`
    : failureKind === 'runtime-damaged'
      ? `Desktop-managed ${runtimeList} failed validation. Repair or reinstall Desktop to restore the vendored runtime, then retry.`
      : failureKind === 'runtime-missing'
        ? `Desktop-managed ${runtimeList} is missing. Repair or reinstall Desktop to restore the vendored runtime, then retry.`
        : failureKind === 'dependency-missing'
          ? `Desktop-managed ${packageList} is not installed. Repair it from Dependency Management and retry.`
          : failureKind === 'dependency-version-mismatch'
            ? `Desktop-managed ${packageList} is installed at an unsupported version. Upgrade it from Dependency Management and retry. ${versionGuidance}.`
            : `Desktop could not verify ${packageList}. Refresh or repair the highlighted OmniRoute dependencies in Dependency Management before retrying.`;

  return {
    kind: 'dependency',
    failureKind,
    targetRuntimeIds,
    targetPackageIds,
    recommendedAction: 'open-dependency-management',
    message,
  };
}
