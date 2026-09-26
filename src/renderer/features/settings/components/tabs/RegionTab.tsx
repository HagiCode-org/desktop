import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ServiceRegionSelector } from '@/components/settings/ServiceRegionSelector';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@/store';
import { selectServiceRegionSaving } from '@/store/slices/serviceRegionSlice';
import { resetServiceRegionPreference } from '@/store/thunks/serviceRegionThunks';
import type { SettingsTabComponentProps } from '../../types';

export function RegionTab({ distributionState }: SettingsTabComponentProps) {
  const { t } = useTranslation('components');
  const dispatch = useDispatch<AppDispatch>();
  const isSaving = useSelector((state: RootState) => selectServiceRegionSaving(state));
  const disabled = distributionState.steamMode || isSaving;

  const handleReset = () => {
    void dispatch(resetServiceRegionPreference()).then((action) => {
      if (resetServiceRegionPreference.fulfilled.match(action) && action.payload.success) {
        toast.success(t('serviceRegion.resetSuccess'));
      }
    });
  };

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-2xl border border-border/70 bg-background/70 p-5">
        <ServiceRegionSelector disabled={distributionState.steamMode} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/70 pt-4">
        <div className="space-y-1">
          <h3 className="font-medium text-foreground">{t('serviceRegion.resetTitle')}</h3>
          <p className="text-sm text-muted-foreground">{t('serviceRegion.resetDescription')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={handleReset}
        >
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
          {isSaving ? t('serviceRegion.saving') : t('serviceRegion.resetButton')}
        </Button>
      </div>
    </div>
  );
}
