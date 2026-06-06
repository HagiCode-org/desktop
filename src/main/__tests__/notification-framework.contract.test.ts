import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const sharedApiPath = path.resolve(process.cwd(), 'src/shared/api.ts');
const preloadPath = path.resolve(process.cwd(), 'src/preload/index.ts');
const mainPath = path.resolve(process.cwd(), 'src/main/main.ts');
const servicePath = path.resolve(process.cwd(), 'src/main/notifications/notificationService.ts');

describe('notification framework contract', () => {
  it('defines shared notification request and result types', async () => {
    const source = await fs.readFile(sharedApiPath, 'utf8');

    assert.match(source, /export type NotificationClickAction/);
    assert.match(source, /export interface NotificationParams/);
    assert.match(source, /export interface NotificationResult/);
    assert.match(source, /export interface HagihubApi/);
    assert.match(source, /sendNotification: \(params: NotificationParams\) => Promise<NotificationResult>/);
  });

  it('bridges the renderer through preload and exposes hagihub notification events', async () => {
    const source = await fs.readFile(preloadPath, 'utf8');

    assert.match(source, /const hagihubApi: HagihubApi = \{/);
    assert.match(source, /ipcRenderer\.invoke\('hagihub:send-notification', params\)/);
    assert.match(source, /ipcRenderer\.on\('hagihub:notification-clicked'/);
    assert.match(source, /ipcRenderer\.on\('hagihub:notification-shown'/);
    assert.match(source, /contextBridge\.exposeInMainWorld\('hagihub', hagihubApi\)/);
  });

  it('registers the main-process notification handler and cross-platform service behaviors', async () => {
    const [mainSource, serviceSource] = await Promise.all([
      fs.readFile(mainPath, 'utf8'),
      fs.readFile(servicePath, 'utf8'),
    ]);

    assert.match(mainSource, /new NotificationService\(\{/);
    assert.match(mainSource, /ipcMain\.handle\('hagihub:send-notification'/);

    assert.match(serviceSource, /'macos-notification-center'/);
    assert.match(serviceSource, /'windows-toast'/);
    assert.match(serviceSource, /'linux-libnotify'/);
    assert.match(serviceSource, /await this\.openExternal\(action\.url\)/);
    assert.match(serviceSource, /this\.activateMainWindow\('notification-click'\)/);
    assert.match(serviceSource, /mainWindow\.webContents\.send\(channel, payload\)/);
  });
});
