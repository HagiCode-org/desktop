import type { MsstoreDonationTipTierId } from '../../types/msstore-donation-item.js';

export const THANK_YOU_VARIANT_COUNT = 5;

export type ThankYouVariantId = 0 | 1 | 2 | 3 | 4;

export type ThankYouIntensity = 'light' | 'medium' | 'strong';

export interface ThankYouTierTokens {
  intensity: ThankYouIntensity;
  /** Auto-close timeout in ms when user does not dismiss. */
  durationMs: number;
  reducedMotionDurationMs: number;
  particleCount: number;
  className: string;
  accentClassName: string;
}

export const THANK_YOU_TIER_TOKENS: Record<MsstoreDonationTipTierId, ThankYouTierTokens> = {
  coffee: {
    intensity: 'light',
    durationMs: 3200,
    reducedMotionDurationMs: 1600,
    particleCount: 8,
    className: 'from-amber-900/90 via-stone-900/95 to-background',
    accentClassName: 'bg-amber-400/80',
  },
  dinner: {
    intensity: 'medium',
    durationMs: 4800,
    reducedMotionDurationMs: 2000,
    particleCount: 18,
    className: 'from-rose-900/90 via-orange-950/95 to-background',
    accentClassName: 'bg-rose-400/80',
  },
  candy: {
    intensity: 'strong',
    durationMs: 7000,
    reducedMotionDurationMs: 2400,
    particleCount: 36,
    className: 'from-fuchsia-900/95 via-violet-950/95 to-background',
    accentClassName: 'bg-fuchsia-400/90',
  },
};

export type ThankYouRng = () => number;

/**
 * Pick a thank-you variant index in range 0..4 for the given tier.
 * RNG is injectable for tests; defaults to Math.random.
 */
export function pickThankYouVariant(
  _tier: MsstoreDonationTipTierId,
  rng: ThankYouRng = Math.random,
): ThankYouVariantId {
  const raw = rng();
  const unit = Number.isFinite(raw) ? raw : 0;
  const clamped = Math.min(Math.max(unit, 0), 0.999999);
  const index = Math.floor(clamped * THANK_YOU_VARIANT_COUNT);
  return index as ThankYouVariantId;
}

export function getThankYouTierTokens(tier: MsstoreDonationTipTierId): ThankYouTierTokens {
  return THANK_YOU_TIER_TOKENS[tier];
}

export interface ThankYouVariantMeta {
  tier: MsstoreDonationTipTierId;
  variantId: ThankYouVariantId;
  label: string;
}

/** Stable registry: five variants per tier (15 total). */
export const THANK_YOU_VARIANT_REGISTRY: Record<
  MsstoreDonationTipTierId,
  readonly ThankYouVariantMeta[]
> = {
  coffee: [0, 1, 2, 3, 4].map((variantId) => ({
    tier: 'coffee' as const,
    variantId: variantId as ThankYouVariantId,
    label: `coffee-${variantId}`,
  })),
  dinner: [0, 1, 2, 3, 4].map((variantId) => ({
    tier: 'dinner' as const,
    variantId: variantId as ThankYouVariantId,
    label: `dinner-${variantId}`,
  })),
  candy: [0, 1, 2, 3, 4].map((variantId) => ({
    tier: 'candy' as const,
    variantId: variantId as ThankYouVariantId,
    label: `candy-${variantId}`,
  })),
};

export function listThankYouVariants(tier: MsstoreDonationTipTierId): readonly ThankYouVariantMeta[] {
  return THANK_YOU_VARIANT_REGISTRY[tier];
}
