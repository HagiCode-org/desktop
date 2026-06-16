import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/SidebarNavigation.tsx');

describe('sidebar navigation ordering and featured styling', () => {
  it('keeps settings last and gives sponsor entries dedicated featured treatment', async () => {
    const source = await fs.readFile(sidebarPath, 'utf8');

    assert.match(source, /const settingsNavigationItem: NavigationItem = \{/);
    assert.match(source, /const featuredNavigationItems: NavigationItem\[] = \[\s*subscriptionNavigationItem,\s*turboEngineNavigationItem,\s*\];/s);
    assert.match(source, /return \[\.\.\.baseItems, \.\.\.featuredNavigationItems, settingsNavigationItem\];/);
    assert.match(source, /whileHover=\{isFeatured \? \{ x: 0, y: -2 \} : \{ x: 0 \}\}/);
    assert.match(source, /getFeaturedNavigationPalette\(item\.emphasis, isDarkTheme\)/);
  });
});
