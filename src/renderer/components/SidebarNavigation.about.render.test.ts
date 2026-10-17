import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarNavigation.tsx');

describe('sidebar about section integration', () => {
  it('loads bundled about data first and refreshes it at runtime', async () => {
    const source = await fs.readFile(sidebarPath, 'utf8');

    assert.match(source, /loadBundledSidebarAbout/);
    assert.match(source, /createLoadingSidebarAboutFetchState/);
    assert.match(source, /refreshSidebarAboutModel/);
    assert.match(source, /aboutFetchState\.status === 'loading'/);
    assert.match(source, /aboutFetchState\.status === 'error'/);
    assert.match(source, /data-about-source=\{aboutModel\?\.source \?\? 'none'\}/);
  });

  it('renders nested official about sections and removes duplicated hard-coded links', async () => {
    const source = await fs.readFile(sidebarPath, 'utf8');

    assert.match(source, /renderAboutSectionTitle\(section\.id\)/);
    assert.match(source, /<ScrollArea\s+className="h-full"\s+type="auto"\s+scrollBarClassName="w-1\.5 p-0\.5"\s+scrollThumbClassName="bg-border\/65"\s+viewportClassName="\[&>div]:block!"/);
    assert.match(source, /grid grid-cols-4 gap-2/);
    assert.match(source, /https:\/\/www\.google\.com\/s2\/favicons/);
    assert.match(source, /<PopoverContent className="w-64 space-y-3" align="start">/);
    assert.doesNotMatch(source, /navigation\.about\.sectionDescription/);
    assert.doesNotMatch(source, /navigation\.about\.runtimeLabel/);
    assert.doesNotMatch(source, /navigation\.about\.updatedAt/);
    assert.match(source, /navigation\.about\.snapshotMissing/);
    assert.doesNotMatch(source, /tech-support/);
    assert.doesNotMatch(source, /discord-community/);
    assert.doesNotMatch(source, /github-project/);
  });

  it('renders related sites from the core helper directly below the community section', async () => {
    const source = await fs.readFile(sidebarPath, 'utf8');

    assert.match(source, /import \{ buildRelatedSitesModel, type RelatedSitesModel \} from '\.\.\/lib\/related-sites'/);
    assert.match(source, /const relatedSitesModel = useMemo\(\(\) => buildRelatedSitesModel\(aboutLocale\), \[aboutLocale\]\);/);
    assert.match(source, /section\.id === 'community' && relatedSitesModel/);
    assert.match(source, /!relatedSitesFollowCommunity && relatedSitesModel/);
    assert.match(source, /data-related-sites/);
  });

  it('opens related sites through the existing external-link path without a hard-coded list', async () => {
    const source = await fs.readFile(sidebarPath, 'utf8');

    assert.match(source, /onClick=\{\(\) => void openExternalUrl\(entry\.href\)\}/);
    assert.match(source, /<button\s+key=\{entry\.id\}\s+type="button"\s+aria-label=\{accessibleLabel\}/);
    assert.doesNotMatch(source, /tasks\.hagicode\.com|cost\.hagicode\.com|status\.hagicode\.com|builder\.hagicode\.com|HagiTask/);
  });
});
