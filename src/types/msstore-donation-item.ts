import type { StoreLicensePurchaseOutcome } from './store-license.js';

/** Stable tip tier ids (renderer/preload → main maps to Store productId). */
export type MsstoreDonationTipTierId = 'coffee' | 'dinner' | 'candy';

export const MSSTORE_DONATION_TIP_TIER_IDS = ['coffee', 'dinner', 'candy'] as const satisfies readonly MsstoreDonationTipTierId[];

/** Microsoft Store product IDs for one-time tip SKUs (purchase mapping only; UI shows i18n short names, no prices). */
export const MSSTORE_DONATION_TIP_PRODUCT_IDS = {
  coffee: '9NC5T6VC1NQH',
  dinner: '9NSKR15751LN',
  candy: '9MWTKDX9J62G',
} as const satisfies Record<MsstoreDonationTipTierId, string>;

export type MsstoreDonationTipProductId =
  (typeof MSSTORE_DONATION_TIP_PRODUCT_IDS)[MsstoreDonationTipTierId];

export const MSSTORE_DONATION_TIP_PRODUCT_ID_SET = new Set<string>(
  Object.values(MSSTORE_DONATION_TIP_PRODUCT_IDS),
);

export type MsstoreDonationPurchaseCountsByTier = Record<MsstoreDonationTipTierId, number>;

export const DEFAULT_MSSTORE_DONATION_PURCHASE_COUNTS_BY_TIER: MsstoreDonationPurchaseCountsByTier = {
  coffee: 0,
  dinner: 0,
  candy: 0,
};

export interface MsstoreDonationItemState {
  /** Compatible total across all tiers (legacy + cumulative). */
  purchaseCount: number;
  purchaseCountsByTier: MsstoreDonationPurchaseCountsByTier;
  dismissedAt?: string;
}

export interface MsstoreDonationItemPurchaseRequest {
  tier: MsstoreDonationTipTierId;
  /** Optional debug override; must still pass whitelist when provided. */
  productId?: string;
}

export interface MsstoreDonationItemPurchaseResult {
  outcome: StoreLicensePurchaseOutcome;
  purchaseCount: number;
  purchaseCountsByTier: MsstoreDonationPurchaseCountsByTier;
  tier?: MsstoreDonationTipTierId;
}

export interface MsstoreDonationItemBridge {
  getState: () => Promise<MsstoreDonationItemState>;
  dismiss: () => Promise<MsstoreDonationItemState>;
  purchase: (input: MsstoreDonationItemPurchaseRequest) => Promise<MsstoreDonationItemPurchaseResult>;
  onDidChange: (callback: (state: MsstoreDonationItemState) => void) => () => void;
}

export const msstoreDonationItemChannels = {
  getState: 'get-msstore-donation-item-state',
  dismiss: 'dismiss-msstore-donation-item',
  purchase: 'purchase-msstore-donation-item',
  changed: 'msstore-donation-item:changed',
} as const;

export function isMsstoreDonationTipTierId(value: unknown): value is MsstoreDonationTipTierId {
  return value === 'coffee' || value === 'dinner' || value === 'candy';
}

export function resolveMsstoreDonationTipProductId(
  input: MsstoreDonationItemPurchaseRequest | MsstoreDonationTipTierId | string | null | undefined,
): { tier: MsstoreDonationTipTierId; productId: MsstoreDonationTipProductId } | null {
  if (input == null) {
    return null;
  }

  if (typeof input === 'string') {
    if (isMsstoreDonationTipTierId(input)) {
      return { tier: input, productId: MSSTORE_DONATION_TIP_PRODUCT_IDS[input] };
    }
    for (const tier of MSSTORE_DONATION_TIP_TIER_IDS) {
      if (MSSTORE_DONATION_TIP_PRODUCT_IDS[tier] === input) {
        return { tier, productId: MSSTORE_DONATION_TIP_PRODUCT_IDS[tier] };
      }
    }
    return null;
  }

  const tier = input.tier;
  if (!isMsstoreDonationTipTierId(tier)) {
    return null;
  }

  const mapped = MSSTORE_DONATION_TIP_PRODUCT_IDS[tier];
  if (input.productId != null && input.productId !== '' && input.productId !== mapped) {
    // Explicit productId must match whitelist mapping for that tier (or be another whitelist id of same tier only).
    if (!MSSTORE_DONATION_TIP_PRODUCT_ID_SET.has(input.productId)) {
      return null;
    }
    // Reject mismatched whitelist product for a different tier.
    if (input.productId !== mapped) {
      return null;
    }
  }

  return { tier, productId: mapped };
}
