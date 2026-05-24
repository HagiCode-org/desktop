import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildOmniRouteDependencyRemediation,
  classifyOmniRouteDependencyProblems,
} from '../omniroute-remediation.js';

describe('omniroute remediation classification', () => {
  const healthyRuntime = {
    runtimeId: 'omniroute' as const,
    runtimeInstallStatus: 'installed' as const,
  };

  it('classifies missing hagiscript as a dependency remediation failure', () => {
    const remediation = buildOmniRouteDependencyRemediation({
      runtime: healthyRuntime,
      packages: [
        { packageId: 'hagiscript', packageStatus: 'not-installed', executablePath: null },
      ],
    });

    assert.equal(remediation?.kind, 'dependency');
    assert.equal(remediation?.failureKind, 'dependency-missing');
    assert.deepEqual(remediation?.targetRuntimeIds, []);
    assert.deepEqual(remediation?.targetPackageIds, ['hagiscript']);
    assert.equal(remediation?.recommendedAction, 'open-dependency-management');
    assert.match(remediation?.message ?? '', /hagiscript/i);
  });

  it('classifies missing OmniRoute runtime as a runtime remediation failure with an actionable message', () => {
    const remediation = buildOmniRouteDependencyRemediation({
      runtime: {
        runtimeId: 'omniroute',
        runtimeInstallStatus: 'not-installed',
      },
      packages: [
        { packageId: 'hagiscript', packageStatus: 'installed', executablePath: '/toolchain/hagiscript', installedVersion: '0.2.3' },
      ],
    });

    assert.equal(remediation?.failureKind, 'runtime-missing');
    assert.deepEqual(remediation?.targetRuntimeIds, ['omniroute']);
    assert.deepEqual(remediation?.targetPackageIds, []);
    assert.match(remediation?.message ?? '', /vendored runtime/i);
  });

  it('treats unknown or unusable package states as dependency-unknown guidance', () => {
    const problems = classifyOmniRouteDependencyProblems({
      runtime: healthyRuntime,
      packages: [
        { packageId: 'hagiscript', packageStatus: 'unknown', executablePath: null },
      ],
    });
    const remediation = buildOmniRouteDependencyRemediation({
      runtime: healthyRuntime,
      packages: [
        { packageId: 'hagiscript', packageStatus: 'unknown', executablePath: null },
      ],
    });

    assert.deepEqual(problems, [
      { kind: 'package', packageId: 'hagiscript', issue: 'unknown' },
    ]);
    assert.equal(remediation?.failureKind, 'dependency-unknown');
    assert.deepEqual(remediation?.targetPackageIds, ['hagiscript']);
  });

  it('classifies combined hagiscript and runtime failures together', () => {
    const remediation = buildOmniRouteDependencyRemediation({
      runtime: {
        runtimeId: 'omniroute',
        runtimeInstallStatus: 'failed',
      },
      packages: [
        { packageId: 'hagiscript', packageStatus: 'not-installed', executablePath: null },
      ],
    });

    assert.equal(remediation?.failureKind, 'runtime-and-package');
    assert.deepEqual(remediation?.targetRuntimeIds, ['omniroute']);
    assert.deepEqual(remediation?.targetPackageIds, ['hagiscript']);
  });

  it('does not classify healthy runtime and managed dependencies as dependency guidance', () => {
    const remediation = buildOmniRouteDependencyRemediation({
      runtime: healthyRuntime,
      packages: [
        { packageId: 'hagiscript', packageStatus: 'installed', executablePath: '/toolchain/hagiscript', installedVersion: '0.2.3' },
      ],
    });

    assert.equal(remediation, undefined);
  });
});
