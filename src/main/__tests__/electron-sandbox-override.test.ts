import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  applyElectronSandboxOverride,
  ELECTRON_SANDBOX_OVERRIDE_ENV_KEY,
  isTruthyElectronSandboxOverride,
  resolveElectronSandboxOverride,
} from '../electron-sandbox-override.js';

const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');

describe('electron sandbox override', () => {
  it('accepts documented truthy values case-insensitively with surrounding whitespace', () => {
    for (const value of ['1', 'true', 'TRUE', ' yes ', 'On', '\ton\n']) {
      assert.equal(isTruthyElectronSandboxOverride(value), true, value);
      assert.equal(
        resolveElectronSandboxOverride({ env: { [ELECTRON_SANDBOX_OVERRIDE_ENV_KEY]: value } }).enabled,
        true,
        value,
      );
    }
  });

  it('treats missing and non-documented values as disabled', () => {
    const cases: Array<{ value?: string; reason: 'missing-env-var' | 'falsy-env-var' }> = [
      { value: undefined, reason: 'missing-env-var' },
      { value: '', reason: 'falsy-env-var' },
      { value: '0', reason: 'falsy-env-var' },
      { value: 'false', reason: 'falsy-env-var' },
      { value: 'off', reason: 'falsy-env-var' },
      { value: 'no', reason: 'falsy-env-var' },
      { value: 'enabled', reason: 'falsy-env-var' },
    ];

    for (const testCase of cases) {
      const env = testCase.value === undefined ? {} : { [ELECTRON_SANDBOX_OVERRIDE_ENV_KEY]: testCase.value };
      const decision = resolveElectronSandboxOverride({ env });

      assert.equal(decision.enabled, false, testCase.value);
      assert.equal(decision.mode, 'default');
      assert.equal(decision.reason, testCase.reason);
      assert.deepEqual(decision.electronSwitches, []);
    }
  });

  it('emits process-level no-sandbox switch metadata and appends the same switch when enabled', () => {
    const appliedSwitches: string[] = [];
    const electronApp = {
      commandLine: {
        appendSwitch: (name: string, value?: string) => {
          appliedSwitches.push(value ? `${name}=${value}` : name);
        },
      },
    };

    const decision = applyElectronSandboxOverride(electronApp, {
      env: { [ELECTRON_SANDBOX_OVERRIDE_ENV_KEY]: 'yes' },
    });

    assert.equal(decision.enabled, true);
    assert.equal(decision.mode, 'sandbox-disabled-env-override');
    assert.deepEqual(decision.electronSwitches.map((electronSwitch) => electronSwitch.name), ['no-sandbox']);
    assert.deepEqual(appliedSwitches, ['no-sandbox']);
  });

  it('does not append sandbox switches when disabled', () => {
    const appliedSwitches: string[] = [];
    const electronApp = {
      commandLine: {
        appendSwitch: (name: string, value?: string) => {
          appliedSwitches.push(value ? `${name}=${value}` : name);
        },
      },
    };

    const decision = applyElectronSandboxOverride(electronApp, {
      env: { [ELECTRON_SANDBOX_OVERRIDE_ENV_KEY]: 'false' },
    });

    assert.equal(decision.enabled, false);
    assert.deepEqual(decision.electronSwitches, []);
    assert.deepEqual(appliedSwitches, []);
  });

  it('applies before managed window creation during main bootstrap', async () => {
    const source = await fs.readFile(mainPath, 'utf-8');
    const applyIndex = source.indexOf('const electronSandboxOverrideDecision = applyElectronSandboxOverride(app');
    const firstWindowIndex = source.indexOf('new BrowserWindow({');

    assert.notEqual(applyIndex, -1);
    assert.notEqual(firstWindowIndex, -1);
    assert.ok(applyIndex < firstWindowIndex);
    assert.match(source, /Electron sandbox override skipped/);
    assert.match(source, /disabled Electron sandboxing/);
  });

  it('documents the distinction from renderer sandbox and nodeIntegration settings in runtime metadata', () => {
    const decision = resolveElectronSandboxOverride({
      env: { [ELECTRON_SANDBOX_OVERRIDE_ENV_KEY]: '1' },
    });

    assert.equal(decision.processLevelOverride, true);
    assert.equal(decision.rendererSandboxSettingsChanged, false);
    assert.equal(decision.nodeIntegrationChanged, false);
  });

  it('leaves existing BrowserWindow nodeIntegration values unchanged', async () => {
    const source = await fs.readFile(mainPath, 'utf-8');
    const nodeIntegrationMatches = source.match(/nodeIntegration:\s*false/g) ?? [];

    assert.equal(nodeIntegrationMatches.length, 4);
    assert.doesNotMatch(source, /nodeIntegration:\s*true/);
  });
});

