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
        { packageId: 'pm2', packageStatus: 'installed', executablePath: '/toolchain/pm2', installedVersion: '7.0.1' },
      ],
    });

    assert.equal(remediation?.kind, 'dependency');
    assert.equal(remediation?.failureKind, 'dependency-missing');
    assert.deepEqual(remediation?.targetRuntimeIds, []);
    assert.deepEqual(remediation?.targetPackageIds, ['hagiscript']);
    assert.equal(remediation?.recommendedAction, 'open-dependency-management');
    assert.match(remediation?.message ?? '', /hagiscript/i);
  });

  it('classifies missing PM2 as a dependency remediation failure', () => {
    const remediation = buildOmniRouteDependencyRemediation({
      runtime: healthyRuntime,
      packages: [
        { packageId: 'hagiscript', packageStatus: 'installed', executablePath: '/toolchain/hagiscript', installedVersion: '0.2.3' },
        { packageId: 'pm2', packageStatus: 'not-installed', executablePath: null },
      ],
    });

    assert.equal(remediation?.kind, 'dependency');
    assert.equal(remediation?.failureKind, 'dependency-missing');
    assert.deepEqual(remediation?.targetRuntimeIds, []);
    assert.deepEqual(remediation?.targetPackageIds, ['pm2']);
    assert.equal(remediation?.recommendedAction, 'open-dependency-management');
    assert.match(remediation?.message ?? '', /PM2/);
  });

  it('classifies missing OmniRoute runtime as a runtime remediation failure with an actionable message', () => {
    const remediation = buildOmniRouteDependencyRemediation({
      runtime: {
        runtimeId: 'omniroute',
        runtimeInstallStatus: 'not-installed',
      },
      packages: [
        { packageId: 'hagiscript', packageStatus: 'installed', executablePath: '/toolchain/hagiscript', installedVersion: '0.2.3' },
        { packageId: 'pm2', packageStatus: 'installed', executablePath: '/toolchain/pm2', installedVersion: '7.0.1' },
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

  it('treats installed but unsupported package versions as dependency-version-mismatch guidance', () => {
    const problems = classifyOmniRouteDependencyProblems({
      runtime: healthyRuntime,
      packages: [
        { packageId: 'pm2', packageStatus: 'installed', executablePath: '/toolchain/pm2', installedVersion: '6.0.14' },
      ],
    });
    const remediation = buildOmniRouteDependencyRemediation({
      runtime: healthyRuntime,
      packages: [
        { packageId: 'pm2', packageStatus: 'installed', executablePath: '/toolchain/pm2', installedVersion: '6.0.14' },
      ],
    });

    assert.deepEqual(problems, [
      { kind: 'package', packageId: 'pm2', issue: 'version-mismatch' },
    ]);
    assert.equal(remediation?.failureKind, 'dependency-version-mismatch');
    assert.deepEqual(remediation?.targetPackageIds, ['pm2']);
    assert.match(remediation?.message ?? '', /unsupported version/i);
  });

  it('classifies combined hagiscript, PM2, and runtime failures together', () => {
    const remediation = buildOmniRouteDependencyRemediation({
      runtime: {
        runtimeId: 'omniroute',
        runtimeInstallStatus: 'failed',
      },
      packages: [
        { packageId: 'hagiscript', packageStatus: 'not-installed', executablePath: null },
        { packageId: 'pm2', packageStatus: 'not-installed', executablePath: null },
      ],
    });

    assert.equal(remediation?.failureKind, 'runtime-and-package');
    assert.deepEqual(remediation?.targetRuntimeIds, ['omniroute']);
    assert.deepEqual(remediation?.targetPackageIds, ['hagiscript', 'pm2']);
  });

  it('does not classify healthy runtime and managed dependencies as dependency guidance', () => {
    const remediation = buildOmniRouteDependencyRemediation({
      runtime: healthyRuntime,
      packages: [
        { packageId: 'hagiscript', packageStatus: 'installed', executablePath: '/toolchain/hagiscript', installedVersion: '0.2.3' },
        { packageId: 'pm2', packageStatus: 'installed', executablePath: '/toolchain/pm2', installedVersion: '7.0.1' },
      ],
    });

    assert.equal(remediation, undefined);
  });
});
