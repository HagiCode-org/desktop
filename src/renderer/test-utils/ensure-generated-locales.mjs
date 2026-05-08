import fs from 'node:fs/promises';
import path from 'node:path';
import { generateI18nResources } from '../../../scripts/generate-i18n-resources.mjs';

const generatedRoot = path.resolve(process.cwd(), 'src/renderer/i18n/generated-locales');
const sentinelFile = path.join(generatedRoot, 'en-US', 'common.json');
const lockDirectory = path.resolve(process.cwd(), '.generated-i18n-resources.lock');

let generationPromise = null;

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function waitForUnlock(maxAttempts = 100) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (!(await exists(lockDirectory))) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for generated locale lock to clear: ${lockDirectory}`);
}

async function generateWithLock() {
  if (await exists(sentinelFile)) {
    return;
  }

  try {
    await fs.mkdir(lockDirectory);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'EEXIST') {
      await waitForUnlock();
      if (await exists(sentinelFile)) {
        return;
      }

      return generateWithLock();
    }

    throw error;
  }

  try {
    await generateI18nResources();
  } finally {
    await fs.rm(lockDirectory, { recursive: true, force: true });
  }
}

export async function ensureGeneratedLocales() {
  generationPromise ??= generateWithLock();
  await generationPromise;
}
