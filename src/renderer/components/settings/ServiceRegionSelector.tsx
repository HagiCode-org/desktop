import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { LoaderCircle, MapPin } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { AppDispatch, RootState } from '@/store';
import { isServiceRegion } from '../../../shared/service-region.js';
import { selectServiceRegionError, selectServiceRegionLoading, selectServiceRegionSaving, selectServiceRegion } from '@/store/slices/serviceRegionSlice';
import { setServiceRegion } from '@/store/thunks/serviceRegionThunks';

interface ServiceRegionSelectorProps {
  disabled?: boolean;
  compact?: boolean;
}

export function ServiceRegionSelector({ disabled = false, compact = false }: ServiceRegionSelectorProps) {
  const { t } = useTranslation('components');
  const dispatch = useDispatch<AppDispatch>();
  const region = useSelector((state: RootState) => selectServiceRegion(state));
  const isLoading = useSelector((state: RootState) => selectServiceRegionLoading(state));
  const isSaving = useSelector((state: RootState) => selectServiceRegionSaving(state));
  const error = useSelector((state: RootState) => selectServiceRegionError(state));
  const controlDisabled = disabled || isLoading || isSaving;

  const handleChange = (value: string) => {
    if (controlDisabled || value === region || !isServiceRegion(value)) {
      return;
    }
    void dispatch(setServiceRegion(value));
  };

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'} aria-busy={isLoading || isSaving}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
            <h3 className="font-medium text-foreground">{t('serviceRegion.title')}</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t('serviceRegion.description')}</p>
        </div>
        <span className="inline-flex items-center rounded-full border border-border/70 bg-muted/30 px-2.5 py-1 text-xs text-muted-foreground" role="status">
          {isLoading
            ? t('serviceRegion.loading')
            : isSaving
              ? t('serviceRegion.saving')
              : t('serviceRegion.current', { region: t(`serviceRegion.regions.${region}`) })}
        </span>
      </div>

      <RadioGroup
        value={region}
        onValueChange={handleChange}
        disabled={controlDisabled}
        aria-label={t('serviceRegion.choiceLabel')}
        className="grid gap-2 sm:grid-cols-2"
      >
        {(['CN', 'INTERNATIONAL'] as const).map((value) => {
          const id = `service-region-${value.toLowerCase()}`;
          return (
            <div key={value} className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/70 px-3 py-3">
              <RadioGroupItem id={id} value={value} />
              <Label htmlFor={id} className="cursor-pointer font-medium">
                {t(`serviceRegion.regions.${value}`)}
              </Label>
            </div>
          );
        })}
      </RadioGroup>

      {disabled ? (
        <p className="text-sm text-muted-foreground" role="status">{t('serviceRegion.steamRestricted')}</p>
      ) : null}

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>{t('serviceRegion.changeFailed')}</AlertTitle>
          <AlertDescription>{t('serviceRegion.errorDetails', { error })}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
