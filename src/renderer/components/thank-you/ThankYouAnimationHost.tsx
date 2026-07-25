import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  const shortName = t(`donationItem.tiers.${playing.tier}.shortName`, { ns: 'pages' });
  const title = t('donationItem.messages.tierThanks', {
    ns: 'pages',
    shortName,
    defaultValue: t('donationItem.thankYouAnimation.title', { ns: 'pages' }),
  });
  const subtitle = t('donationItem.thankYouAnimation.noPrivilege', {
    ns: 'pages',
    defaultValue: t('donationItem.noPrivilegeNotice', { ns: 'pages' }),
  });
  const closeLabel = t('donationItem.thankYouAnimation.close', { ns: 'pages' });

  const variantId = Math.min(
    Math.max(playing.variantId, 0),
    4,
  ) as ThankYouVariantId;

  return (
    <div
      className="fixed inset-0 z-[100] flex"
      data-testid="thank-you-animation-host"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <ThankYouVariantView
        tier={playing.tier}
        variantId={variantId}
        reducedMotion={reducedMotion}
        title={title}
        subtitle={subtitle}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-end p-4">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="pointer-events-auto gap-1 shadow-lg"
          onClick={() => dispatch(closeThankYouAnimation())}
          aria-label={closeLabel}
          data-testid="thank-you-animation-close"
        >
          <X className="h-4 w-4" />
          {closeLabel}
        </Button>
      </div>
    </div>
  );
}

export default ThankYouAnimationHost;
