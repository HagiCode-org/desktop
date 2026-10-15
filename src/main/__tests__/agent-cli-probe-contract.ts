// Pure assertion logic for the Agent CLI probe contract. No probe code is imported here.
// The integration test feeds real probe output into these functions; unit tests feed fakes.
import { expandExpectedLocation, extractSemver, isInsideExpectedLocation, normalizeLexicalPath } from '../../../scripts/agent-cli-probe/locations.mjs';

export interface CommandProbeLike {
  cliType: string;
  status: string;
  resolvedPath: string | null;
  version: string | null;
  message: string | null;
  commandCandidates?: string[];
}

export interface ContractViolation {
  kind:
    | 'not-available'
    | 'version-not-semver'
    | 'version-mismatch'
    | 'wrong-location'
    | 'false-positive'
    | 'surface-b-fallback'
    | 'surface-b-shim-order'
    | 'surface-b-version';
  message: string;
}

export type ControlOutcome = 'missing' | 'skipped' | 'false-positive' | 'unexpected';

const SEMVER_SHAPE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function stripLeadingV(version: string): string {
  return version.replace(/^v/i, '');
}

/** Pre-install probe: the CLI must be missing, unless the runner image preinstalls it (recorded as skipped). */
export function assertControl(input: { cliId: string; probe: CommandProbeLike; allowedPreinstalled: string[] }): { outcome: ControlOutcome; message: string } {
  const { cliId, probe, allowedPreinstalled } = input;
  if (probe.status === 'missing') {
    return { outcome: 'missing', message: `${cliId} is missing before install, as expected` };
  }
  if (probe.status === 'available') {
    if (allowedPreinstalled.includes(cliId)) {
      return { outcome: 'skipped', message: `${cliId} is preinstalled on the runner image (allowlisted); control skipped` };
    }
    return { outcome: 'false-positive', message: `${cliId} reported available before install at ${probe.resolvedPath ?? '<no path>'}` };
  }
  return { outcome: 'unexpected', message: `${cliId} pre-install probe returned ${probe.status}: ${probe.message ?? ''}` };
}

/**
 * Surface A: catalog probe for the case CLI, plus "no other non-preinstalled CLI is falsely available".
 */
export function assertSurfaceA(input: {
  cliId: string;
  probe: CommandProbeLike | undefined;
  referenceVersion: string;
  expectedDirectories: string[];
  platform: NodeJS.Platform;
  otherProbes: CommandProbeLike[];
  allowedPreinstalled: string[];
}): ContractViolation[] {
  const { cliId, probe, referenceVersion, expectedDirectories, platform, otherProbes, allowedPreinstalled } = input;
  const violations: ContractViolation[] = [];

  if (!probe || probe.status !== 'available') {
    violations.push({ kind: 'not-available', message: `${cliId} probe status is ${probe?.status ?? 'absent'}, expected available` });
  } else {
    const reported = probe.version ?? '';
    const reportedBare = stripLeadingV(reported);
    if (!SEMVER_SHAPE.test(reportedBare)) {
      violations.push({ kind: 'version-not-semver', message: `${cliId} version "${reported}" is not semver-shaped` });
    } else if (reportedBare !== stripLeadingV(referenceVersion)) {
      violations.push({ kind: 'version-mismatch', message: `${cliId} version ${reported} differs from reference ${referenceVersion}` });
    }
    if (!isInsideExpectedLocation(probe.resolvedPath, expectedDirectories, platform)) {
      violations.push({
        kind: 'wrong-location',
        message: `${cliId} resolved to ${probe.resolvedPath ?? '<none>'}, outside expected [${expectedDirectories.join(', ')}]`,
      });
    }
  }

  for (const other of otherProbes) {
    if (other.cliType === cliId) continue;
    if (allowedPreinstalled.includes(other.cliType)) continue;
    if (other.status === 'available') {
      violations.push({ kind: 'false-positive', message: `${other.cliType} was reported available but is not installed by this case (${other.resolvedPath ?? '<no path>'})` });
    }
  }
  return violations;
}

/** Windows shim order for an npm global bin. POSIX has only the extensionless file. */
export function shimCandidates(binName: string, platform: NodeJS.Platform): string[] {
  return platform === 'win32' ? [`${binName}.cmd`, `${binName}.ps1`, binName] : [binName];
}

/**
 * Surface B: the managed resolver with a non-existent static path must return the real shim, not the fallback,
 * in the Windows shim order, and that executable must report the reference version.
 */
export function assertSurfaceB(input: {
  binName: string;
  platform: NodeJS.Platform;
  staticPath: string;
  resolvedPath: string;
  existingNames: string[];
  probeVersion: string | null;
  referenceVersion: string;
}): ContractViolation[] {
  const { binName, platform, staticPath, resolvedPath, existingNames, probeVersion, referenceVersion } = input;
  const violations: ContractViolation[] = [];

  if (resolvedPath === staticPath) {
    violations.push({ kind: 'surface-b-fallback', message: `resolver returned the static fallback ${staticPath}` });
    return violations;
  }

  const candidates = shimCandidates(binName, platform);
  const expectedName = candidates.find((name) => existingNames.includes(name));
  const resolvedName = resolvedPath.split(/[\\/]/).pop() ?? '';
  if (expectedName && resolvedName !== expectedName) {
    violations.push({
      kind: 'surface-b-shim-order',
      message: `resolver returned ${resolvedName} but ${expectedName} exists and takes precedence`,
    });
  }

  if (probeVersion === null || stripLeadingV(probeVersion) !== stripLeadingV(referenceVersion)) {
    violations.push({
      kind: 'surface-b-version',
      message: `resolved executable reports ${probeVersion ?? 'no version'}, reference is ${referenceVersion}`,
    });
  }
  return violations;
}

export { expandExpectedLocation, extractSemver, normalizeLexicalPath };
