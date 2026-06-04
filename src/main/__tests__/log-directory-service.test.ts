import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLogDirectoryService } from '../log-directory-service.js';

function createService(options?: {
  existingPaths?: string[];
  openResult?: string;
}) {
  const openCalls: string[] = [];
  const existingPaths = new Set(options?.existingPaths ?? ['/desktop-logs', '/managed-server/logs']);

  const service = createLogDirectoryService({
    getDesktopLogsPath: () => '/desktop-logs',
    getWebAppLogsPath: () => '/managed-server/logs',
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
  it('marks web-app target unavailable when the managed backend logs folder is missing', async () => {
    const { service } = createService({ existingPaths: ['/desktop-logs'] });

    const targets = await service.listTargets();
    const webAppTarget = targets.find((target) => target.target === 'web-app');

    assert.deepEqual(webAppTarget, {
      target: 'web-app',
      available: false,
      exists: false,
      path: '/managed-server/logs',
      reason: 'logs_not_found',
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

  it('opens active-version web-app logs without requiring runtime state', async () => {
    const { service, openCalls } = createService();

    const result = await service.open('web-app');

    assert.deepEqual(result, {
      success: true,
      path: '/managed-server/logs',
    });
    assert.deepEqual(openCalls, ['/managed-server/logs']);
  });

  it('returns logs_not_found for web-app when the active-version logs folder is missing', async () => {
    const { service, openCalls } = createService({
      existingPaths: ['/desktop-logs'],
    });

    const result = await service.open('web-app');

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
      path: '/managed-server/logs',
    });
    assert.deepEqual(openCalls, ['/managed-server/logs']);
  });
});
