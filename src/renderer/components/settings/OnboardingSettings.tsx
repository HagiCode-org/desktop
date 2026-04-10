import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { resetHomepageTourState } from '@/lib/homepageInteractiveTour';
import { toast } from 'sonner';

export function OnboardingSettings() {
  const { t } = useTranslation('pages');
  const [isResettingOnboarding, setIsResettingOnboarding] = useState(false);
  const [isResettingHomepageTour, setIsResettingHomepageTour] = useState(false);

  const handleResetOnboarding = async () => {
    setIsResettingOnboarding(true);
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
      setIsResettingOnboarding(false);
    }
  };

  const handleResetHomepageTour = async () => {
    setIsResettingHomepageTour(true);
    try {
      const result = resetHomepageTourState();
      if (result.success) {
        toast.success(t('settings.onboarding.homepageTour.resetSuccess'));
      } else {
        toast.error(t('settings.onboarding.homepageTour.resetError', { error: result.error ?? 'Unknown error' }));
      }
    } catch (error) {
      toast.error(t('settings.onboarding.homepageTour.resetError', { error: String(error) }));
    } finally {
      setIsResettingHomepageTour(false);
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
      <CardContent className="space-y-5">
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
            disabled={isResettingOnboarding}
            variant="default"
          >
            {isResettingOnboarding ? t('settings.onboarding.resetting') : t('settings.onboarding.restartButton')}
          </Button>
        </div>

        <div className="border-t border-border pt-5">
          <div className="flex items-start gap-4">
            <div className="flex-1 space-y-2">
              <h3 className="font-medium text-foreground">
                {t('settings.onboarding.homepageTour.title')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t('settings.onboarding.homepageTour.description')}
              </p>
            </div>
            <Button
              onClick={() => void handleResetHomepageTour()}
              disabled={isResettingHomepageTour}
              variant="outline"
            >
              {isResettingHomepageTour
                ? t('settings.onboarding.homepageTour.resetting')
                : t('settings.onboarding.homepageTour.resetButton')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
