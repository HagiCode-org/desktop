import type { MsstoreDonationTipTierId } from '../../../types/msstore-donation-item.js';
import type { ThankYouVariantId } from '@/lib/sponsor-thank-you-animation';
import { getThankYouTierTokens } from '@/lib/sponsor-thank-you-animation';

export interface ThankYouVariantViewProps {
  tier: MsstoreDonationTipTierId;
  variantId: ThankYouVariantId;
  reducedMotion: boolean;
  title: string;
  subtitle: string;
}

const VARIANT_MOTIFS: Record<ThankYouVariantId, string> = {
  0: '✦',
  1: '❋',
  2: '✧',
  3: '✶',
  4: '✺',
};

/**
 * Progressive fullscreen thank-you visual for a tier + variant.
 * Intensity comes from tier tokens; motif/layout shifts by variantId 0..4.
 */
export function ThankYouVariantView({
  tier,
  variantId,
  reducedMotion,
  title,
  subtitle,
}: ThankYouVariantViewProps) {
  const tokens = getThankYouTierTokens(tier);
  const motif = VARIANT_MOTIFS[variantId];
  const particles = reducedMotion
    ? Math.min(3, tokens.particleCount)
    : tokens.particleCount;

  const layoutClass =
    variantId === 0
      ? 'items-center justify-center'
      : variantId === 1
        ? 'items-end justify-center pb-24'
        : variantId === 2
          ? 'items-start justify-center pt-24'
          : variantId === 3
            ? 'items-center justify-start pl-16'
            : 'items-center justify-end pr-16';

  return (
    <div
      className={`pointer-events-none absolute inset-0 flex ${layoutClass} bg-gradient-to-br ${tokens.className}`}
      data-testid="thank-you-variant"
      data-tier={tier}
      data-variant={variantId}
      data-intensity={tokens.intensity}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
    >
      {/* ambient particles */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        {Array.from({ length: particles }, (_, i) => {
          const left = ((i * 37) + variantId * 13) % 100;
          const top = ((i * 53) + variantId * 17) % 100;
          const delay = reducedMotion ? 0 : (i % 8) * 0.12;
          const size =
            tokens.intensity === 'strong'
              ? 10 + (i % 5) * 4
              : tokens.intensity === 'medium'
                ? 8 + (i % 4) * 3
                : 6 + (i % 3) * 2;
          return (
            <span
              key={i}
              className={`absolute rounded-full ${tokens.accentClassName} ${
                reducedMotion ? 'opacity-40' : 'animate-pulse opacity-70'
              }`}
              style={{
                left: `${left}%`,
                top: `${top}%`,
                width: size,
                height: size,
                animationDelay: `${delay}s`,
              }}
            />
          );
        })}
      </div>

      <div className="relative z-10 mx-6 max-w-lg rounded-2xl border border-white/15 bg-black/35 px-8 py-10 text-center shadow-2xl backdrop-blur-md">
        <div
          className={`mb-4 select-none ${
            tokens.intensity === 'strong'
              ? 'text-6xl'
              : tokens.intensity === 'medium'
                ? 'text-5xl'
                : 'text-4xl'
          } ${reducedMotion ? '' : 'animate-bounce'}`}
          aria-hidden="true"
        >
          {motif}
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          {title}
        </h2>
        <p className="mt-3 text-sm text-white/80 sm:text-base">{subtitle}</p>
        <p
          className="mt-4 text-xs uppercase tracking-widest text-white/50"
          data-testid="thank-you-variant-label"
        >
          {tier} · v{variantId + 1}
        </p>
      </div>
    </div>
  );
}
