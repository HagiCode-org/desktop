import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { load } from 'js-yaml';
import ts from 'typescript';
import { SUPPORTED_DESKTOP_LANGUAGE_CODES } from '../../../shared/desktop-languages.js';

const repoRoot = process.cwd();
const srcRoot = path.join(repoRoot, 'src');
const localesRoot = path.join(srcRoot, 'renderer/i18n/locales');

// Files that legitimately contain non-English literals. Everything else must go through i18n.
const HARDCODED_LANGUAGE_ALLOWLIST: Readonly<Record<string, string>> = {
  'src/shared/desktop-languages.ts': 'native language names shown in the language picker',
  'src/main/menu-manager.ts': 'main-process menu table that covers every Desktop language',
  'src/main/tray.ts': 'main-process tray table that covers every Desktop language',
  'src/main/llm-prompt-loader.ts': 'LLM prompt content selected by region, not UI copy',
  'src/main/package-source-config-manager.ts': 'persisted default source name; UI shows localized officialSource labels',
  'src/services/preset-loader.ts': 'preset fallback data that is not rendered by the Desktop UI',
  'src/renderer/lib/promo-links.ts': 'unreferenced provider link catalog',
};

// Multi-word values that may legitimately stay identical to en-US (product names, protocols, units).
const ENGLISH_VALUE_ALLOWLIST: ReadonlySet<string> = new Set([
  'common:dependencyManagement.packages.pi.description',
]);

const NON_LATIN_UI_SCRIPT = /[぀-ヿ㐀-鿿가-힯Ѐ-ӿ]/;

async function listSourceFiles(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'generated-locales', 'locales', '__tests__', 'test-utils', 'generated'].includes(entry.name)) {
        continue;
      }
      await listSourceFiles(fullPath, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|d)\.tsx?$/.test(entry.name)) {
      out.push(fullPath);
    }
  }
  return out;
}

function parseSource(filePath: string, source: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function flattenKeys(value: unknown, prefix: readonly string[] = [], out: Record<string, unknown> = {}) {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) {
      flattenKeys(child, [...prefix, key], out);
    }
  } else {
    out[prefix.join('.')] = value;
  }
  return out;
}

async function readFlatLocale(locale: string, namespace: string) {
  const raw = await fs.readFile(path.join(localesRoot, locale, `${namespace}.yml`), 'utf8');
  return flattenKeys(load(raw));
}

async function readNamespaces() {
  const files = await fs.readdir(path.join(localesRoot, 'en-US'));
  return files.filter((file) => file.endsWith('.yml')).map((file) => file.replace(/\.yml$/, '')).sort();
}

describe('desktop locale content audit', () => {
  it('keeps hardcoded non-English UI literals out of renderer, main, and shared sources', async () => {
    const offenders: string[] = [];

    for (const filePath of await listSourceFiles(srcRoot)) {
      const relative = path.relative(repoRoot, filePath).split(path.sep).join('/');
      if (relative in HARDCODED_LANGUAGE_ALLOWLIST) {
        continue;
      }

      const sourceFile = parseSource(filePath, await fs.readFile(filePath, 'utf8'));
      const visit = (node: ts.Node) => {
        const isLiteral =
          ts.isStringLiteral(node) ||
          ts.isNoSubstitutionTemplateLiteral(node) ||
          ts.isTemplateHead(node) ||
          ts.isTemplateMiddle(node) ||
          ts.isTemplateTail(node) ||
          ts.isJsxText(node);
        if (isLiteral && NON_LATIN_UI_SCRIPT.test(node.getText(sourceFile))) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
          offenders.push(`${relative}:${line + 1}  ${node.getText(sourceFile).replace(/\s+/g, ' ').slice(0, 60)}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }

    assert.deepEqual(offenders, [], `Hardcoded non-English literals must move to src/renderer/i18n/locales:\n${offenders.join('\n')}`);
  });

  it('keeps the splash screen text and main-process label tables aligned with every Desktop language', async () => {
    const html = await fs.readFile(path.join(srcRoot, 'renderer/index.html'), 'utf8');
    const menu = await fs.readFile(path.join(srcRoot, 'main/menu-manager.ts'), 'utf8');
    const tray = await fs.readFile(path.join(srcRoot, 'main/tray.ts'), 'utf8');

    for (const code of SUPPORTED_DESKTOP_LANGUAGE_CODES) {
      assert.match(html, new RegExp(`'${code}':`), `index.html splash text must cover ${code}`);
      assert.match(menu, new RegExp(`'${code}': \\{`), `menu-manager.ts must define a menu table for ${code}`);
      assert.match(tray, new RegExp(`'${code}': '`), `tray.ts must define tray labels for ${code}`);
    }
  });

  it('references only translation keys that exist in the en-US resources', async () => {
    const namespaces = await readNamespaces();
    const keysByNamespace = new Map<string, Set<string>>();
    for (const namespace of namespaces) {
      keysByNamespace.set(namespace, new Set(Object.keys(await readFlatLocale('en-US', namespace))));
    }

    const exists = (key: string) => {
      const separator = key.indexOf(':');
      const candidates = separator === -1 ? namespaces : [key.slice(0, separator)];
      const bareKey = separator === -1 ? key : key.slice(separator + 1);
      return candidates.some((namespace) => {
        const keys = keysByNamespace.get(namespace);
        return Boolean(keys && (keys.has(bareKey) || [...keys].some((known) => known.startsWith(`${bareKey}_`))));
      });
    };

    const missing: string[] = [];
    for (const filePath of await listSourceFiles(path.join(srcRoot, 'renderer'))) {
      const relative = path.relative(repoRoot, filePath).split(path.sep).join('/');
      const sourceFile = parseSource(filePath, await fs.readFile(filePath, 'utf8'));
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && /^(t|i18n\.t|i18next\.t)$/.test(node.expression.getText(sourceFile))) {
          const [first] = node.arguments;
          if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) && !exists(first.text)) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
            missing.push(`${relative}:${line + 1}  ${first.text}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sourceFile);
    }

    assert.deepEqual(missing, [], `Translation keys used in code but absent from en-US:\n${missing.join('\n')}`);
  });

  it('does not ship untranslated English copies in non-English locales', async () => {
    const namespaces = await readNamespaces();
    const languageCodes = SUPPORTED_DESKTOP_LANGUAGE_CODES.filter((code) => code !== 'en-US');
    const proseWords = (value: string) => value.replace(/{{[^}]+}}/g, ' ').match(/[A-Za-z]{3,}/g) ?? [];
    const untranslated: string[] = [];

    for (const namespace of namespaces) {
      const english = await readFlatLocale('en-US', namespace);
      const simplifiedChinese = await readFlatLocale('zh-CN', namespace);
      for (const code of languageCodes) {
        const current = await readFlatLocale(code, namespace);
        for (const [key, value] of Object.entries(english)) {
          const id = `${namespace}:${key}`;
          if (
            typeof value === 'string' &&
            current[key] === value &&
            simplifiedChinese[key] !== value &&
            !/^https?:\/\/\S+$/.test(value.trim()) &&
            proseWords(value).length >= 2 &&
            !ENGLISH_VALUE_ALLOWLIST.has(id)
          ) {
            untranslated.push(`${code}/${id}`);
          }
        }
      }
    }

    assert.deepEqual(untranslated, [], `Values still identical to en-US:\n${untranslated.join('\n')}`);
  });
});
