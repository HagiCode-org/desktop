/**
 * Home supporting-rail plan.
 *
 * The rail ranks three kinds of content by who is looking at it:
 * - free users are guided: the purchase panel leads, then recommendations;
 * - paid users are served: recommendations lead, the purchase panel shrinks to a
 *   one-line entitlement row, and the feed is trimmed to its featured article;
 * - while entitlements are still loading nothing sales-related is shown, so a paying
 *   user never sees a purchase prompt flash by.
 */

export type HomeEntitlementTier = 'free' | 'paid' | 'unknown';

export type HomeCommercePreviewScenario = 'live' | 'non-store' | 'inactive' | 'active';

export interface HomeEntitlementSource {
  /** The preload bridge for this entitlement exists in this runtime. */
  bridgeAvailable: boolean;
  snapshotStatus: string | null | undefined;
  /** The last lookup failed; a missing snapshot is then final, not pending. */
  hasError: boolean;
}

export interface HomeEntitlementInput {
  scenario: HomeCommercePreviewScenario;
  subscription: HomeEntitlementSource;
  turboEngine: HomeEntitlementSource;
}

/**
 * Paid means at least one entitlement (sponsor plan or TurboEngine) is active.
 * No bridge (non-Store runtime) or a failed lookup counts as free, because the
 * purchase panel is also where those users are pointed at the Store edition.
 */
export function resolveHomeEntitlementTier(input: HomeEntitlementInput): HomeEntitlementTier {
  if (input.scenario === 'active') return 'paid';
  if (input.scenario !== 'live') return 'free';

  const sources = [input.subscription, input.turboEngine];
  if (sources.some((source) => source.bridgeAvailable && source.snapshotStatus === 'active')) {
    return 'paid';
  }

  const pending = sources.some(
    (source) => source.bridgeAvailable && !source.snapshotStatus && !source.hasError,
  );
  return pending ? 'unknown' : 'free';
}

export type HomeRailSlot = 'highlights' | 'offer' | 'donation' | 'rating';

export interface HomeRailPlan {
  /** Slots in the side rail that sits beside the daily-operations column. */
  side: HomeRailSlot[];
  /** Slots in the full-width band under both columns. */
  band: HomeRailSlot[];
  /** Collapse the purchase panel to a one-line entitlement row. */
  offerCompact: boolean;
}

export interface HomeRailPlanOptions {
  /** The Highlights panel has at least one item to show. */
  hasHighlights: boolean;
}

/**
 * Where the supporting panels go, by who is looking.
 *
 * The side rail only ever holds the heavy commerce cards, so it stays close to the
 * height of the operations column. Highlights is wide content (it switches to a
 * horizontal layout above ~28rem), so it lives in the full-width band instead of a
 * narrow rail. In a single-column window the reading order is the same:
 * operations, side rail, band.
 *
 * - free:    purchase panel beside the operations; Highlights and rating below.
 * - paid:    no rail (operations get the full width); Highlights, a one-line license
 *            row and rating below. The donation card stays in the rail when shown.
 * - unknown: Highlights only, so a paying user never sees a purchase prompt flash by.
 */
export function planHomeRail(
  tier: HomeEntitlementTier,
  { hasHighlights }: HomeRailPlanOptions,
): HomeRailPlan {
  const highlights: HomeRailSlot[] = hasHighlights ? ['highlights'] : [];

  switch (tier) {
    case 'free':
      return { side: ['offer', 'donation'], band: [...highlights, 'rating'], offerCompact: false };
    case 'paid':
      return { side: ['donation'], band: [...highlights, 'offer', 'rating'], offerCompact: true };
    default:
      return { side: [], band: highlights, offerCompact: false };
  }
}
