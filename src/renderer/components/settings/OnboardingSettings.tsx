import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export function OnboardingSettings() {
  const { t } = useTranslation('pages');
  const [isResetting, setIsResetting] = useState(false);

  const handleResetOnboarding = async () => {
    setIsResetting(true);
    try {
      const result = await window.electronAPI.resetOnboarding();
      if (result.success) {
        toast.success(t('settings.onboarding.resetSuccess'));
      } else {
        toast.error(t('settings.onboarding.resetError', { error: result.error }));
      }
    } catch (error) {
      toast.error(t('settings.onboarding.resetError', { error: String(error) }));
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t('settings.onboarding.title')}</CardTitle>
        <CardDescription>
          {t('settings.onboarding.description')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-4">
          <div className="flex-1 space-y-2">
            <h3 className="font-medium text-foreground">
              {t('settings.onboarding.restartWizard')}
            </h3>
            <p className="text-sm text-muted-foreground">
              {t('settings.onboarding.restartWizardDescription')}
            </p>
          </div>
          <Button
            onClick={handleResetOnboarding}
            disabled={isResetting}
            variant="default"
          >
            {isResetting ? t('settings.onboarding.resetting') : t('settings.onboarding.restartButton')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
