import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterUpdateCandidatesByChannel,
  isStableVersion,
  pickInstallCandidate,
} from '../version-channel.js';

const v = (version: string, channel?: string) => ({ version, channel });

describe('version channel selection', () => {
  it('treats semver releases without a prerelease tag as stable, ignoring the index label', () => {
    assert.equal(isStableVersion(v('0.1.0', 'beta')), true);
    assert.equal(isStableVersion(v('1.0.0')), true);
    assert.equal(isStableVersion(v('0.1.0-beta.96', 'stable')), false);
    assert.equal(isStableVersion(v('1.0.0-rc.1')), false);
    assert.equal(isStableVersion(v('not-semver', 'stable')), true);
    assert.equal(isStableVersion(v('not-semver', 'beta')), false);
  });

  it('keeps stable installs on stable releases when no channel is configured', () => {
    const list = [v('0.1.1-beta.1'), v('0.1.0'), v('0.1.0-beta.96')];
    assert.deepEqual(
      filterUpdateCandidatesByChannel(list, { currentVersion: '0.1.0' }).map((x) => x.version),
      ['0.1.0'],
    );
  });

  it('lets prerelease installs roll onto newer prereleases and the stable release', () => {
    const list = [v('0.1.1-beta.1'), v('0.1.0'), v('0.1.0-beta.96')];
    assert.equal(filterUpdateCandidatesByChannel(list, { currentVersion: '0.1.0-beta.95' }).length, 3);
  });

  it('honours an explicit channel preference over the installed version', () => {
    const list = [v('0.1.1-beta.1'), v('0.1.0')];
    assert.deepEqual(
      filterUpdateCandidatesByChannel(list, { preferredChannel: 'beta', currentVersion: '0.1.0' }).length,
      2,
    );
    assert.deepEqual(
      filterUpdateCandidatesByChannel(list, { preferredChannel: ' Stable ', currentVersion: '0.1.0-beta.1' })
        .map((x) => x.version),
      ['0.1.0'],
    );
  });

  it('picks the newest stable release for a first install, else the newest version', () => {
    const withStable = [v('0.1.1-beta.2'), v('0.1.1-beta.1'), v('0.1.0')];
    assert.equal(pickInstallCandidate(withStable)?.version, '0.1.0');
    assert.equal(pickInstallCandidate(withStable, 'beta')?.version, '0.1.1-beta.2');
    const betaOnly = [v('0.1.0-beta.96'), v('0.1.0-beta.95')];
    assert.equal(pickInstallCandidate(betaOnly)?.version, '0.1.0-beta.96');
    assert.equal(pickInstallCandidate(betaOnly, 'stable')?.version, '0.1.0-beta.96');
    assert.equal(pickInstallCandidate([]), undefined);
  });
});

describe('version channel with a stable 0.2.0 index', () => {
  // Newest first, as the index lists them: stable 0.2.0 next to the 0.1.0-beta.N train.
  const index = [v('0.2.0', 'stable'), v('0.1.0-beta.107', 'beta'), v('0.1.0-beta.106', 'beta')];

  it('a prerelease install is offered 0.2.0 as its newest candidate', () => {
    const candidates = filterUpdateCandidatesByChannel(index, { currentVersion: '0.1.0-beta.107' });
    assert.equal(candidates.length, 3);
    assert.equal(candidates[0]?.version, '0.2.0');
  });

  it('a stable install ignores a newer prerelease of the next line', () => {
    const withNewerPrerelease = [v('0.2.1-beta.1', 'beta'), v('0.2.0', 'stable'), v('0.1.0-beta.107', 'beta')];
    const candidates = filterUpdateCandidatesByChannel(withNewerPrerelease, { currentVersion: '0.2.0' });
    assert.deepEqual(candidates.map((x) => x.version), ['0.2.0']);
  });

  it('a first install picks 0.2.0, also when a newer prerelease is listed', () => {
    assert.equal(pickInstallCandidate(index)?.version, '0.2.0');
    const withNewerPrerelease = [v('0.2.1-beta.1', 'beta'), v('0.2.0', 'stable')];
    assert.equal(pickInstallCandidate(withNewerPrerelease)?.version, '0.2.0');
  });
});
