import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { load } from 'js-yaml';
import { DESKTOP_LANGUAGES } from '../../../shared/desktop-languages.js';

const localesRoot = path.resolve(process.cwd(), 'src/renderer/i18n/locales');
const generatedLocalesRoot = path.resolve(process.cwd(), 'src/renderer/i18n/generated-locales');
const i18nConfigPath = path.resolve(process.cwd(), 'src/renderer/i18n/config.ts');

async function readNamespaces() {
  const source = await fs.readFile(i18nConfigPath, 'utf8');
  const namespaceMatch = source.match(/\bns:\s*\[([\s\S]*?)\]/m);
  assert.notEqual(namespaceMatch, null, 'config.ts must define i18nConfig.ns');
  return [...namespaceMatch[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((match) => match[1] ?? match[2]).sort();
}

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

async function readYamlNamespace(locale: string, namespace: string) {
  const raw = await fs.readFile(path.join(localesRoot, locale, `${namespace}.yml`), 'utf8');
  const data = load(raw);
  assert.equal(typeof data, 'object');
  assert.notEqual(data, null);
  assert.equal(Array.isArray(data), false);
  return {
    raw,
    data,
  };
}

async function readGeneratedNamespace(locale: string, namespace: string) {
  const raw = await fs.readFile(path.join(generatedLocalesRoot, locale, `${namespace}.json`), 'utf8');
  return {
    raw,
    data: JSON.parse(raw),
  };
}

describe('desktop locale resources', () => {
  it('provides a complete YAML namespace set and generated JSON set for every supported language', async () => {
    const namespaces = await readNamespaces();

    for (const language of DESKTOP_LANGUAGES) {
      for (const namespace of namespaces) {
        await assert.doesNotReject(() => fs.access(path.join(localesRoot, language.code, `${namespace}.yml`)));
        await assert.doesNotReject(() => fs.access(path.join(generatedLocalesRoot, language.code, `${namespace}.json`)));
      }
    }
  });

  it('keeps translated YAML locale keys and interpolation placeholders aligned with en-US', async () => {
    const namespaces = await readNamespaces();

    for (const namespace of namespaces) {
      const base = await readYamlNamespace('en-US', namespace);
      const basePaths = collectScalarPaths(base.data).sort();
      const basePlaceholders = collectPlaceholders(base.data);

      for (const language of DESKTOP_LANGUAGES) {
        const current = await readYamlNamespace(language.code, namespace);
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

  it('keeps generated JSON resources in parity with the YAML source tree', async () => {
    const namespaces = await readNamespaces();

    for (const language of DESKTOP_LANGUAGES) {
      for (const namespace of namespaces) {
        const source = await readYamlNamespace(language.code, namespace);
        const generated = await readGeneratedNamespace(language.code, namespace);
        assert.deepEqual(
          generated.data,
          source.data,
          `${language.code}/${namespace}.json must match the YAML source data`,
        );
        assert.equal(
          generated.raw,
          `${JSON.stringify(source.data, null, 2)}\n`,
          `${language.code}/${namespace}.json must keep deterministic formatting`,
        );
      }
    }
  });
});
