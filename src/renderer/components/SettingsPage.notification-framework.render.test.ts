import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const settingsPagePath = path.resolve(process.cwd(), 'src/renderer/components/SettingsPage.tsx');
const settingsHookPath = path.resolve(process.cwd(), 'src/renderer/features/settings/hooks/useSettingsTab.ts');
const settingsContentPath = path.resolve(process.cwd(), 'src/renderer/features/settings/components/SettingsTabContent.tsx');
const notificationTabPath = path.resolve(process.cwd(), 'src/renderer/features/settings/components/tabs/NotificationTab.tsx');
const settingsSlicePath = path.resolve(process.cwd(), 'src/renderer/store/slices/settingsSlice.ts');
const storePath = path.resolve(process.cwd(), 'src/renderer/store/index.ts');
const zhPagesPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/zh-CN/pages.yml');
const enPagesPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/en-US/pages.yml');

describe('notification settings renderer wiring', () => {
  it('registers notification as the first settings tab and keeps responsive navigation classes', async () => {
    const [settingsPageSource, settingsHookSource] = await Promise.all([
      fs.readFile(settingsPagePath, 'utf8'),
      fs.readFile(settingsHookPath, 'utf8'),
    ]);

    assert.match(settingsPageSource, /useSettingsTab\(\{/);
    assert.match(settingsPageSource, /overflow-x-auto/);
    assert.match(settingsPageSource, /md:flex-col/);

    const notificationIndex = settingsHookSource.indexOf("id: 'notification'");
    const onboardingIndex = settingsHookSource.indexOf("id: 'onboarding'");
    assert.notEqual(notificationIndex, -1);
    assert.notEqual(onboardingIndex, -1);
    assert.ok(notificationIndex < onboardingIndex);
    assert.match(settingsHookSource, /labelKey: 'settings\.tabs\.notification'/);
  });

  it('lazy loads notification content and dispatches the test notification thunk through the renderer store', async () => {
    const [settingsContentSource, notificationTabSource, settingsSliceSource, storeSource] = await Promise.all([
      fs.readFile(settingsContentPath, 'utf8'),
      fs.readFile(notificationTabPath, 'utf8'),
      fs.readFile(settingsSlicePath, 'utf8'),
      fs.readFile(storePath, 'utf8'),
    ]);

    assert.match(settingsContentSource, /lazy\(activeTab\.loader\)/);
    assert.match(settingsContentSource, /<Suspense/);
    assert.match(settingsContentSource, /settings\.loading/);

    assert.match(notificationTabSource, /dispatch\(sendTestNotification\(buildTestNotificationParams\(\)\)\)/);
    assert.match(notificationTabSource, /selectNotificationShownPayload/);
    assert.match(notificationTabSource, /selectNotificationClickedPayload/);
    assert.match(notificationTabSource, /settings\.notification\.previewTitle/);

    assert.match(settingsSliceSource, /window\.hagihub\.sendNotification\(params\)/);
    assert.match(settingsSliceSource, /buildTestNotificationParams\(\): NotificationParams/);
    assert.match(storeSource, /settings: settingsReducer/);
    assert.match(storeSource, /hagihub\?\.onNotificationShown/);
    assert.match(storeSource, /hagihub\?\.onNotificationClicked/);
  });

  it('adds localized notification labels and placeholders for the new settings tabs', async () => {
    const [enPagesSource, zhPagesSource] = await Promise.all([
      fs.readFile(enPagesPath, 'utf8'),
      fs.readFile(zhPagesPath, 'utf8'),
    ]);

    assert.match(enPagesSource, /notification: Notification Center/);
    assert.match(enPagesSource, /testButton: Send Test Notification/);
    assert.match(zhPagesSource, /notification: 通知管理/);
    assert.match(zhPagesSource, /testButton: 发送测试通知/);
  });
});
