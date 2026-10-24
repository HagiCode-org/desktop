import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_STARTUP_PHASE_WINDOW_MS,
  resolveStartupTimeouts,
  WEB_SERVICE_STARTUP_TIMEOUT_ENV_KEY,
} from '../web-service-startup-timeouts.js';

describe('resolveStartupTimeouts', () => {
  it('uses the explicit dependency value without clamping it', () => {
    const resolved = resolveStartupTimeouts({
      depsTimeoutMs: 5_000,
      envValue: '90000',
      isFirstLaunch: true,
    });

    assert.equal(resolved.startupLimitMs, 5_000);
    assert.equal(resolved.warning, null);
  });

  it('applies the environment override regardless of first-launch state', () => {
    const resolved = resolveStartupTimeouts({ envValue: '90000', isFirstLaunch: true });

    assert.equal(resolved.startupLimitMs, 90_000);
    assert.equal(resolved.warning, null);
  });

  it('clamps environment values below 30 seconds and above 600 seconds', () => {
    assert.equal(resolveStartupTimeouts({ envValue: '5000', isFirstLaunch: false }).startupLimitMs, 30_000);
    assert.equal(resolveStartupTimeouts({ envValue: '9999999', isFirstLaunch: false }).startupLimitMs, 600_000);
  });

  it('ignores an invalid environment value with a warning and falls back to the default', () => {
    const resolved = resolveStartupTimeouts({ envValue: 'abc', isFirstLaunch: false });

    assert.equal(resolved.startupLimitMs, 120_000);
    assert.match(resolved.warning ?? '', new RegExp(WEB_SERVICE_STARTUP_TIMEOUT_ENV_KEY));
    assert.match(resolved.warning ?? '', /abc/);
  });

  it('ignores non-positive environment values with a warning', () => {
    const resolved = resolveStartupTimeouts({ envValue: '0', isFirstLaunch: true });

    assert.equal(resolved.startupLimitMs, 180_000);
    assert.notEqual(resolved.warning, null);
  });

  it('treats a blank environment value as unset without a warning', () => {
    const resolved = resolveStartupTimeouts({ envValue: '   ', isFirstLaunch: false });

    assert.equal(resolved.startupLimitMs, 120_000);
    assert.equal(resolved.warning, null);
  });

  it('uses 180 seconds on the first launch after installation', () => {
    const resolved = resolveStartupTimeouts({ isFirstLaunch: true });

    assert.equal(resolved.startupLimitMs, 180_000);
    assert.equal(resolved.phaseWindowMs, DEFAULT_STARTUP_PHASE_WINDOW_MS);
  });

  it('uses 120 seconds on a normal launch', () => {
    const resolved = resolveStartupTimeouts({ isFirstLaunch: false });

    assert.equal(resolved.startupLimitMs, 120_000);
    assert.equal(resolved.phaseWindowMs, 30_000);
  });

  it('accepts an injected phase window for tests', () => {
    const resolved = resolveStartupTimeouts({ isFirstLaunch: false, phaseWindowMs: 250 });

    assert.equal(resolved.phaseWindowMs, 250);
  });
});
