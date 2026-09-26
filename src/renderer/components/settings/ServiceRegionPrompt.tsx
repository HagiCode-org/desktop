import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Check, MapPin } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { AppDispatch, RootState } from '@/store';
import { isServiceRegion } from '../../../shared/service-region.js';
import type { ServiceRegion } from '../../../types/service-region.js';
import {
  selectServiceRegion,
  selectServiceRegionError,
  selectServiceRegionLoading,
  selectServiceRegionSaving,
} from '@/store/slices/serviceRegionSlice';
import { setServiceRegion } from '@/store/thunks/serviceRegionThunks';

interface ServiceRegionPromptProps {
  disabled?: boolean;
}

export function ServiceRegionPrompt({ disabled = false }: ServiceRegionPromptProps) {
  const { t } = useTranslation('components');
  const dispatch = useDispatch<AppDispatch>();
  const region = useSelector((state: RootState) => selectServiceRegion(state));
  const error = useSelector((state: RootState) => selectServiceRegionError(state));
  const isLoading = useSelector((state: RootState) => selectServiceRegionLoading(state));
  const isSaving = useSelector((state: RootState) => selectServiceRegionSaving(state));
  const isExplicit = useSelector((state: RootState) => state.serviceRegion.isExplicit);
  const [open, setOpen] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<ServiceRegion>(region);

  useEffect(() => {
    if (!disabled && !isLoading && !isExplicit && !skipped && !confirmed) {
      setSelectedRegion(region);
      setOpen(true);
    }
  }, [confirmed, disabled, isExplicit, isLoading, region, skipped]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      if (confirmed) {
        setConfirmed(false);
      } else {
        setSkipped(true);
      }
    }
  };

  const handleConfirm = async () => {
    const action = await dispatch(setServiceRegion(selectedRegion));
    if (setServiceRegion.fulfilled.match(action) && action.payload.success) {
      setConfirmed(true);
    }
  };

  return (
    <Dialog open={open || confirmed} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {confirmed ? (
          <>
            <DialogHeader>
              <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Check className="h-5 w-5" aria-hidden="true" />
              </div>
              <DialogTitle>{t('serviceRegion.successTitle')}</DialogTitle>
              <DialogDescription>{t('serviceRegion.successDescription')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => handleOpenChange(false)}>{t('serviceRegion.done')}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MapPin className="h-5 w-5" aria-hidden="true" />
              </div>
              <DialogTitle>{t('serviceRegion.promptTitle')}</DialogTitle>
              <DialogDescription>{t('serviceRegion.promptDescription')}</DialogDescription>
            </DialogHeader>

            <RadioGroup
              value={selectedRegion}
              onValueChange={(value) => {
                if (isServiceRegion(value)) setSelectedRegion(value);
              }}
              disabled={isLoading || isSaving}
              aria-label={t('serviceRegion.choiceLabel')}
              className="grid gap-3"
            >
              {(['CN', 'INTERNATIONAL'] as const).map((value) => {
                const id = `service-region-prompt-${value.toLowerCase()}`;
                return (
                  <Label
                    key={value}
                    htmlFor={id}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/20 p-4 transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                  >
                    <RadioGroupItem id={id} value={value} className="mt-0.5" />
                    <span className="space-y-1">
                      <span className="block font-medium">{t(`serviceRegion.regions.${value}`)}</span>
                      <span className="block text-sm leading-5 text-muted-foreground">
                        {t(`serviceRegion.regionDetails.${value}`)}
                      </span>
                    </span>
                  </Label>
                );
              })}
            </RadioGroup>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {t('serviceRegion.errorDetails', { error })}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
                {t('serviceRegion.later')}
              </Button>
              <Button type="button" onClick={() => void handleConfirm()} disabled={isLoading || isSaving}>
                {isSaving ? t('serviceRegion.saving') : t('serviceRegion.confirmChoice')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
