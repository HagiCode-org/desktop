import {
  findManagedNpmPackage,
  getManagedPackageRequiredVersionRange,
  isManagedPackageVersionSatisfied,
} from '../shared/npm-managed-packages.js';
import type { ManagedNpmPackageStatus } from '../types/dependency-management.js';
import type {
  OmniRouteDependencyFailureKind,
  OmniRouteDependencyPackageId,
  OmniRouteDependencyRemediation,
} from '../types/omniroute-management.js';

export interface OmniRouteDependencyCheck {
  packageId: OmniRouteDependencyPackageId;
  packageStatus: ManagedNpmPackageStatus | null;
  executablePath: string | null;
  installedVersion?: string | null;
}

interface OmniRouteDependencyProblem {
  packageId: OmniRouteDependencyPackageId;
  issue: 'missing' | 'unknown' | 'version-mismatch';
}

const PACKAGE_LABELS: Record<OmniRouteDependencyPackageId, string> = {
  pm2: 'PM2',
  omniroute: 'OmniRoute',
};

function formatPackageLabelList(packageIds: readonly OmniRouteDependencyPackageId[]): string {
  const labels = packageIds.map((packageId) => PACKAGE_LABELS[packageId]);
  if (labels.length <= 1) {
    return labels[0] ?? 'OmniRoute';
  }
  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

export function classifyOmniRouteDependencyProblems(
  checks: readonly OmniRouteDependencyCheck[],
): OmniRouteDependencyProblem[] {
  return checks.flatMap<OmniRouteDependencyProblem>((check) => {
    const definition = findManagedNpmPackage(check.packageId);
    if (check.packageStatus === 'installed' && check.executablePath) {
      const versionSatisfied = definition
        ? isManagedPackageVersionSatisfied(definition, check.installedVersion ?? null)
        : true;
      if (versionSatisfied) {
        return [];
      }

      return [{
        packageId: check.packageId,
        issue: 'version-mismatch',
      }];
    }

    if (check.packageStatus === 'installed' && !check.executablePath) {
      return [{
        packageId: check.packageId,
        issue: 'unknown',
      }];
    }

    return [{
      packageId: check.packageId,
      issue: check.packageStatus === 'not-installed' ? 'missing' : 'unknown',
    }];
  });
}

export function buildOmniRouteDependencyRemediation(
  checks: readonly OmniRouteDependencyCheck[],
): OmniRouteDependencyRemediation | undefined {
  const problems = classifyOmniRouteDependencyProblems(checks);
  if (problems.length === 0) {
    return undefined;
  }

  const targetPackageIds = Array.from(new Set(problems.map((problem) => problem.packageId)));
  const failureKind: OmniRouteDependencyFailureKind = problems.every((problem) => problem.issue === 'missing')
    ? 'dependency-missing'
    : problems.every((problem) => problem.issue === 'version-mismatch')
      ? 'dependency-version-mismatch'
      : 'dependency-unknown';
  const packageList = formatPackageLabelList(targetPackageIds);
  const singular = targetPackageIds.length === 1;
  const versionGuidance = targetPackageIds.map((packageId) => {
    const definition = findManagedNpmPackage(packageId);
    const requiredVersionRange = definition ? getManagedPackageRequiredVersionRange(definition) : null;
    return requiredVersionRange ? `${PACKAGE_LABELS[packageId]} must satisfy ${requiredVersionRange}` : PACKAGE_LABELS[packageId];
  }).join('; ');
  const message = failureKind === 'dependency-missing'
    ? `Desktop-managed ${packageList} ${singular ? 'is' : 'are'} not installed. Repair ${singular ? 'it' : 'them'} from Dependency Management and retry.`
    : failureKind === 'dependency-version-mismatch'
      ? `Desktop-managed ${packageList} ${singular ? 'is' : 'are'} installed at an unsupported version. Upgrade ${singular ? 'it' : 'them'} from Dependency Management and retry. ${versionGuidance}.`
      : `Desktop-managed ${packageList} ${singular ? 'is' : 'are'} unavailable or not recognized. Repair ${singular ? 'it' : 'them'} from Dependency Management and retry.`;

  return {
    kind: 'dependency',
    failureKind,
    targetPackageIds,
    recommendedAction: 'open-dependency-management',
    message,
  };
}
