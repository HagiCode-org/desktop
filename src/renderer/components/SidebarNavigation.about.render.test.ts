import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarNavigation.tsx');

describe('sidebar related sites under the official website entry', () => {
  it('no longer wires the removed about feed into the sidebar', async () => {
    const source = await fs.readFile(sidebarPath, 'utf8');

    assert.doesNotMatch(source, /loadBundledSidebarAbout/);
    assert.doesNotMatch(source, /refreshSidebarAboutModel/);
    assert.doesNotMatch(source, /navigation\.about/);
    assert.doesNotMatch(source, /data-about-source/);
    assert.doesNotMatch(source, /google\.com\/s2\/favicons/);
    assert.doesNotMatch(source, /<PopoverContent/);
    assert.doesNotMatch(source, /grid grid-cols-4 gap-2/);
  });

  it('keeps the scroll region and removes duplicated hard-coded links', async () => {
    const source = await fs.readFile(sidebarPath, 'utf8');

    assert.match(source, /<ScrollArea\s+className="h-full"\s+type="auto"\s+scrollBarClassName="w-1\.5 p-0\.5"\s+scrollThumbClassName="bg-border\/65"\s+viewportClassName="\[&>div]:block!"/);
    assert.doesNotMatch(source, /tech-support/);
    assert.doesNotMatch(source, /discord-community/);
    assert.doesNotMatch(source, /github-project/);
  });

  it('renders related sites from the core helper directly below the official website entry', async () => {
    const source = await fs.readFile(sidebarPath, 'utf8');

    assert.match(source, /import \{ buildRelatedSitesModel, type RelatedSitesModel \} from '\.\.\/lib\/related-sites'/);
    assert.match(source, /const relatedSitesModel = useMemo\(\(\) => buildRelatedSitesModel\(relatedSitesLocale\), \[relatedSitesLocale\]\);/);
    assert.match(source, /data-related-sites/);
    assert.doesNotMatch(source, /community/);

    const officialEntryIndex = source.indexOf('handleNavClick(officialWebsiteItem)');
    const relatedSitesIndex = source.indexOf('renderRelatedSitesBlock(relatedSitesModel)');
    assert.ok(officialEntryIndex > -1, 'official website entry is rendered');
    assert.ok(relatedSitesIndex > officialEntryIndex, 'related sites are rendered after the official website entry');
    assert.match(source, /\{!collapsed && relatedSitesModel \? \(/);
  });

  it('opens related sites through the existing external-link path without a hard-coded list', async () => {
    const source = await fs.readFile(sidebarPath, 'utf8');

    assert.match(source, /onClick=\{\(\) => void openExternalUrl\(entry\.href\)\}/);
    assert.match(source, /<button\s+key=\{entry\.id\}\s+type="button"\s+aria-label=\{accessibleLabel\}/);
    assert.doesNotMatch(source, /tasks\.hagicode\.com|cost\.hagicode\.com|status\.hagicode\.com|builder\.hagicode\.com|HagiTask/);
  });
});
