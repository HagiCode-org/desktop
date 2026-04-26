import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SIDEBAR_PROMOTION_CONTENT_URL,
  SIDEBAR_PROMOTION_FLAGS_URL,
  fetchSidebarPromotion,
  normalizePromotionContents,
  normalizePromotionFlags,
  normalizeSidebarPromotionLocale,
  resolveActiveSidebarPromotion,
} from './sidebar-promotion.node.js';

const activeNow = new Date('2026-04-26T08:00:00.000Z');

describe('sidebar promotion model', () => {
  it('normalizes locales and resolves localized active content', () => {
    assert.equal(normalizeSidebarPromotionLocale('zh-Hans-CN'), 'zh-CN');
    assert.equal(normalizeSidebarPromotionLocale('en-US'), 'en-US');

    const promotion = resolveActiveSidebarPromotion(
      {
        flags: [
          {
            id: 'steam-wishlist',
            enabled: true,
            startsAt: '2026-04-01T00:00:00.000Z',
            endsAt: '2026-05-01T00:00:00.000Z',
          },
        ],
        contents: [
          {
            id: 'steam-wishlist',
            title: { 'zh-CN': '愿望单 Hagicode', 'en-US': 'Wishlist Hagicode' },
            description: { 'zh-CN': '在 Steam 上关注我们。', 'en-US': 'Follow us on Steam.' },
            cta: { 'zh-CN': '去看看', 'en-US': 'Open Steam' },
            link: 'https://store.steampowered.com/app/123456/Hagicode/',
          },
        ],
      },
      'zh-CN',
      '了解更多',
      activeNow,
    );

    assert.equal(promotion?.title, '愿望单 Hagicode');
    assert.equal(promotion?.description, '在 Steam 上关注我们。');
    assert.equal(promotion?.cta, '去看看');
  });

  it('accepts the published Index payload shape with promotes, on, zh, and en fields', () => {
    const flags = normalizePromotionFlags({
      version: '1.0.0',
      promotes: [
        {
          id: 'main-game-2026-04-29',
          on: true,
          endTime: '2026-04-29T00:00:00+08:00',
        },
      ],
    });
    const contents = normalizePromotionContents({
      version: '1.0.0',
      contents: [
        {
          id: 'main-game-2026-04-29',
          title: { zh: '求求加入愿望单', en: 'Wishlist It, Pretty Please' },
          description: { zh: '快来 steam 加入愿望单吧', en: 'Please add it to your Steam wishlist.' },
          cta: { zh: '加入愿望单', en: 'Wishlist on Steam' },
          link: 'https://store.steampowered.com/app/4625540/Hagicode/',
          targetPlatform: 'steam',
        },
      ],
    });

    assert.ok(flags);
    assert.ok(contents);
    const promotion = resolveActiveSidebarPromotion(
      { flags, contents },
      'zh-CN',
      '了解更多',
      activeNow,
    );

    assert.equal(promotion?.id, 'main-game-2026-04-29');
    assert.equal(promotion?.title, '求求加入愿望单');
    assert.equal(promotion?.cta, '加入愿望单');
  });

  it('filters inactive, disabled, and missing-content campaigns deterministically', () => {
    const promotion = resolveActiveSidebarPromotion(
      {
        flags: [
          { id: 'disabled', enabled: false },
          { id: 'expired', enabled: true, endsAt: '2026-01-01T00:00:00.000Z' },
          { id: 'missing-content', enabled: true },
          { id: 'active', enabled: true },
        ],
        contents: [
          {
            id: 'active',
            title: { 'en-US': 'Active promotion' },
            description: { 'en-US': 'The first eligible matching content wins.' },
            link: 'https://hagicode.com/promote',
          },
        ],
      },
      'en-US',
      'Learn more',
      activeNow,
    );

    assert.equal(promotion?.id, 'active');
    assert.equal(promotion?.cta, 'Learn more');
  });

  it('falls back to another locale for title and description when current locale or CTA values are missing', () => {
    const normalizedContents = normalizePromotionContents({
      contents: [
        {
          id: 'fallback',
          title: { 'zh-CN': '中文标题' },
          description: { 'zh-CN': '中文描述' },
          cta: { 'en-US': '   ' },
          link: 'https://hagicode.com/fallback',
        },
      ],
    });

    assert.equal(normalizedContents?.[0]?.cta, undefined);

    const promotion = resolveActiveSidebarPromotion(
      {
        flags: [{ id: 'fallback', enabled: true }],
        contents: normalizedContents ?? [],
      },
      'en-US',
      'Learn more',
      activeNow,
    );

    assert.equal(promotion?.title, '中文标题');
    assert.equal(promotion?.description, '中文描述');
    assert.equal(promotion?.cta, 'Learn more');
  });

  it('rejects malformed payloads and non-http campaign links', () => {
    assert.equal(normalizePromotionFlags({ promotions: [{ id: 'bad', enabled: true, startsAt: 'not-date' }] }), null);
    assert.equal(
      normalizePromotionContents({
        contents: [
          {
            id: 'bad-link',
            title: { 'en-US': 'Bad' },
            description: { 'en-US': 'Bad link' },
            link: 'mailto:support@hagicode.com',
          },
        ],
      }),
      null,
    );
  });

  it('returns null instead of throwing for fetch failures, disabled campaigns, and invalid runtime payloads', async () => {
    const failed = await fetchSidebarPromotion('en-US', 'Learn more', (async () => {
      throw new Error('network down');
    }) as typeof fetch, activeNow);
    assert.equal(failed, null);

    const disabled = await fetchSidebarPromotion('en-US', 'Learn more', (async (input: URL | RequestInfo) => {
      const url = String(input);
      assert.ok(url === SIDEBAR_PROMOTION_FLAGS_URL || url === SIDEBAR_PROMOTION_CONTENT_URL);

      return {
        ok: true,
        status: 200,
        json: async () => url === SIDEBAR_PROMOTION_FLAGS_URL
          ? { promotions: [{ id: 'disabled', enabled: false }] }
          : { contents: [{ id: 'disabled', title: { 'en-US': 'Hidden' }, description: { 'en-US': 'No render' }, link: 'https://hagicode.com' }] },
      } as Response;
    }) as typeof fetch, activeNow);
    assert.equal(disabled, null);
  });
});
