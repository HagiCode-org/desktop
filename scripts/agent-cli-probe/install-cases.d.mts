export type OperatingSystem = 'linux' | 'macos' | 'windows';

export interface CaseRow {
  id: string;
  cliId: string;
  method: string;
  tier: 'core' | 'extended';
  os: OperatingSystem[];
  container: string | null;
  install: { kind: 'shell' | 'powershell' | 'cmd' | 'managed-npm' | 'managed-external'; command?: string };
  managedPackageId: string | null;
  probeSurfaces: Array<'A' | 'B'>;
  expectedLocation: Partial<Record<OperatingSystem, string[]>>;
  runnerPreinstalled: string[];
  knownIssue: { reason: string; trackedBy: string } | null;
  timeoutMinutes: number;
  verification: string;
  verifiedOn: string;
  source: string;
  notes?: string;
}

export interface ExclusionRow {
  cliId: string;
  method: string;
  reason: string;
  source: string | null;
  verifiedOn: string;
}

export const OPERATING_SYSTEMS: readonly OperatingSystem[];
export const RUNNER_IMAGES: Readonly<Record<OperatingSystem, string>>;
export const TIERS: readonly string[];
export const INSTALL_KINDS: readonly string[];
export const RESULT_CLASSES: readonly string[];
export const catalogCliIds: readonly string[];
export const VERIFIED_ON: string;
export const installCases: CaseRow[];
export const exclusions: ExclusionRow[];
export const documentedMethods: Readonly<Record<string, readonly string[]>>;
export function methodsFor(cliId: string): string[];
export function validateRegistry(input?: {
  cases?: CaseRow[];
  exclusionRows?: ExclusionRow[];
  catalogIds?: readonly string[];
  managedPackageIds?: string[];
}): string[];
