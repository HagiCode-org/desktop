import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

export function DebugSettings() {
  const { t } = useTranslation('pages');
  const [ignoreDependencyCheck, setIgnoreDependencyCheck] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load initial debug mode state
  useEffect(() => {
    const loadDebugMode = async () => {
      try {
        const mode = await window.electronAPI.getDebugMode();
        setIgnoreDependencyCheck(mode.ignoreDependencyCheck);
      } catch (error) {
        console.error('Failed to load debug mode:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadDebugMode();

    // Listen for debug mode changes from other windows/processes
    const unsubscribe = window.electronAPI.onDebugModeChanged((mode) => {
      setIgnoreDependencyCheck(mode.ignoreDependencyCheck);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const handleToggleIgnoreDependencyCheck = async (checked: boolean) => {
    try {
      const result = await window.electronAPI.setDebugMode({ ignoreDependencyCheck: checked });
      if (result.success) {
        setIgnoreDependencyCheck(checked);
        toast.success(checked
          ? t('settings.debug.ignoreDependencyCheckEnabled')
          : t('settings.debug.ignoreDependencyCheckDisabled')
        );
      } else {
        toast.error(t('settings.debug.toggleError', { error: result.error }));
      }
    } catch (error) {
      toast.error(t('settings.debug.toggleError', { error: String(error) }));
    }
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t('settings.debug.title')}</CardTitle>
        <CardDescription>
          {t('settings.debug.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="ignore-dependency-check" className="text-base">
              {t('settings.debug.ignoreDependencyCheck')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t('settings.debug.ignoreDependencyCheckDescription')}
            </p>
          </div>
          <Switch
            id="ignore-dependency-check"
            checked={ignoreDependencyCheck}
            onCheckedChange={handleToggleIgnoreDependencyCheck}
            disabled={isLoading}
          />
        </div>
      </CardContent>
    </Card>
  );
}
