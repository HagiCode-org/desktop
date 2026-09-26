import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { VERSION_MANAGEMENT_TABS } from '../useVersionManagementTab.js';
import { areVersionManagementDataEquivalent } from '../versionManagementData.js';

const tabHookPath = path.resolve(process.cwd(), 'src/renderer/features/version-management/useVersionManagementTab.ts');
const tabContentPath = path.resolve(process.cwd(), 'src/renderer/features/version-management/VersionManagementTabContent.tsx');
const pagePath = path.resolve(process.cwd(), 'src/renderer/components/VersionManagementPage.tsx');

describe('version management refresh state', () => {
  it('keeps tab configurations and lazy loaders stable across page refresh renders', async () => {
    const [hookSource, tabContentSource] = await Promise.all([
      fs.readFile(tabHookPath, 'utf8'),
      fs.readFile(tabContentPath, 'utf8'),
    ]);

    assert.match(hookSource, /export const VERSION_MANAGEMENT_TABS:/);
    assert.match(hookSource, /tabs: VERSION_MANAGEMENT_TABS/);
    assert.equal(VERSION_MANAGEMENT_TABS.length, 3);
    assert.equal(
      VERSION_MANAGEMENT_TABS.find(tab => tab.id === 'sourceManagement')?.loader,
      VERSION_MANAGEMENT_TABS.find(tab => tab.id === 'sourceManagement')?.loader,
    );
    assert.match(tabContentSource, /useMemo\(\(\) => lazy\(activeTab\.loader\), \[activeTab\.loader\]\)/);
  });

  it('refreshes both automatically and manually without replacing the active tab', async () => {
    const [pageSource, tabContentSource] = await Promise.all([
      fs.readFile(pagePath, 'utf8'),
      fs.readFile(tabContentPath, 'utf8'),
    ]);

    assert.match(pageSource, /onVersionListChanged\(\(\) => \{[\s\S]*?void fetchAllData\(\);/);
    assert.match(pageSource, /onRefresh=\{fetchAllData\}/);
    assert.match(pageSource, /if \(!hasLoadedData\.current\) \{\s*setLoading\(true\);/);
    assert.match(pageSource, /requestId !== fetchRequestId\.current/);
    assert.doesNotMatch(pageSource, /VersionManagementTabContent\s+key=/);
    assert.match(tabContentSource, /<TabsContent key=\{activeTab\.id\}/);
    assert.match(tabContentSource, /<ActiveTabComponent \{\.\.\.tabProps\} \/>/);
  });

  it('does not replace equivalent version data or accept stale refresh values', async () => {
    const first = [{ id: 'v1', meta: { platform: 'linux' } }];
    const equivalent = [{ id: 'v1', meta: { platform: 'linux' } }];

    assert.equal(areVersionManagementDataEquivalent(first, equivalent), true);
    assert.equal(areVersionManagementDataEquivalent(first, [{ id: 'v2', meta: { platform: 'linux' } }]), false);
  });
});
