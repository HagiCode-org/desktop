import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SENSITIVE_KEY_PATTERN } from '../../main/telemetry/privacy.js';
import {
  isCatalogEvent,
  TELEMETRY_EVENT_CATALOG,
  type TelemetryEventSpec,
  type TelemetryPropertySpec,
} from '../telemetry-events.js';

const catalog: Readonly<Record<string, TelemetryEventSpec>> = TELEMETRY_EVENT_CATALOG;
const entries = Object.entries(catalog);
const SOURCE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DOCS_PATH = fileURLToPath(new URL('../../../docs/cloud-telemetry.md', import.meta.url));
const DOCS_TABLE_HEADER = '| Event | Class | Properties | Emit site |';
const PAST_TENSE_SUFFIXES = [
  'started', 'exited', 'entered', 'decided', 'skipped', 'completed',
  'finished', 'changed', 'switched', 'opened', 'actioned',
];
const EMITTED_EVENT_NAME = /(?:\btrackEvent|\btrack|(?<![.\w])emit)\(\s*'([a-z_]+)'/g;

interface DocumentedEvent {
  sampling: string;
  properties: Record<string, string>;
}

function describeProperty(prop: TelemetryPropertySpec): string {
  const shape = prop.type === 'enum' ? [...prop.values].sort().join(', ') : prop.type;
  return prop.optional ? `optional ${shape}` : shape;
}

function describeProperties(properties: Readonly<Record<string, TelemetryPropertySpec>>): Record<string, string> {
  return Object.fromEntries(Object.entries(properties).map(([key, prop]) => [key, describeProperty(prop)] as const));
}

function parseDocumentedProperties(cell: string): Record<string, string> {
  if (cell === 'none') return {};
  return Object.fromEntries(cell.split(';').map((item) => {
    const match = /^`([A-Za-z]+)`( \(optional\))?: (.+)$/.exec(item.trim());
    assert.ok(match, `unparseable property cell: ${item.trim()}`);
    const [, key, optional, value] = match;
    const shape = value === 'number' || value === 'boolean'
      ? value
      : [...value.matchAll(/`([^`]+)`/g)].map((token) => token[1]).sort().join(', ');
    return [key, optional ? `optional ${shape}` : shape] as const;
  }));
}

function parseDocumentedCatalog(markdown: string): Map<string, DocumentedEvent> {
  const lines = markdown.split('\n');
  const header = lines.findIndex((line) => line.trim() === DOCS_TABLE_HEADER);
  assert.notEqual(header, -1, 'docs event table header not found');
  const events = new Map<string, DocumentedEvent>();
  for (const line of lines.slice(header + 2)) {
    if (!line.startsWith('|')) break;
    const [name, sampling, properties] = line.split('|').slice(1, -1).map((cell) => cell.trim());
    events.set(name.replace(/`/g, ''), { sampling, properties: parseDocumentedProperties(properties) });
  }
  return events;
}

function collectEmittedEventNames(dir: string, names = new Set<string>()): Set<string> {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== '__tests__') collectEmittedEventNames(path, names);
    } else if (/\.tsx?$/.test(entry)) {
      for (const match of readFileSync(path, 'utf8').matchAll(EMITTED_EVENT_NAME)) names.add(match[1]);
    }
  }
  return names;
}

describe('telemetry event catalog', () => {
  it('names are snake_case past-tense events', () => {
    for (const [name] of entries) {
      assert.match(name, /^[a-z]+(_[a-z]+)+$/, name);
      assert.ok(
        PAST_TENSE_SUFFIXES.some((suffix) => name.endsWith(`_${suffix}`)),
        `${name} does not end in a past-tense action`,
      );
    }
  });

  it('outcome events end in _finished and declare an enumerated status', () => {
    for (const [name, spec] of entries) {
      if (!name.endsWith('_finished')) continue;
      const status = spec.properties.status;
      assert.ok(status, `${name} has no status property`);
      assert.equal(status.type, 'enum', name);
    }
  });

  it('property keys are camelCase and every string property is a declared enumeration', () => {
    for (const [name, spec] of entries) {
      for (const [key, prop] of Object.entries(spec.properties)) {
        assert.match(key, /^[a-z][a-zA-Z]*$/, `${name}.${key}`);
        if (prop.type === 'enum') {
          assert.ok(prop.values.length > 0, `${name}.${key} has no values`);
          assert.equal(new Set(prop.values).size, prop.values.length, `${name}.${key} has duplicate values`);
        } else if (prop.type === 'number') {
          assert.ok(
            Number.isFinite(prop.min) && Number.isFinite(prop.max) && prop.min <= prop.max,
            `${name}.${key} has invalid bounds`,
          );
        }
      }
    }
  });

  it('declares no property key that the sensitive-key guard would drop', () => {
    for (const [name, spec] of entries) {
      for (const key of Object.keys(spec.properties)) {
        assert.doesNotMatch(key, SENSITIVE_KEY_PATTERN, `${name}.${key}`);
      }
    }
  });

  it('keeps the legacy app_started and main_view_entered events as always-class', () => {
    for (const name of ['app_started', 'main_view_entered']) {
      assert.ok(isCatalogEvent(name), name);
      assert.equal(catalog[name].sampling, 'always', name);
    }
  });

  it('every literal event name emitted from desktop source is in the catalog', () => {
    const emitted = collectEmittedEventNames(SOURCE_ROOT);
    assert.ok(emitted.size > 0, 'no emitted event names found');
    for (const name of emitted) {
      assert.ok(isCatalogEvent(name), `emitted but not catalogued: ${name}`);
    }
  });

  it('documents exactly the catalog, with matching sampling and properties, in docs/cloud-telemetry.md', () => {
    const documented = parseDocumentedCatalog(readFileSync(DOCS_PATH, 'utf8'));
    assert.deepEqual([...documented.keys()].sort(), entries.map(([name]) => name).sort());
    for (const [name, spec] of entries) {
      const doc = documented.get(name);
      assert.ok(doc, `${name} is missing from the docs table`);
      assert.equal(doc.sampling, spec.sampling, `${name} sampling`);
      assert.deepEqual(doc.properties, describeProperties(spec.properties), `${name} properties`);
    }
  });
});
