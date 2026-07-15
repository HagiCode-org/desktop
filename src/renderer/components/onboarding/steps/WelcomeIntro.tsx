import { useTranslation } from 'react-i18next';
import { Rocket, CheckCircle2, Download, Zap } from 'lucide-react';
import { Button } from '../../ui/button';
import { OnboardingStep } from '../../../../types/onboarding';

interface WelcomeIntroProps {
  onNext: () => void;
  onSkip?: () => void;
  stepSequence: OnboardingStep[];
}

function getWelcomeStepTranslationKey(step: OnboardingStep) {
  switch (step) {
    case OnboardingStep.LanguageSelection:
      return 'welcome.steps.languageSelection';
    case OnboardingStep.Welcome:
      return 'welcome.steps.welcome';
    case OnboardingStep.LegalConsent:
      return 'welcome.steps.legalConsent';
    case OnboardingStep.SharingAcceleration:
      return 'welcome.steps.sharingAcceleration';
    case OnboardingStep.DependencyPreparation:
      return 'welcome.steps.dependencyPreparation';
    case OnboardingStep.Download:
      return 'welcome.steps.download';
    default:
      return 'welcome.steps.welcome';
  }
}

function WelcomeIntro({ onNext, onSkip, stepSequence }: WelcomeIntroProps) {
  const { t } = useTranslation('onboarding');

  const features = [
    {
      icon: CheckCircle2,
      title: t('welcome.features.manage.title'),
      description: t('welcome.features.manage.description'),
    },
    {
      icon: Zap,
      title: t('welcome.features.monitor.title'),
      description: t('welcome.features.monitor.description'),
    },
    {
      icon: Download,
      title: t('welcome.features.dependencies.title'),
      description: t('welcome.features.dependencies.description'),
    },
  ];

  const steps = stepSequence.map((step, index) => ({
    number: index + 1,
    text: t(getWelcomeStepTranslationKey(step)),
  }));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-2xl border bg-muted/20 p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Rocket className="h-7 w-7" />
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-semibold tracking-tight">{t('welcome.title')}</h2>
              <p className="max-w-2xl text-sm text-muted-foreground md:text-base">
                {t('welcome.description', { count: steps.length })}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-6 sm:p-7">
          <h3 className="text-sm font-medium text-muted-foreground">{t('welcome.processTitle', { count: steps.length })}</h3>
          <div className="mt-4 space-y-3">
            {steps.map((step) => (
              <div key={step.number} className="flex items-start gap-3 rounded-xl border bg-muted/20 px-4 py-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                  {step.number}
                </div>
                <span className="pt-0.5 text-sm text-foreground">{step.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="rounded-xl border bg-card p-5"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <feature.icon className="h-5 w-5" />
            </div>
            <div className="mt-4 space-y-2">
              <h3 className="font-semibold">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center gap-3 pt-4">
        {onSkip && (
          <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
            {t('welcome.skip')}
          </Button>
        )}
        <Button onClick={onNext} size="lg" className="min-w-44 gap-2 justify-center">
          {t('welcome.start')}
          <Rocket className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default WelcomeIntro;
