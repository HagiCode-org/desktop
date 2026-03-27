import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLogDirectoryService } from '../log-directory-service.js';

function createService(options?: {
  activeVersionId?: string | null;
  existingPaths?: string[];
  openResult?: string;
}) {
  const openCalls: string[] = [];
  const existingPaths = new Set(options?.existingPaths ?? ['/desktop-logs', '/versions/v1/logs']);

  const service = createLogDirectoryService({
    getDesktopLogsPath: () => '/desktop-logs',
    getActiveVersion: async () => options?.activeVersionId === null
      ? null
      : { id: options?.activeVersionId ?? 'v1' },
    getVersionLogsPath: (versionId) => `/versions/${versionId}/logs`,
    access: async (targetPath) => {
      if (!existingPaths.has(targetPath)) {
        throw new Error('missing');
      }
    },
    openPath: async (targetPath) => {
      openCalls.push(targetPath);
      return options?.openResult ?? '';
    },
  });

  return {
    service,
    openCalls,
  };
}

describe('log directory service', () => {
  it('marks web-app target unavailable when no active version exists', async () => {
    const { service } = createService({ activeVersionId: null });

    const targets = await service.listTargets();
    const webAppTarget = targets.find((target) => target.target === 'web-app');

    assert.deepEqual(webAppTarget, {
      target: 'web-app',
      available: false,
      exists: false,
      path: null,
      reason: 'no_active_version',
    });
  });

  it('returns logs_not_found without opening the shell when target directory is missing', async () => {
    const { service, openCalls } = createService({
      existingPaths: ['/versions/v1/logs'],
    });

    const result = await service.open('desktop');

    assert.deepEqual(result, {
      success: false,
      error: 'logs_not_found',
    });
    assert.deepEqual(openCalls, []);
  });

  it('opens the requested logs folder when the target exists', async () => {
    const { service, openCalls } = createService();

    const result = await service.open('desktop');

    assert.deepEqual(result, {
      success: true,
      path: '/desktop-logs',
    });
    assert.deepEqual(openCalls, ['/desktop-logs']);
  });

  it('returns open_failed when the shell reports an open error', async () => {
    const { service, openCalls } = createService({
      openResult: 'failed to reveal item',
    });

    const result = await service.open('web-app');

    assert.deepEqual(result, {
      success: false,
      error: 'open_failed',
      path: '/versions/v1/logs',
    });
    assert.deepEqual(openCalls, ['/versions/v1/logs']);
  });
});
