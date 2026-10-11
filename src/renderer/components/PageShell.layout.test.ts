import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const rendererRoot = path.resolve(process.cwd(), 'src/renderer');
const read = (relativePath: string) => fs.readFile(path.join(rendererRoot, relativePath), 'utf8');

const sharedShellViews = [
  'components/SystemManagementView.tsx',
  'components/VersionManagementPage.tsx',
  'components/DependencyManagementPage.tsx',
  'components/SystemDiagnosticPage.tsx',
  'features/settings/components/SettingsPage.tsx',
  'components/subscription/SubscriptionPage.tsx',
  'components/turboengine/TurboEnginePage.tsx',
];

// The sidebar takes 64-256px of the window, so these views size their panels from
// their own container (`@4xl:`) instead of the viewport (`lg:`).
const containerDrivenViews = [
  ...sharedShellViews,
  'components/ui/page-header.tsx',
  'features/settings/components/tabs/NotificationTab.tsx',
  'features/dependency-management/components/EnvironmentTab.tsx',
];

describe('desktop page layout', () => {
  it('shares one size-container frame across the sidebar views', async () => {
    const shell = await read('components/ui/page-shell.tsx');
    assert.match(shell, /@container mx-auto w-full max-w-7xl space-y-4/);

    for (const view of sharedShellViews) {
      const source = await read(view);
      assert.match(source, /<PageShell[ >]/, view);
      assert.doesNotMatch(source, /mx-auto max-w-[56]xl/, view);
      assert.doesNotMatch(source, /px-4 py-6/, `${view} must not add padding on top of the app shell`);
    }
  });

  it('switches panel layout on container width, not on viewport breakpoints', async () => {
    for (const view of containerDrivenViews) {
      const source = await read(view);
      assert.doesNotMatch(source, /(?<![@\w])(?:md|lg|xl):(?:grid-cols|flex-row|w-72)/, view);
    }
  });

  it('keeps the settings navigation beside the content only when the page is wide enough', async () => {
    const [layout, page] = await Promise.all([
      read('features/settings/components/SettingsPage.tsx'),
      read('components/SettingsPage.tsx'),
    ]);

    assert.match(layout, /@4xl:flex-row/);
    assert.match(page, /@4xl:w-60/);
    assert.doesNotMatch(page, /overflow-x-auto/);
  });
});
