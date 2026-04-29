import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { dump } from 'js-yaml';
import { generateI18nResources, verifyGeneratedI18nResources } from '../generate-i18n-resources.mjs';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directoryPath) => fs.rm(directoryPath, { recursive: true, force: true })),
  );
});

async function createFixture() {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hagicode-desktop-i18n-'));
  temporaryDirectories.push(fixtureRoot);

  const localesRoot = path.join(fixtureRoot, 'locales');
  const generatedRoot = path.join(fixtureRoot, 'generated');
  const sourceByLocale = {
    'en-US': {
      title: 'Desktop',
      sections: {
        welcome: 'Hello {{name}}',
      },
      badges: ['stable', 'local'],
    },
    'zh-CN': {
      title: '桌面端',
      sections: {
        welcome: '你好 {{name}}',
      },
      badges: ['稳定', '本地'],
    },
  };

  for (const [locale, source] of Object.entries(sourceByLocale)) {
    const localeDirectory = path.join(localesRoot, locale);
    await fs.mkdir(localeDirectory, { recursive: true });
    await fs.writeFile(path.join(localeDirectory, 'common.yml'), dump(source, { lineWidth: -1, noRefs: true }), 'utf8');
  }

  return {
    localesRoot,
    generatedRoot,
    expectedLocales: ['en-US', 'zh-CN'],
    expectedNamespaces: ['common'],
  };
}

describe('generate-i18n-resources', () => {
  it('writes deterministic generated JSON from YAML locale sources', async () => {
    const fixture = await createFixture();

    await generateI18nResources(fixture);

    const generated = await fs.readFile(path.join(fixture.generatedRoot, 'en-US', 'common.json'), 'utf8');
    assert.equal(
      generated,
      `${JSON.stringify(
        {
          title: 'Desktop',
          sections: { welcome: 'Hello {{name}}' },
          badges: ['stable', 'local'],
        },
        null,
        2,
      )}\n`,
    );

    await assert.doesNotReject(() => verifyGeneratedI18nResources(fixture));
  });

  it('fails validation when generated JSON is missing', async () => {
    const fixture = await createFixture();

    await generateI18nResources(fixture);
    await fs.rm(path.join(fixture.generatedRoot, 'zh-CN', 'common.json'));

    await assert.rejects(
      () => verifyGeneratedI18nResources(fixture),
      /generated namespaces must match i18nConfig\.ns|ENOENT/,
    );
  });

  it('fails validation when generated JSON is stale', async () => {
    const fixture = await createFixture();

    await generateI18nResources(fixture);
    await fs.writeFile(
      path.join(fixture.generatedRoot, 'zh-CN', 'common.json'),
      `${JSON.stringify({ title: 'stale' }, null, 2)}\n`,
      'utf8',
    );

    await assert.rejects(
      () => verifyGeneratedI18nResources(fixture),
      /zh-CN\/common\.json is stale; rerun npm run i18n:generate/,
    );
  });
});
