import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bundledAboutSnapshotPayload } from './generated/aboutSnapshot.js';
import {
  ABOUT_SNAPSHOT_URL,
  buildSidebarAboutModel,
  loadBundledSidebarAbout,
  normalizeAboutSnapshotData,
  refreshSidebarAboutModel,
} from './about-sidebar.node.js';

describe('about sidebar model', () => {
  it('matches the site ordering semantics for English and Chinese locales', () => {
    const snapshot = normalizeAboutSnapshotData(bundledAboutSnapshotPayload);
    const englishModel = buildSidebarAboutModel('en-US', snapshot, 'snapshot');
    const japaneseModel = buildSidebarAboutModel('ja-JP', snapshot, 'snapshot');
    const chineseModel = buildSidebarAboutModel('zh-CN', snapshot, 'snapshot');
    const traditionalChineseModel = buildSidebarAboutModel('zh-Hant', snapshot, 'snapshot');

    assert.deepEqual(englishModel.sections.map((section) => section.id), ['store', 'community', 'content']);
    assert.deepEqual(englishModel.sections[0]?.entries.map((entry) => entry.id), ['windows-store']);
    assert.deepEqual(englishModel.sections[1]?.entries.map((entry) => entry.id), ['discord', 'feishu-group', 'qq-group']);
    assert.deepEqual(englishModel.sections[2]?.entries.slice(0, 5).map((entry) => entry.id), [
      'youtube',
      'product-hunt',
      'devto',
      'x',
      'linkedin',
    ]);
    assert.deepEqual(japaneseModel.sections[1]?.entries.map((entry) => entry.id), ['discord', 'feishu-group', 'qq-group']);

    assert.deepEqual(chineseModel.sections.map((section) => section.id), ['store', 'community', 'content']);
    assert.deepEqual(chineseModel.sections[1]?.entries.map((entry) => entry.id), ['feishu-group', 'qq-group', 'discord']);
    assert.deepEqual(traditionalChineseModel.sections[1]?.entries.map((entry) => entry.id), ['feishu-group', 'qq-group', 'discord']);
    assert.deepEqual(chineseModel.sections[2]?.entries.slice(0, 5).map((entry) => entry.id), [
      'bilibili',
      'xiaohongshu',
      'douyin-account',
      'douyin-qr',
      'wechat-account',
    ]);
  });

  it('does not render Steam entries from runtime snapshots', async () => {
    const snapshot = normalizeAboutSnapshotData({
      ...bundledAboutSnapshotPayload,
      entries: [
        ...bundledAboutSnapshotPayload.entries,
        {
          id: 'steam',
          type: 'link',
          label: 'Steam',
          regionPriority: 'international-first',
          url: 'https://store.steampowered.com/app/4625540/Hagicode/',
        },
      ],
    });
    const model = buildSidebarAboutModel('en-US', snapshot, 'runtime');

    assert.equal(model.sections.flatMap((section) => section.entries).some((entry) => entry.id === 'steam'), false);
    assert.deepEqual(model.sections[0]?.entries.map((entry) => entry.id), ['windows-store']);
  });

  it('normalizes media URLs and rejects invalid payloads', () => {
    const snapshot = normalizeAboutSnapshotData(bundledAboutSnapshotPayload);
    const feishuEntry = snapshot.entries.find((entry) => entry.id === 'feishu-group');

    assert.equal(feishuEntry?.type, 'qr');
    assert.equal(feishuEntry?.resolvedImageUrl, 'https://index.hagicode.com/_astro/feishu.BRtGBazg.png');

    assert.throws(
      () => normalizeAboutSnapshotData({
        ...bundledAboutSnapshotPayload,
        entries: bundledAboutSnapshotPayload.entries.map((entry) =>
          entry.id === 'discord'
            ? { ...entry, regionPriority: undefined }
            : entry,
        ),
      }),
      /discord\.regionPriority/,
    );
  });

  it('replaces the snapshot model after a successful runtime refresh and keeps it on fetch failure', async () => {
    const bundledModel = loadBundledSidebarAbout('zh-CN');
    assert.ok(bundledModel);

    const successResult = await refreshSidebarAboutModel(
      'zh-CN',
      bundledModel,
      (async (input: URL | RequestInfo) => {
        assert.equal(String(input), ABOUT_SNAPSHOT_URL);

        return {
          ok: true,
          status: 200,
          json: async () => ({
            ...bundledAboutSnapshotPayload,
            updatedAt: '2026-04-21T00:00:00.000Z',
          }),
        } as Response;
      }) as typeof fetch,
    );

    assert.equal(successResult.fetchState.status, 'success');
    assert.equal(successResult.model?.source, 'runtime');
    assert.equal(successResult.model?.updatedAt, '2026-04-21T00:00:00.000Z');

    const failureResult = await refreshSidebarAboutModel(
      'zh-CN',
      bundledModel,
      (async () => {
        throw new Error('network down');
      }) as typeof fetch,
    );

    assert.equal(failureResult.fetchState.status, 'error');
    assert.equal(failureResult.model?.source, 'snapshot');
    assert.equal(failureResult.model?.updatedAt, bundledModel.updatedAt);
  });
});
