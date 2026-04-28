import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  applySteamLinuxStartupCompatibility,
  relaunchSteamLinuxOnHostIfNeeded,
  resolveSteamLinuxStartupCompatibility,
} from '../steam-linux-startup-compatibility.js';

const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');
const wrapperPath = path.resolve(process.cwd(), 'resources/linux/hagicode-steam-wrapper.sh');

describe('Steam Linux startup compatibility', () => {
  it('keeps direct Linux CLI launches on the default graphics path', () => {
    const decision = resolveSteamLinuxStartupCompatibility({
      platform: 'linux',
      env: {},
    });

    assert.equal(decision.launchSource, 'direct-cli');
    assert.equal(decision.compatibilityEnabled, false);
    assert.equal(decision.compatibilityMode, 'default');
    assert.deepEqual(decision.electronSwitches, []);
  });

  it('detects explicit Steam wrapper launches without forcing graphics switches', () => {
    const decision = resolveSteamLinuxStartupCompatibility({
      platform: 'linux',
      env: { HAGICODE_STEAM_LINUX: '1' },
    });

    assert.equal(decision.launchSource, 'steam');
    assert.equal(decision.detectorCategory, 'explicit-wrapper-env');
    assert.equal(decision.compatibilityEnabled, true);
    assert.equal(decision.compatibilityMode, 'steam-linux-detected');
    assert.deepEqual(decision.electronSwitches, []);
  });

  it('detects direct Steam executable launches even without the wrapper marker', () => {
    const decision = resolveSteamLinuxStartupCompatibility({
      platform: 'linux',
      env: { SteamAppId: '4625540' },
    });

    assert.equal(decision.launchSource, 'steam');
    assert.equal(decision.detectorCategory, 'steam-env');
    assert.equal(decision.compatibilityEnabled, true);
  });

  it('keeps host-reexec Steam launches on the host graphics stack', () => {
    const decision = resolveSteamLinuxStartupCompatibility({
      platform: 'linux',
      env: { HAGICODE_STEAM_LINUX: '1', HAGICODE_STEAM_HOST_REEXEC: '1' },
    });

    assert.equal(decision.launchSource, 'steam');
    assert.equal(decision.detectorCategory, 'host-reexec');
    assert.equal(decision.compatibilityMode, 'steam-linux-host-reexec');
    assert.deepEqual(decision.electronSwitches, []);
  });

  it('does not enable compatibility on non-Linux platforms', () => {
    const decision = resolveSteamLinuxStartupCompatibility({
      platform: 'win32',
      env: { SteamAppId: '4625540', HAGICODE_STEAM_LINUX: '1' },
    });

    assert.equal(decision.detectorCategory, 'non-linux');
    assert.equal(decision.compatibilityEnabled, false);
    assert.deepEqual(decision.electronSwitches, []);
  });

  it('does not append Electron switches when Steam Linux compatibility is detected', () => {
    const appliedSwitches: string[] = [];
    const electronApp = {
      commandLine: {
        appendSwitch: (name: string, value?: string) => {
          appliedSwitches.push(value ? `${name}=${value}` : name);
        },
      },
    };

    applySteamLinuxStartupCompatibility(electronApp, {
      platform: 'linux',
      env: { SteamGameId: '4625540' },
    });

    assert.deepEqual(appliedSwitches, []);
  });

  it('does not relaunch again after the host re-exec marker is present', () => {
    const result = relaunchSteamLinuxOnHostIfNeeded({
      platform: 'linux',
      env: {
        HAGICODE_STEAM_LINUX: '1',
        HAGICODE_STEAM_HOST_REEXEC: '1',
        container: 'pressure-vessel',
      },
      argv: ['/opt/Hagicode/hagicode-desktop'],
      cwd: '/opt/Hagicode',
      execPath: '/opt/Hagicode/hagicode-desktop',
    });

    assert.equal(result.attempted, false);
    assert.equal(result.handled, false);
    assert.equal(result.reason, 'already-host-reexec');
  });

  it('keeps Steam host relaunch before the first BrowserWindow is created', async () => {
    const source = await fs.readFile(mainPath, 'utf-8');
    const relaunchIndex = source.indexOf('const steamLinuxHostRelaunchResult = relaunchSteamLinuxOnHostIfNeeded({');
    const firstWindowIndex = source.indexOf('new BrowserWindow({');

    assert.notEqual(relaunchIndex, -1);
    assert.notEqual(firstWindowIndex, -1);
    assert.ok(relaunchIndex < firstWindowIndex);
  });

  it('applies before the first BrowserWindow is created', async () => {
    const source = await fs.readFile(mainPath, 'utf-8');
    const applyIndex = source.indexOf('const steamLinuxStartupCompatibilityDecision = applySteamLinuxStartupCompatibility(app');
    const firstWindowIndex = source.indexOf('new BrowserWindow({');

    assert.notEqual(applyIndex, -1);
    assert.notEqual(firstWindowIndex, -1);
    assert.ok(applyIndex < firstWindowIndex);
  });

  it('marks and sanitizes Steam wrapper launches without removing bundled resources', async () => {
    const wrapper = await fs.readFile(wrapperPath, 'utf-8');

    assert.match(wrapper, /export HAGICODE_STEAM_LINUX=1/);
    assert.doesNotMatch(wrapper, /HAGICODE_DISABLE_ELECTRON_SANDBOX=1/);
    assert.doesNotMatch(wrapper, /--no-sandbox/);
    assert.doesNotMatch(wrapper, /--disable-setuid-sandbox/);
    assert.match(wrapper, /HAGICODE_STEAM_HOST_REEXEC=1/);
    assert.match(wrapper, /steam-runtime-launch-client/);
    assert.match(wrapper, /--host/);
    assert.match(wrapper, /--\s+\\\s+\/usr\/bin\/env/);
    assert.match(wrapper, /unset LD_PRELOAD/);
    assert.match(wrapper, /unset LD_LIBRARY_PATH/);
    assert.match(wrapper, /unset GSETTINGS_SCHEMA_DIR/);
    assert.doesNotMatch(wrapper, /rm\s+-rf/);
    assert.doesNotMatch(wrapper, /resources\/dotnet/);
    assert.doesNotMatch(wrapper, /resources\/extra\/toolchain/);
  });
});
