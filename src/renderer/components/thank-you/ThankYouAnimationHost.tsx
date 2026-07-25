import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@/store';
import {
  closeThankYouAnimation,
  selectThankYouAnimation,
} from '@/store/slices/msstoreDonationItemSlice';
import {
  getThankYouTierTokens,
  type ThankYouVariantId,
} from '@/lib/sponsor-thank-you-animation';
import { ThankYouVariantView } from './ThankYouVariantView';

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reduced;
}

/**
 * Single fullscreen thank-you overlay host.
 * Mount once in app shell so playback survives donation panel unmount.
 * Dismiss: click anywhere, Escape, or tier auto-timeout.
 */
export function ThankYouAnimationHost() {
  const { t } = useTranslation(['pages']);
  const dispatch = useDispatch<AppDispatch>();
  const session = useSelector((state: RootState) => selectThankYouAnimation(state));
  const reducedMotion = usePrefersReducedMotion();

  const playing = session.status === 'playing' ? session : null;

  const tokens = useMemo(
    () => (playing ? getThankYouTierTokens(playing.tier) : null),
    [playing],
  );

  useEffect(() => {
    if (!playing || !tokens) {
      return;
    }

    const timeoutMs = reducedMotion
      ? tokens.reducedMotionDurationMs
      : tokens.durationMs;
    const timer = window.setTimeout(() => {
      dispatch(closeThankYouAnimation());
    }, timeoutMs);

    return () => window.clearTimeout(timer);
  }, [dispatch, playing, reducedMotion, tokens]);

  useEffect(() => {
    if (!playing) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dispatch(closeThankYouAnimation());
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch, playing]);

  if (!playing || !tokens) {
    return null;
  }

  const title = t('donationItem.thankYouAnimation.title', { ns: 'pages' });
  const subtitle = t('donationItem.thankYouAnimation.message', { ns: 'pages' });
  const closeLabel = t('donationItem.thankYouAnimation.close', { ns: 'pages' });

  const variantId = Math.min(
    Math.max(playing.variantId, 0),
    4,
  ) as ThankYouVariantId;

  return (
    <div
      className="fixed inset-0 z-[100] flex cursor-pointer"
      data-testid="thank-you-animation-host"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      title={closeLabel}
      onClick={() => dispatch(closeThankYouAnimation())}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          dispatch(closeThankYouAnimation());
        }
      }}
    >
      <ThankYouVariantView
        tier={playing.tier}
        variantId={variantId}
        reducedMotion={reducedMotion}
        title={title}
        subtitle={subtitle}
      />
    </div>
  );
}

export default ThankYouAnimationHost;
