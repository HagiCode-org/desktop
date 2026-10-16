import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const systemManagementViewPath = path.resolve(process.cwd(), 'src/renderer/components/SystemManagementView.tsx');

describe('home footer build info line', () => {
  it('reads the build info through the hook and shortens the commit for display', async () => {
    const source = await fs.readFile(systemManagementViewPath, 'utf8');

    assert.match(source, /import \{ shortBuildCommit, useDesktopBuildInfo \} from '\.\.\/hooks\/useDesktopBuildInfo';/);
    assert.match(source, /const buildInfo = useDesktopBuildInfo\(\);/);
    assert.match(source, /shortBuildCommit\(buildInfo\.buildCommit\)/);
  });

  it('keeps the copyright line first and renders the build line only when the payload is ready', async () => {
    const source = await fs.readFile(systemManagementViewPath, 'utf8');

    const footer = source.match(/<footer className="px-1 py-2 text-center">([\s\S]*?)<\/footer>/)?.[1] ?? '';
    assert.ok(footer.length > 0, 'footer element not found');

    const copyrightIndex = footer.indexOf("{t('footer.copyright')}");
    const readyIndex = footer.indexOf("buildInfo.status === 'ready'");
    assert.ok(copyrightIndex >= 0, 'copyright line missing');
    assert.ok(readyIndex > copyrightIndex, 'build line must follow the copyright line');
    assert.match(footer, /buildInfo\.status === 'ready' \? \(/);
    assert.match(footer, /: null/);
  });

  it('shows version, branch, and short commit with localized labels and literal values', async () => {
    const source = await fs.readFile(systemManagementViewPath, 'utf8');

    assert.match(source, /\{t\('footer\.buildVersion'\)\} \{buildInfo\.desktopVersion\}/);
    assert.match(source, /\{t\('footer\.buildBranch'\)\} \{buildInfo\.buildBranch\}/);
    assert.match(source, /\{t\('footer\.buildCommit'\)\} \{shortBuildCommit\(buildInfo\.buildCommit\)\}/);
  });

  it('wraps long branch names instead of overflowing the footer', async () => {
    const source = await fs.readFile(systemManagementViewPath, 'utf8');

    assert.match(source, /<p className="break-words text-sm text-muted-foreground">/);
    assert.match(source, /<footer className="px-1 py-2 text-center">/);
  });
});
