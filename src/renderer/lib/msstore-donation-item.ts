import {
  MSSTORE_DONATION_TIP_PRODUCT_IDS,
  MSSTORE_DONATION_TIP_TIER_IDS,
  type MsstoreDonationTipTierId,
} from '../../types/msstore-donation-item.js';

export const MSSTORE_DONATION_ITEM_DAY_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

export interface ShouldShowMsstoreDonationItemInput {
  isWinStoreRuntime: boolean;
  installDate?: string;
  dismissedAt?: string;
  now?: Date;
}

export function shouldShowMsstoreDonationItem({
  isWinStoreRuntime,
  installDate,
  dismissedAt,
  now = new Date(),
}: ShouldShowMsstoreDonationItemInput): boolean {
  if (!isWinStoreRuntime) {
    return false;
  }

  if (dismissedAt && dismissedAt.trim().length > 0) {
    return false;
  }

  if (!installDate || installDate.trim().length === 0) {
    return false;
  }

  const installTime = Date.parse(installDate);
  if (Number.isNaN(installTime)) {
    return false;
  }

  return now.getTime() - installTime >= MSSTORE_DONATION_ITEM_DAY_THRESHOLD_MS;
}

/** Visual progressive level: Coffee=1, Dinner=2, Candy=3. */
export type MsstoreDonationTierVisualLevel = 1 | 2 | 3;

export interface MsstoreDonationTierMeta {
  tier: MsstoreDonationTipTierId;
  productId: string;
  visualLevel: MsstoreDonationTierVisualLevel;
  /** i18n key under pages namespace for short display name (卡布奇诺 / 小青龙 / 嘉年华). */
  shortNameKey: string;
  /** Optional emoji accent (not a price). */
  emoji: string;
  /** Tailwind-ish class tokens for progressive card chrome. */
  cardClassName: string;
  buttonClassName: string;
}

/**
 * Ordered tip tiers Coffee → Dinner → Candy.
 * No display price fields — Store checkout shows amount.
 */
export const MSSTORE_DONATION_TIER_CATALOG: readonly MsstoreDonationTierMeta[] = [
  {
    tier: 'coffee',
    productId: MSSTORE_DONATION_TIP_PRODUCT_IDS.coffee,
    visualLevel: 1,
    shortNameKey: 'donationItem.tiers.coffee.shortName',
    emoji: '☕',
    cardClassName:
      'border-primary/25 bg-gradient-to-br from-primary/5 via-card to-card shadow-sm',
    buttonClassName: 'shadow-sm hover:shadow-md hover:shadow-primary/20',
  },
  {
    tier: 'dinner',
    productId: MSSTORE_DONATION_TIP_PRODUCT_IDS.dinner,
    visualLevel: 2,
    shortNameKey: 'donationItem.tiers.dinner.shortName',
    emoji: '🦞',
    cardClassName:
      'border-orange-500/40 bg-gradient-to-br from-orange-500/15 via-card to-primary/10 shadow-md ring-1 ring-orange-500/20',
    buttonClassName: 'shadow-md hover:shadow-lg hover:shadow-orange-500/30',
  },
  {
    tier: 'candy',
    productId: MSSTORE_DONATION_TIP_PRODUCT_IDS.candy,
    visualLevel: 3,
    shortNameKey: 'donationItem.tiers.candy.shortName',
    emoji: '🎉',
    cardClassName:
      'border-fuchsia-500/50 bg-gradient-to-br from-fuchsia-500/20 via-orange-500/10 to-primary/15 shadow-lg ring-2 ring-fuchsia-500/30',
    buttonClassName:
      'shadow-lg hover:shadow-xl hover:shadow-fuchsia-500/40 bg-gradient-to-r from-primary to-fuchsia-600',
  },
] as const;

export function getMsstoreDonationTierCatalog(): readonly MsstoreDonationTierMeta[] {
  return MSSTORE_DONATION_TIER_CATALOG;
}

export function getMsstoreDonationTierOrder(): readonly MsstoreDonationTipTierId[] {
  return MSSTORE_DONATION_TIP_TIER_IDS;
}
