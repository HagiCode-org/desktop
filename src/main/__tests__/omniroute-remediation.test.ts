import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildOmniRouteDependencyRemediation,
  classifyOmniRouteDependencyProblems,
} from '../omniroute-remediation.js';

describe('omniroute remediation classification', () => {
  it('classifies missing PM2 as a dependency remediation failure', () => {
    const remediation = buildOmniRouteDependencyRemediation([
      { packageId: 'pm2', packageStatus: 'not-installed', executablePath: null },
      { packageId: 'omniroute', packageStatus: 'installed', executablePath: '/toolchain/omniroute', installedVersion: '3.6.9' },
    ]);

    assert.equal(remediation?.kind, 'dependency');
    assert.equal(remediation?.failureKind, 'dependency-missing');
    assert.deepEqual(remediation?.targetPackageIds, ['pm2']);
    assert.equal(remediation?.recommendedAction, 'open-dependency-management');
    assert.match(remediation?.message ?? '', /PM2/);
  });

  it('classifies missing OmniRoute as a dependency remediation failure with an actionable message', () => {
    const remediation = buildOmniRouteDependencyRemediation([
      { packageId: 'pm2', packageStatus: 'installed', executablePath: '/toolchain/pm2', installedVersion: '7.0.1' },
      { packageId: 'omniroute', packageStatus: 'not-installed', executablePath: null },
    ]);

    assert.equal(remediation?.failureKind, 'dependency-missing');
    assert.deepEqual(remediation?.targetPackageIds, ['omniroute']);
    assert.match(remediation?.message ?? '', /Dependency Management and retry/);
  });

  it('treats unknown or unusable package states as dependency-unknown guidance', () => {
    const problems = classifyOmniRouteDependencyProblems([
      { packageId: 'pm2', packageStatus: 'unknown', executablePath: null },
      { packageId: 'omniroute', packageStatus: 'installed', executablePath: null },
    ]);
    const remediation = buildOmniRouteDependencyRemediation([
      { packageId: 'pm2', packageStatus: 'unknown', executablePath: null },
      { packageId: 'omniroute', packageStatus: 'installed', executablePath: null },
    ]);

    assert.deepEqual(problems, [
      { packageId: 'pm2', issue: 'unknown' },
      { packageId: 'omniroute', issue: 'unknown' },
    ]);
    assert.equal(remediation?.failureKind, 'dependency-unknown');
    assert.deepEqual(remediation?.targetPackageIds, ['pm2', 'omniroute']);
  });

  it('treats installed but unsupported package versions as dependency-version-mismatch guidance', () => {
    const problems = classifyOmniRouteDependencyProblems([
      { packageId: 'pm2', packageStatus: 'installed', executablePath: '/toolchain/pm2', installedVersion: '6.0.14' },
      { packageId: 'omniroute', packageStatus: 'installed', executablePath: '/toolchain/omniroute', installedVersion: '3.6.9' },
    ]);
    const remediation = buildOmniRouteDependencyRemediation([
      { packageId: 'pm2', packageStatus: 'installed', executablePath: '/toolchain/pm2', installedVersion: '6.0.14' },
      { packageId: 'omniroute', packageStatus: 'installed', executablePath: '/toolchain/omniroute', installedVersion: '3.6.9' },
    ]);

    assert.deepEqual(problems, [
      { packageId: 'pm2', issue: 'version-mismatch' },
    ]);
    assert.equal(remediation?.failureKind, 'dependency-version-mismatch');
    assert.deepEqual(remediation?.targetPackageIds, ['pm2']);
    assert.match(remediation?.message ?? '', /unsupported version/i);
  });

  it('does not classify healthy managed dependencies as dependency guidance', () => {
    const remediation = buildOmniRouteDependencyRemediation([
      { packageId: 'pm2', packageStatus: 'installed', executablePath: '/toolchain/pm2', installedVersion: '7.0.1' },
      { packageId: 'omniroute', packageStatus: 'installed', executablePath: '/toolchain/omniroute', installedVersion: '3.6.9' },
    ]);

    assert.equal(remediation, undefined);
  });
});
