import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowRight, Star } from 'lucide-react';
import { HAGICODE_DESKTOP_WINDOWS_STORE_REVIEW_URL } from '../../types/store-license.js';
import { shouldShowRatingPrompt } from '../lib/msstore-rating-prompt.js';
import { Button } from '@/components/ui/button';

interface HomeStoreRatingPromptProps {
  isWindowsStoreRuntime: boolean;
}

export default function HomeStoreRatingPrompt({ isWindowsStoreRuntime }: HomeStoreRatingPromptProps) {
  const { t } = useTranslation(['common', 'pages']);
  const [installDate, setInstallDate] = useState<string | undefined>(undefined);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const bridge = typeof window.electronAPI?.getMsstoreRatingPromptState === 'function'
      ? window.electronAPI.getMsstoreRatingPromptState
      : null;

    if (!bridge) {
      setIsReady(true);
      return;
    }

    void bridge()
      .then((state) => {
        if (cancelled) {
          return;
        }
        setInstallDate(state?.installDate);
      })
      .catch((error) => {
        console.error('Failed to load MS Store rating prompt state:', error);
      })
      .finally(() => {
        if (!cancelled) {
          setIsReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!isReady) {
    return null;
  }

  if (!shouldShowRatingPrompt({ isWindowsStoreRuntime, installDate })) {
    return null;
  }

  const handleRate = async () => {
    const result = await window.electronAPI.openExternal(HAGICODE_DESKTOP_WINDOWS_STORE_REVIEW_URL);

    if (!result.success) {
      toast.error(t('ratingPrompt.errors.openFailed', {
        ns: 'pages',
        error: result.error || t('ratingPrompt.errors.openFailedFallback', { ns: 'pages' }),
      }));
    }
  };

  return (
    <section className="msstore-rating-prompt-shell rounded-3xl p-6 sm:p-7">
      <div className="flex items-start gap-3">
        <div className="msstore-rating-prompt-icon rounded-xl p-2.5">
          <Star className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="msstore-rating-prompt-heading font-medium">
            {t('pages:ratingPrompt.title')}
          </h3>
          <p className="msstore-rating-prompt-copy mt-2 max-w-[62ch] text-sm leading-6">
            {t('pages:ratingPrompt.description')}
          </p>

          <div className="mt-4">
            <Button
              type="button"
              onClick={() => void handleRate()}
              className="msstore-rating-prompt-action justify-between"
            >
              <span className="inline-flex items-center gap-2">
                <Star className="h-4 w-4" />
                {t('pages:ratingPrompt.actions.rate')}
              </span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
