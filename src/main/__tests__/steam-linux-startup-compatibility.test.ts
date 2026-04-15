import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  applySteamLinuxStartupCompatibility,
  clearRecordedStartupCompatibilityDecision,
  getRecordedStartupCompatibilityDecision,
  resolveSteamLinuxStartupCompatibility,
} from '../linux-startup-compatibility.js';
import { buildStartupFailurePayload } from '../startup-failure-payload.js';
import type { StartResult } from '../manifest-reader.js';

const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');

afterEach(() => {
  clearRecordedStartupCompatibilityDecision();
});

describe('steam linux startup compatibility', () => {
  it('enables compatibility mode for packaged Linux launches under Steam runtime hints', () => {
    const decision = resolveSteamLinuxStartupCompatibility({
      platform: 'linux',
      isPackaged: true,
      env: {
        SteamAppId: '123456',
        STEAM_COMPAT_DATA_PATH: '/tmp/steam-compat',
      },
      argv: ['/opt/Hagicode Desktop/hagicode-desktop'],
      execPath: '/opt/Hagicode Desktop/hagicode-desktop',
      cwd: '/home/tester/.local/share/Steam/steamapps/common/Hagicode Desktop',
      resourcesPath: '/opt/Hagicode Desktop/resources',
      portablePayloadRoot: '/opt/Hagicode Desktop/resources/extra/portable-fixed/current',
      existsSync: target => (
        target.endsWith(path.join('portable-fixed', 'current', 'manifest.json')) ||
        target.endsWith(path.join('portable-fixed', 'current', 'lib', 'PCode.Web.dll'))
      ),
    });

    assert.equal(decision.enabled, true);
    assert.equal(decision.mode, 'steam-linux-software-rendering');
    assert.equal(decision.launchSource, 'steam');
    assert.equal(decision.detectorCategory, 'steam-runtime-env+portable-payload');
    assert.equal(decision.disableHardwareAcceleration, true);
    assert.deepEqual(
      decision.electronSwitches.map((electronSwitch) => electronSwitch.name),
      ['disable-gpu', 'disable-gpu-compositing', 'disable-gpu-rasterization'],
    );
  });

  it('keeps direct CLI launches on the default path even when the packaged portable payload exists', () => {
    const decision = resolveSteamLinuxStartupCompatibility({
      platform: 'linux',
      isPackaged: true,
      env: {},
      argv: ['/opt/Hagicode Desktop/hagicode-desktop'],
      execPath: '/opt/Hagicode Desktop/hagicode-desktop',
      cwd: '/opt/Hagicode Desktop',
      resourcesPath: '/opt/Hagicode Desktop/resources',
      portablePayloadRoot: '/opt/Hagicode Desktop/resources/extra/portable-fixed/current',
      existsSync: target => (
        target.endsWith(path.join('portable-fixed', 'current', 'manifest.json')) ||
        target.endsWith(path.join('portable-fixed', 'current', 'lib', 'PCode.Web.dll'))
      ),
    });

    assert.equal(decision.enabled, false);
    assert.equal(decision.mode, 'default');
    assert.equal(decision.launchSource, 'direct-cli');
    assert.equal(decision.detectorCategory, 'direct-cli-default');
    assert.equal(decision.portablePayloadDetected, true);
    assert.deepEqual(decision.electronSwitches, []);
  });

  it('records the compatibility state so later startup diagnostics keep the Steam-vs-CLI distinction', () => {
    const appliedSwitches: string[] = [];
    const electronApp = {
      disableHardwareAcceleration: () => {
        appliedSwitches.push('disableHardwareAcceleration');
      },
      commandLine: {
        appendSwitch: (name: string, value?: string) => {
          appliedSwitches.push(value ? `${name}=${value}` : name);
        },
      },
    };

    const decision = applySteamLinuxStartupCompatibility(electronApp, {
      platform: 'linux',
      isPackaged: true,
      env: {
        SteamAppId: '123456',
      },
      argv: ['/opt/Hagicode Desktop/hagicode-desktop'],
      execPath: '/opt/Hagicode Desktop/hagicode-desktop',
      cwd: '/opt/Hagicode Desktop',
      resourcesPath: '/opt/Hagicode Desktop/resources',
    });

    const result: StartResult = {
      success: false,
      resultSession: {
        exitCode: -1,
        stdout: '',
        stderr: 'segmentation fault',
        duration: 0,
        timestamp: '2026-04-15T00:00:00.000Z',
        success: false,
      },
      parsedResult: {
        success: false,
        errorMessage: 'Service failed after startup',
        rawOutput: 'segmentation fault',
      },
    };

    const payload = buildStartupFailurePayload(result, 36556);

    assert.equal(getRecordedStartupCompatibilityDecision()?.detectorCategory, decision.detectorCategory);
    assert.deepEqual(appliedSwitches, [
      'disableHardwareAcceleration',
      'disable-gpu',
      'disable-gpu-compositing',
      'disable-gpu-rasterization',
    ]);
    assert.match(payload.log, /\[StartupCompatibility\] launchSource=steam/);
    assert.equal(payload.startupCompatibility?.enabled, true);
    assert.equal(payload.startupCompatibility?.mode, 'steam-linux-software-rendering');
  });

  it('applies the compatibility decision before the main window startup path runs', async () => {
    const source = await fs.readFile(mainPath, 'utf-8');
    const applyIndex = source.indexOf('const startupCompatibilityDecision = applySteamLinuxStartupCompatibility(app');
    const createWindowIndex = source.lastIndexOf('\n  createWindow();');

    assert.notEqual(applyIndex, -1);
    assert.notEqual(createWindowIndex, -1);
    assert.ok(applyIndex < createWindowIndex);
    assert.match(source, /Steam Linux compatibility mode enabled/);
    assert.match(source, /startupCompatibilityDetectorCategory/);
  });
});
