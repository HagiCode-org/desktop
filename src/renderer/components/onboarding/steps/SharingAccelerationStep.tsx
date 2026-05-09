import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Share2 } from 'lucide-react';
import { Switch } from '../../ui/switch';

export interface SharingAccelerationStepProps {
  onReadyChange?: (ready: boolean) => void;
}

function SharingAccelerationStep({ onReadyChange }: SharingAccelerationStepProps) {
  const { t } = useTranslation('onboarding');
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    void (async () => {
      const settings = await window.electronAPI.sharingAcceleration.get();
      setEnabled(settings?.enabled ?? true);
      onReadyChange?.(true);
    })();
  }, [onReadyChange]);

  const handleCheckedChange = async (checked: boolean) => {
    setEnabled(checked);
    await window.electronAPI.sharingAcceleration.recordOnboardingChoice(checked);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="space-y-3 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Share2 className="h-7 w-7" />
        </div>
        <h2 className="text-3xl font-semibold tracking-tight">{t('sharingAcceleration.title')}</h2>
        <p className="mx-auto max-w-2xl text-sm text-muted-foreground md:text-base">
          {t('sharingAcceleration.description')}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-2xl border bg-muted/20 p-6 sm:p-7">
          <h3 className="text-lg font-semibold text-foreground">{t('sharingAcceleration.toggleTitle')}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{t('sharingAcceleration.description')}</p>
          <ul className="mt-5 space-y-3">
            {[
              'sharingAcceleration.bullets.latest',
              'sharingAcceleration.bullets.fallback',
              'sharingAcceleration.bullets.portable',
              'sharingAcceleration.bullets.disable',
            ].map((bulletKey) => (
              <li key={bulletKey} className="flex items-start gap-3 text-sm text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{t(bulletKey)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-7">
          <div className="flex items-start justify-between gap-6">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground">{t('sharingAcceleration.toggleTitle')}</h3>
              <p className="text-sm text-muted-foreground">{t('sharingAcceleration.toggleDescription')}</p>
            </div>
            <Switch checked={enabled} onCheckedChange={handleCheckedChange} />
          </div>

          <div className="mt-6 rounded-xl border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">
              {enabled ? t('sharingAcceleration.bullets.latest') : t('sharingAcceleration.bullets.disable')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SharingAccelerationStep;
