#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const ABOUT_SNAPSHOT_URL = process.env.HAGICODE_ABOUT_SNAPSHOT_URL ?? 'https://index.hagicode.com/about.json';
const ABOUT_SNAPSHOT_VERSION = '1.0.0';
const ABOUT_SNAPSHOT_REGION_PRIORITIES = ['china-first', 'international-first'];
const REQUIRED_ABOUT_ENTRY_IDS = [
  'youtube',
  'steam',
  'bilibili',
  'xiaohongshu',
  'douyin-account',
  'douyin-qr',
  'qq-group',
  'feishu-group',
  'discord',
  'wechat-account',
];
const OUTPUT_PATH = path.resolve(process.cwd(), 'src/renderer/lib/generated/aboutSnapshot.js');

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNonEmptyString(value, fieldName) {
  assert(
    typeof value === 'string' && value.trim().length > 0,
    `Invalid about snapshot payload: ${fieldName} must be a non-empty string`,
  );
  return value;
}

function readOptionalNonEmptyString(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }

  return readNonEmptyString(value, fieldName);
}

function readPositiveInteger(value, fieldName) {
  assert(
    Number.isInteger(value) && Number(value) > 0,
    `Invalid about snapshot payload: ${fieldName} must be a positive integer`,
  );
  return Number(value);
}

function readRegionPriority(value, fieldName) {
  const regionPriority = readNonEmptyString(value, fieldName);
  assert(
    ABOUT_SNAPSHOT_REGION_PRIORITIES.includes(regionPriority),
    `Invalid about snapshot payload: ${fieldName} must be ${ABOUT_SNAPSHOT_REGION_PRIORITIES.join(' or ')}`,
  );
  return regionPriority;
}

function readMediaUrl(value, fieldName) {
  const imageUrl = readNonEmptyString(value, fieldName);
  assert(
    imageUrl.startsWith('/_astro/') || imageUrl.startsWith('http://') || imageUrl.startsWith('https://'),
    `Invalid about snapshot payload: ${fieldName} must be a published asset URL`,
  );
  return imageUrl;
}

function normalizeAboutEntry(entry, index, seenIds, remainingIds) {
  assert(isRecord(entry), `Invalid about snapshot payload: entries[${index}] must be an object`);

  const id = readNonEmptyString(entry.id, `entries[${index}].id`);
  assert(!seenIds.has(id), `Invalid about snapshot payload: duplicate entry id "${id}"`);
  seenIds.add(id);
  remainingIds.delete(id);

  const type = readNonEmptyString(entry.type, `${id}.type`);
  assert(
    ['link', 'contact', 'qr', 'image'].includes(type),
    `Invalid about snapshot payload: ${id}.type must be link, contact, qr, or image`,
  );

  const normalizedEntry = {
    id,
    type,
    label: readNonEmptyString(entry.label, `${id}.label`),
    regionPriority: readRegionPriority(entry.regionPriority, `${id}.regionPriority`),
  };

  const description = readOptionalNonEmptyString(entry.description, `${id}.description`);
  if (description) {
    normalizedEntry.description = description;
  }

  if (type === 'link') {
    return {
      ...normalizedEntry,
      url: readNonEmptyString(entry.url, `${id}.url`),
    };
  }

  if (type === 'contact') {
    const contactEntry = {
      ...normalizedEntry,
      value: readNonEmptyString(entry.value, `${id}.value`),
    };
    const url = readOptionalNonEmptyString(entry.url, `${id}.url`);
    if (url) {
      contactEntry.url = url;
    }
    return contactEntry;
  }

  const mediaEntry = {
    ...normalizedEntry,
    imageUrl: readMediaUrl(entry.imageUrl, `${id}.imageUrl`),
    width: readPositiveInteger(entry.width, `${id}.width`),
    height: readPositiveInteger(entry.height, `${id}.height`),
    alt: readNonEmptyString(entry.alt, `${id}.alt`),
  };
  const url = readOptionalNonEmptyString(entry.url, `${id}.url`);
  if (url) {
    mediaEntry.url = url;
  }
  return mediaEntry;
}

function normalizeAboutSnapshotData(payload) {
  assert(isRecord(payload), 'Invalid about snapshot payload: root must be an object');
  assert(Array.isArray(payload.entries), 'Invalid about snapshot payload: entries must be an array');

  const version = readNonEmptyString(payload.version, 'version');
  assert(
    version === ABOUT_SNAPSHOT_VERSION,
    `Invalid about snapshot payload: version must be ${ABOUT_SNAPSHOT_VERSION}`,
  );

  const remainingIds = new Set(REQUIRED_ABOUT_ENTRY_IDS);
  const seenIds = new Set();
  const entries = payload.entries.map((entry, index) => normalizeAboutEntry(entry, index, seenIds, remainingIds));

  assert(
    remainingIds.size === 0,
    `Invalid about snapshot payload: missing required entries ${Array.from(remainingIds).join(', ')}`,
  );

  return {
    version,
    updatedAt: readNonEmptyString(payload.updatedAt, 'updatedAt'),
    entries,
  };
}

async function main() {
  console.log(`[about-snapshot] Fetching ${ABOUT_SNAPSHOT_URL}`);
  const response = await fetch(ABOUT_SNAPSHOT_URL, {
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch about snapshot: HTTP ${response.status}`);
  }

  const payload = normalizeAboutSnapshotData(await response.json());
  const fileContents = `// Auto-generated by scripts/generate-about-snapshot.js\n` +
    `// Source: ${ABOUT_SNAPSHOT_URL}\n` +
    `export const bundledAboutSnapshotPayload = ${JSON.stringify(payload, null, 2)};\n`;

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, fileContents, 'utf8');
  console.log(`[about-snapshot] Wrote ${OUTPUT_PATH}`);
}

main().catch(async (error) => {
  if (await pathExists(OUTPUT_PATH)) {
    console.warn(`[about-snapshot] ${error.message}`);
    console.warn(`[about-snapshot] Using existing snapshot at ${OUTPUT_PATH}`);
    return;
  }

  console.error(`[about-snapshot] ${error.message}`);
  process.exit(1);
});
