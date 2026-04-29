import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  fetchSidebarPromotion,
  normalizeSidebarPromotionLocale,
  type SidebarPromotionModel,
} from '../lib/sidebar-promotion';

export function useSidebarPromotion(): SidebarPromotionModel | null {
  const { t, i18n } = useTranslation('common');
  const promotionLocale = useMemo(
    () => normalizeSidebarPromotionLocale(i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage],
  );
  const [promotion, setPromotion] = useState<SidebarPromotionModel | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchSidebarPromotion(promotionLocale, t('navigation.promotion.defaultCta')).then((result) => {
      if (cancelled) {
        return;
      }

      setPromotion(result);
    });

    return () => {
      cancelled = true;
    };
  }, [promotionLocale, t]);

  return promotion;
}
