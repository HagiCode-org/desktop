import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { load } from 'js-yaml';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDirectory, '..');
const defaultLocalesRoot = path.join(desktopRoot, 'src/renderer/i18n/locales');
const defaultGeneratedRoot = path.join(desktopRoot, 'src/renderer/i18n/generated-locales');
const defaultDesktopLanguagesPath = path.join(desktopRoot, 'src/shared/desktop-languages.ts');
const defaultI18nConfigPath = path.join(desktopRoot, 'src/renderer/i18n/config.ts');

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeNames(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseQuotedStrings(sourceText) {
  return [...sourceText.matchAll(/'([^']+)'|"([^"]+)"/g)].map((match) => match[1] ?? match[2]);
}

async function readExpectedLocaleCodes(desktopLanguagesPath) {
  const sourceText = await fs.readFile(desktopLanguagesPath, 'utf8');
  const localeCodes = [...sourceText.matchAll(/\bcode:\s*'([^']+)'/g)].map((match) => match[1]);
  assert(localeCodes.length > 0, `Could not find Desktop language codes in ${desktopLanguagesPath}`);
  return normalizeNames(localeCodes);
}

async function readExpectedNamespaces(i18nConfigPath) {
  const sourceText = await fs.readFile(i18nConfigPath, 'utf8');
  const namespaceMatch = sourceText.match(/\bns:\s*\[([\s\S]*?)\]/m);
  assert(namespaceMatch, `Could not find i18n namespaces in ${i18nConfigPath}`);
  const namespaces = parseQuotedStrings(namespaceMatch[1]);
  assert(namespaces.length > 0, `Could not parse i18n namespaces from ${i18nConfigPath}`);
  return normalizeNames(namespaces);
}

async function resolveMetadata(options = {}) {
  const expectedLocales = options.expectedLocales
    ? normalizeNames(options.expectedLocales)
    : await readExpectedLocaleCodes(options.desktopLanguagesPath ?? defaultDesktopLanguagesPath);
  const expectedNamespaces = options.expectedNamespaces
    ? normalizeNames(options.expectedNamespaces)
    : await readExpectedNamespaces(options.i18nConfigPath ?? defaultI18nConfigPath);

  return {
    localesRoot: path.resolve(options.localesRoot ?? defaultLocalesRoot),
    generatedRoot: path.resolve(options.generatedRoot ?? defaultGeneratedRoot),
    expectedLocales,
    expectedNamespaces,
  };
}

async function listDirectoryNames(directoryPath) {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  return normalizeNames(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name));
}

async function readLocaleSourceFile(localeDirectory, namespace) {
  const ymlPath = path.join(localeDirectory, `${namespace}.yml`);
  const yamlPath = path.join(localeDirectory, `${namespace}.yaml`);
  const ymlExists = await fs
    .access(ymlPath)
    .then(() => true)
    .catch(() => false);
  const yamlExists = await fs
    .access(yamlPath)
    .then(() => true)
    .catch(() => false);

  assert(!(ymlExists && yamlExists), `Found both .yml and .yaml for ${path.relative(desktopRoot, localeDirectory)}/${namespace}`);
  assert(ymlExists || yamlExists, `Missing YAML namespace file for ${path.relative(desktopRoot, localeDirectory)}/${namespace}`);

  const filePath = ymlExists ? ymlPath : yamlPath;
  const raw = await fs.readFile(filePath, 'utf8');
  const data = load(raw);
  assert(
    isPlainObject(data),
    `Locale source ${path.relative(desktopRoot, filePath)} must be a top-level mapping`,
  );

  return { filePath, raw, data };
}

async function loadYamlLocaleTree(options = {}) {
  const { localesRoot, expectedLocales, expectedNamespaces } = await resolveMetadata(options);
  const actualLocales = await listDirectoryNames(localesRoot);
  assert.deepEqual(
    actualLocales,
    expectedLocales,
    `Locale directories in ${path.relative(desktopRoot, localesRoot)} must match Desktop language metadata`,
  );

  const resources = {};

  for (const locale of expectedLocales) {
    const localeDirectory = path.join(localesRoot, locale);
    const sourceEntries = await fs.readdir(localeDirectory, { withFileTypes: true });
    const actualNamespaces = normalizeNames(
      sourceEntries
        .filter((entry) => entry.isFile() && /\.(?:ya?ml)$/u.test(entry.name))
        .map((entry) => entry.name.replace(/\.(?:ya?ml)$/u, '')),
    );

    assert.deepEqual(
      actualNamespaces,
      expectedNamespaces,
      `${locale} YAML namespaces must match i18nConfig.ns`,
    );

    resources[locale] = {};
    for (const namespace of expectedNamespaces) {
      const namespaceFile = await readLocaleSourceFile(localeDirectory, namespace);
      resources[locale][namespace] = namespaceFile.data;
    }
  }

  return {
    localesRoot,
    expectedLocales,
    expectedNamespaces,
    resources,
  };
}

async function loadGeneratedLocaleTree(options = {}) {
  const { generatedRoot, expectedLocales, expectedNamespaces } = await resolveMetadata(options);
  const actualLocales = await listDirectoryNames(generatedRoot);
  assert.deepEqual(
    actualLocales,
    expectedLocales,
    `Generated locale directories in ${path.relative(desktopRoot, generatedRoot)} must match Desktop language metadata`,
  );

  const resources = {};

  for (const locale of expectedLocales) {
    const localeDirectory = path.join(generatedRoot, locale);
    const generatedEntries = await fs.readdir(localeDirectory, { withFileTypes: true });
    const actualNamespaces = normalizeNames(
      generatedEntries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => entry.name.replace(/\.json$/u, '')),
    );

    assert.deepEqual(
      actualNamespaces,
      expectedNamespaces,
      `${locale} generated namespaces must match i18nConfig.ns`,
    );

    resources[locale] = {};
    for (const namespace of expectedNamespaces) {
      const filePath = path.join(localeDirectory, `${namespace}.json`);
      const raw = await fs.readFile(filePath, 'utf8');
      resources[locale][namespace] = JSON.parse(raw);
    }
  }

  return {
    generatedRoot,
    expectedLocales,
    expectedNamespaces,
    resources,
  };
}

function collectParityErrors(sourceResources, generatedResources, expectedLocales, expectedNamespaces) {
  const errors = [];

  for (const locale of expectedLocales) {
    for (const namespace of expectedNamespaces) {
      const sourceJson = formatJson(sourceResources[locale][namespace]);
      const generatedJson = formatJson(generatedResources[locale][namespace]);
      if (sourceJson !== generatedJson) {
        errors.push(`${locale}/${namespace}.json is stale; rerun npm run i18n:generate`);
      }
    }
  }

  return errors;
}

export async function generateI18nResources(options = {}) {
  const { generatedRoot, expectedLocales, expectedNamespaces } = await resolveMetadata(options);
  const { resources } = await loadYamlLocaleTree(options);

  await fs.rm(generatedRoot, { recursive: true, force: true });

  for (const locale of expectedLocales) {
    await fs.mkdir(path.join(generatedRoot, locale), { recursive: true });
    for (const namespace of expectedNamespaces) {
      await fs.writeFile(
        path.join(generatedRoot, locale, `${namespace}.json`),
        formatJson(resources[locale][namespace]),
        'utf8',
      );
    }
  }

  return {
    generatedRoot,
    localeCount: expectedLocales.length,
    namespaceCount: expectedNamespaces.length,
  };
}

export async function verifyGeneratedI18nResources(options = {}) {
  const { expectedLocales, expectedNamespaces } = await resolveMetadata(options);
  const { resources: sourceResources } = await loadYamlLocaleTree(options);
  const { resources: generatedResources } = await loadGeneratedLocaleTree(options);
  const errors = collectParityErrors(sourceResources, generatedResources, expectedLocales, expectedNamespaces);
  assert.equal(errors.length, 0, errors.join('\n'));

  return {
    localeCount: expectedLocales.length,
    namespaceCount: expectedNamespaces.length,
  };
}

function parseCliArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    switch (argument) {
      case '--check':
        options.check = true;
        break;
      case '--locales-root':
        options.localesRoot = argv[index + 1];
        index += 1;
        break;
      case '--generated-root':
        options.generatedRoot = argv[index + 1];
        index += 1;
        break;
      case '--desktop-languages-path':
        options.desktopLanguagesPath = argv[index + 1];
        index += 1;
        break;
      case '--i18n-config-path':
        options.i18nConfigPath = argv[index + 1];
        index += 1;
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.check) {
    const result = await verifyGeneratedI18nResources(options);
    console.log(
      `Verified generated Desktop i18n resources for ${result.localeCount} locales and ${result.namespaceCount} namespaces.`,
    );
    return;
  }

  const result = await generateI18nResources(options);
  console.log(
    `Generated Desktop i18n resources in ${path.relative(desktopRoot, result.generatedRoot)} for ${result.localeCount} locales and ${result.namespaceCount} namespaces.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
