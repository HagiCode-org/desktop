import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { toast } from 'sonner';
import { ArrowRight, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { AppDispatch, RootState } from '@/store';
import {
  selectHomePromoteImagesByKey,
  selectHomePromoteItems,
} from '@/store/slices/homePromoteSlice';
import { loadHomePromoteItems } from '@/store/thunks/homePromoteThunks';
import {
  getNextIndex,
  HOME_PROMOTE_REFRESH_INTERVAL_MS,
  HOME_PROMOTE_ROTATE_INTERVAL_MS,
  shouldAutoRotate,
} from '@/lib/home-promote';
import { resolveDesktopLanguageCode } from '../../shared/desktop-languages';
import { trackEvent } from '../telemetry';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export default function HomePromotePanel() {
  const { t, i18n } = useTranslation(['components']);
  const dispatch = useDispatch<AppDispatch>();
  const items = useSelector((state: RootState) => selectHomePromoteItems(state));
  const imagesByKey = useSelector((state: RootState) => selectHomePromoteImagesByKey(state));
  const language = resolveDesktopLanguageCode(i18n.resolvedLanguage ?? i18n.language);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [documentVisible, setDocumentVisible] = useState(() => document.visibilityState !== 'hidden');
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia(REDUCED_MOTION_QUERY).matches);
  const [brokenImageKeys, setBrokenImageKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [announcement, setAnnouncement] = useState('');

  const count = items.length;
  const currentIndex = count > 0 ? Math.min(index, count - 1) : 0;
  const current = items[currentIndex];

  useEffect(() => {
    void dispatch(loadHomePromoteItems(language));
    const timer = window.setInterval(() => {
      void dispatch(loadHomePromoteItems(language));
    }, HOME_PROMOTE_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [dispatch, language]);

  useEffect(() => {
    const handleVisibilityChange = () => setDocumentVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const handleChange = () => setReducedMotion(query.matches);
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!shouldAutoRotate({ count, hovered, focused, paused, reducedMotion, documentVisible })) return;
    const timer = window.setInterval(() => {
      setIndex((value) => getNextIndex(value, count, 1));
    }, HOME_PROMOTE_ROTATE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [count, currentIndex, documentVisible, focused, hovered, paused, reducedMotion]);

  if (!current) return null;

  const step = (direction: 1 | -1) => {
    const nextIndex = getNextIndex(currentIndex, count, direction);
    setIndex(nextIndex);
    setAnnouncement(items[nextIndex]?.title ?? '');
  };

  const handleOpenLink = async () => {
    try {
      const result = await window.electronAPI.openExternal(current.link);
      if (result.success) {
        trackEvent('promote_link_opened', { source: 'home_promote' });
      } else {
        toast.error(t('homePromote.openFailed'));
      }
    } catch {
      toast.error(t('homePromote.openFailed'));
    }
  };

  const image = current.image;
  const imageUrl = image ? imagesByKey[image.key] : undefined;
  const showImage = Boolean(image && imageUrl && !brokenImageKeys.has(image.key));

  return (
    <section
      aria-label={t('homePromote.regionLabel')}
      className="@container flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-sm"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
          setFocused(false);
        }
      }}
    >
      <h2 className="text-sm font-semibold text-foreground">
        {t('homePromote.title')}
      </h2>
      <p aria-live="polite" className="sr-only">{announcement}</p>

      <div className="mt-3 flex h-[29rem] flex-col @md:h-[16rem]">
        <article key={current.id} className="flex min-h-0 flex-1 flex-col @md:flex-row @md:gap-4">
          {showImage && image && imageUrl ? (
            <div className="aspect-video w-full shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted @md:w-[45%]">
              <img
                src={imageUrl}
                alt={image.alt}
                width={image.width}
                height={image.height}
                decoding="async"
                className="h-full w-full object-cover"
                onError={() => setBrokenImageKeys((previous) => new Set(previous).add(image.key))}
              />
            </div>
          ) : null}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col @md:justify-center">
            <h3 className="mt-3 line-clamp-2 text-base font-semibold leading-6 text-foreground @md:mt-0">
              {current.title}
            </h3>
            <p className="mt-2 line-clamp-3 text-sm leading-5 text-muted-foreground">
              {current.description}
            </p>
          </div>
        </article>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <Button type="button" variant="outline" size="sm" onClick={() => void handleOpenLink()} className="gap-1.5">
            {current.ctaLabel ?? t('homePromote.defaultCta')}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>

          {count > 1 ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('homePromote.previous')}
                onClick={() => step(-1)}
                className="h-8 w-8"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
                {t('homePromote.position', { current: currentIndex + 1, total: count })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t('homePromote.next')}
                onClick={() => step(1)}
                className="h-8 w-8"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={paused ? t('homePromote.resume') : t('homePromote.pause')}
                aria-pressed={paused}
                onClick={() => setPaused((value) => !value)}
                className="h-8 w-8"
              >
                {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
