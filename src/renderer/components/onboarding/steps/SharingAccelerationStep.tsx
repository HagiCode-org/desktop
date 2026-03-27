import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
    <div className="space-y-8">
      <div className="space-y-2 text-center">
        <h2 className="text-3xl font-bold">{t('sharingAcceleration.title')}</h2>
        <p className="mx-auto max-w-2xl text-muted-foreground">
          {t('sharingAcceleration.description')}
        </p>
      </div>

      <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between gap-6">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">{t('sharingAcceleration.toggleTitle')}</h3>
            <p className="text-sm text-muted-foreground">{t('sharingAcceleration.toggleDescription')}</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>{t('sharingAcceleration.bullets.latest')}</li>
              <li>{t('sharingAcceleration.bullets.fallback')}</li>
              <li>{t('sharingAcceleration.bullets.disable')}</li>
            </ul>
          </div>
          <Switch checked={enabled} onCheckedChange={handleCheckedChange} />
        </div>
      </div>
    </div>
  );
}

export default SharingAccelerationStep;
