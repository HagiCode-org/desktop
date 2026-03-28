import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { OFFICIAL_SERVER_HTTP_INDEX_URL } from '../../../../shared/package-source-defaults.js';

const selectorPath = path.resolve(process.cwd(), 'src/renderer/components/PackageSourceSelector.tsx');
const slicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/packageSourceSlice.ts');
const managerPath = path.resolve(process.cwd(), 'src/main/package-source-config-manager.ts');
const zhComponentsPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/zh-CN/components.json');
const enComponentsPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/en-US/components.json');
const githubOAuthSettingsPath = path.resolve(process.cwd(), 'src/renderer/components/settings/GitHubOAuthSettings.tsx');

describe('package source renderer cleanup', () => {
  it('only renders local-folder and http-index package source options', async () => {
    const selectorSource = await fs.readFile(selectorPath, 'utf8');

    assert.match(selectorSource, /SelectItem value="local-folder"/);
    assert.match(selectorSource, /SelectItem value="http-index"/);
    assert.doesNotMatch(selectorSource, /github-release/);
  });

  it('removes github-specific form state from the package source slice', async () => {
    const sliceSource = await fs.readFile(slicePath, 'utf8');

    assert.doesNotMatch(sliceSource, /githubOwner/);
    assert.doesNotMatch(sliceSource, /githubRepo/);
    assert.doesNotMatch(sliceSource, /githubToken/);
  });

  it('uses the shared official index constant across main defaults and renderer surfaces', async () => {
    const [selectorSource, sliceSource, managerSource] = await Promise.all([
      fs.readFile(selectorPath, 'utf8'),
      fs.readFile(slicePath, 'utf8'),
      fs.readFile(managerPath, 'utf8'),
    ]);

    assert.match(selectorSource, /OFFICIAL_SERVER_HTTP_INDEX_URL/);
    assert.match(sliceSource, /OFFICIAL_SERVER_HTTP_INDEX_URL/);
    assert.match(managerSource, /OFFICIAL_SERVER_HTTP_INDEX_URL/);
    assert.match(selectorSource, new RegExp(`placeholder=\\{OFFICIAL_SERVER_HTTP_INDEX_URL\\}`));
    assert.equal(selectorSource.includes(OFFICIAL_SERVER_HTTP_INDEX_URL), false);
    assert.equal(sliceSource.includes(OFFICIAL_SERVER_HTTP_INDEX_URL), false);
    assert.equal(managerSource.includes(OFFICIAL_SERVER_HTTP_INDEX_URL), false);
  });

  it('removes github source copy while keeping github oauth settings intact', async () => {
    const [zhRaw, enRaw, githubOAuthSource] = await Promise.all([
      fs.readFile(zhComponentsPath, 'utf8'),
      fs.readFile(enComponentsPath, 'utf8'),
      fs.readFile(githubOAuthSettingsPath, 'utf8'),
    ]);

    const zh = JSON.parse(zhRaw);
    const en = JSON.parse(enRaw);

    assert.equal('github' in zh.packageSource.sourceType, false);
    assert.equal('github' in en.packageSource.sourceType, false);
    assert.equal('github' in zh.packageSource, false);
    assert.equal('github' in en.packageSource, false);
    assert.match(githubOAuthSource, /githubOAuth/);
  });
});
