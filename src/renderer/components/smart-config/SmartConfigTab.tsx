import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Terminal, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';

interface SmartConfigTabProps {
  defaultPromptPath?: string;
}

export function SmartConfigTab({ defaultPromptPath }: SmartConfigTabProps) {
  const { t } = useTranslation('pages');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleStartSmartConfig = async () => {
    setStatus('loading');
    setErrorMessage(null);

    try {
      // Use default prompt path if not provided
      const promptPath = defaultPromptPath || '';

      const result = await window.electronAPI.llmOpenAICliWithPrompt(promptPath);

      if (result.success) {
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMessage(result.error || t('settings.smartConfig.errors.unknown'));
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('settings.smartConfig.errors.unknown');
      setStatus('error');
      setErrorMessage(errorMessage);
    }
  };

  const renderContent = () => {
    switch (status) {
      case 'loading':
        return (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">{t('settings.smartConfig.loading')}</p>
          </div>
        );

      case 'success':
        return (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <p className="text-lg font-medium">{t('settings.smartConfig.success')}</p>
            <p className="text-muted-foreground text-sm">{t('settings.smartConfig.successHint')}</p>
          </div>
        );

      case 'error':
        return (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <p className="text-lg font-medium text-destructive">{t('settings.smartConfig.error')}</p>
            {errorMessage && (
              <p className="text-sm text-muted-foreground max-w-md text-center">{errorMessage}</p>
            )}
            <Button onClick={() => setStatus('idle')} variant="outline">
              {t('settings.smartConfig.retry')}
            </Button>
          </div>
        );

      default:
        return (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Terminal className="h-12 w-12 text-muted-foreground" />
            <p className="text-lg font-medium">{t('settings.smartConfig.title')}</p>
            <p className="text-muted-foreground text-sm max-w-md text-center">
              {t('settings.smartConfig.description')}
            </p>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {renderContent()}

      {status !== 'loading' && (
        <div className="flex justify-center">
          <Button
            onClick={handleStartSmartConfig}
            disabled={status === 'success'}
            className="min-w-48"
            size="lg"
          >
            {status === 'success' ? (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {t('settings.smartConfig.started')}
              </>
            ) : (
              <>
                <Terminal className="mr-2 h-4 w-4" />
                {t('settings.smartConfig.startButton')}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

export default SmartConfigTab;
