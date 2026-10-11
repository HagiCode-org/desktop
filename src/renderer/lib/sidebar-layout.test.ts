import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SIDEBAR_AUTO_COLLAPSE_BELOW_PX,
  parseSidebarCollapsePreference,
  resolveSidebarCollapsed,
} from './sidebar-layout.js';

test('parseSidebarCollapsePreference only accepts explicit stored choices', () => {
  assert.equal(parseSidebarCollapsePreference('true'), true);
  assert.equal(parseSidebarCollapsePreference('false'), false);
  assert.equal(parseSidebarCollapsePreference(null), null);
  assert.equal(parseSidebarCollapsePreference(undefined), null);
  assert.equal(parseSidebarCollapsePreference('1'), null);
});

test('resolveSidebarCollapsed lets the window width decide until the user chooses', () => {
  assert.equal(resolveSidebarCollapsed(null, SIDEBAR_AUTO_COLLAPSE_BELOW_PX - 1), true);
  assert.equal(resolveSidebarCollapsed(null, SIDEBAR_AUTO_COLLAPSE_BELOW_PX), false);
  assert.equal(resolveSidebarCollapsed(null, 1920), false);
});

test('resolveSidebarCollapsed keeps an explicit choice at any width', () => {
  assert.equal(resolveSidebarCollapsed(false, 860), false);
  assert.equal(resolveSidebarCollapsed(true, 1920), true);
});
