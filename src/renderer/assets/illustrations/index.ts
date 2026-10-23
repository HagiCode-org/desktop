/**
 * Illustrations generated with repos/img-gen (recipe sets `desktop-*`), encoded as AVIF at their display size.
 * Every picture is decorative: render it with `alt=""` and `aria-hidden`, the surrounding text carries the meaning.
 */

import donationCoffee from './donation/coffee.avif';
import donationDinner from './donation/dinner.avif';
import donationCandy from './donation/candy.avif';
import stateStartFailed from './states/start-failed.avif';
import stateDependencyMissing from './states/dependency-missing.avif';
import onboardingWelcome from './onboarding/welcome.avif';
import onboardingLanguage from './onboarding/language.avif';
import onboardingLegal from './onboarding/legal.avif';
import promoteDefault from './promote/highlight-default.avif';
import promoteRelease from './promote/highlight-release.avif';
import promoteCommunity from './promote/highlight-community.avif';
import bannerSubscription from './banners/subscription.avif';
import bannerTurboEngine from './banners/turboengine.avif';
import bannerStoreOffer from './banners/store-offer.avif';

/** Tip tier pictures, 256 x 256, keyed by the donation tier id. */
export const DONATION_TIER_IMAGES = {
  coffee: donationCoffee,
  dinner: donationDinner,
  candy: donationCandy,
} as const;

/** State pictures, 320 x 320. */
export const STATE_IMAGES = {
  startFailed: stateStartFailed,
  dependencyMissing: stateDependencyMissing,
} as const;

/** First-run step pictures, 800 x 450. */
export const ONBOARDING_IMAGES = {
  welcome: onboardingWelcome,
  language: onboardingLanguage,
  legal: onboardingLegal,
} as const;

/** Covers for a home highlight that has no usable image of its own, 640 x 360. */
export const PROMOTE_FALLBACK_COVERS: readonly string[] = [promoteDefault, promoteRelease, promoteCommunity];

/** Page banners, 960 x 288. */
export const BANNER_IMAGES = {
  subscription: bannerSubscription,
  turboEngine: bannerTurboEngine,
  storeOffer: bannerStoreOffer,
} as const;
