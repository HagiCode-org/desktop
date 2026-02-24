import { useTranslation } from 'react-i18next';
import { Rocket, CheckCircle2, Download, Zap } from 'lucide-react';
import { Button } from '../../ui/button';

interface WelcomeIntroProps {
  onNext: () => void;
  onSkip: () => void;
}

function WelcomeIntro({ onNext, onSkip }: WelcomeIntroProps) {
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

  const steps = [
    { number: 1, text: t('welcome.steps.claude') },
    { number: 2, text: t('welcome.steps.download') },
    { number: 3, text: t('welcome.steps.launch') },
  ];

  return (
    <div className="space-y-8">
      {/* Hero section */}
      <div className="text-center space-y-4">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-primary/10 rounded-full">
            <Rocket className="h-12 w-12 text-primary" />
          </div>
        </div>
        <h2 className="text-3xl font-bold">{t('welcome.title')}</h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          {t('welcome.description')}
        </p>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {features.map((feature, index) => (
          <div
            key={index}
            className="flex flex-col items-center text-center space-y-3 p-4 rounded-lg bg-muted/30"
          >
            <feature.icon className="h-8 w-8 text-primary" />
            <h3 className="font-semibold">{feature.title}</h3>
            <p className="text-sm text-muted-foreground">{feature.description}</p>
          </div>
        ))}
      </div>

      {/* Installation process overview */}
      <div className="bg-muted/20 rounded-lg p-6 space-y-4">
        <h3 className="font-semibold text-center">{t('welcome.processTitle')}</h3>
        <div className="space-y-3 max-w-md mx-auto">
          {steps.map((step) => (
            <div key={step.number} className="flex items-center gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center font-medium">
                {step.number}
              </div>
              <span className="text-sm">{step.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CTA buttons */}
      <div className="flex justify-center gap-3 pt-4">
        <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
          {t('welcome.skip')}
        </Button>
        <Button onClick={onNext} size="lg" className="gap-2">
          {t('welcome.start')}
          <Rocket className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export default WelcomeIntro;
