import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { DESKTOP_LANGUAGES } from '../../../shared/desktop-languages.js';

const localesRoot = path.resolve(process.cwd(), 'src/renderer/i18n/locales');
const namespaces = ['common', 'components', 'installation', 'onboarding', 'pages', 'prompt-guidance', 'ui'] as const;

function collectScalarPaths(value: unknown, prefix: readonly string[] = []): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return [prefix.join('.')];
  }

  return Object.entries(value).flatMap(([key, child]) => collectScalarPaths(child, [...prefix, key]));
}

function collectPlaceholders(value: unknown, prefix: readonly string[] = [], output = new Map<string, string[]>()) {
  if (typeof value === 'string') {
    output.set(prefix.join('.'), [...value.matchAll(/{{[^}]+}}/g)].map((match) => match[0]).sort());
    return output;
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      collectPlaceholders(child, [...prefix, key], output);
    }
  }

  return output;
}

async function readNamespace(locale: string, namespace: string) {
  const raw = await fs.readFile(path.join(localesRoot, locale, `${namespace}.json`), 'utf8');
  return {
    raw,
    data: JSON.parse(raw),
  };
}

describe('desktop locale resources', () => {
  it('provides a complete namespace set for every supported language', async () => {
    for (const language of DESKTOP_LANGUAGES) {
      for (const namespace of namespaces) {
        await assert.doesNotReject(() => fs.access(path.join(localesRoot, language.code, `${namespace}.json`)));
      }
    }
  });

  it('keeps translated locale keys and interpolation placeholders aligned with en-US', async () => {
    for (const namespace of namespaces) {
      const base = await readNamespace('en-US', namespace);
      const basePaths = collectScalarPaths(base.data).sort();
      const basePlaceholders = collectPlaceholders(base.data);

      for (const language of DESKTOP_LANGUAGES) {
        const current = await readNamespace(language.code, namespace);
        const currentPaths = collectScalarPaths(current.data).sort();
        assert.deepEqual(currentPaths, basePaths, `${language.code}/${namespace} keys must match en-US`);
        assert.equal(/[\uE000\uE001]/.test(current.raw), false, `${language.code}/${namespace} has an unresolved protected token`);

        const currentPlaceholders = collectPlaceholders(current.data);
        for (const [key, expected] of basePlaceholders) {
          assert.deepEqual(
            currentPlaceholders.get(key) ?? [],
            expected,
            `${language.code}/${namespace}/${key} placeholders must match en-US`,
          );
        }
      }
    }
  });
});
