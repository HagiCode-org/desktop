import { useEffect, useState } from 'react';
import { Bug } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type {
  DebugOptionsBridge,
  DebugOptionsSaveResult,
  DebugOptionsSettingsSnapshot,
} from '../../../types/debug-options.js';

function getDebugOptionsBridge(): DebugOptionsBridge {
  return (window as Window & {
    electronAPI: {
      debugOptions: DebugOptionsBridge;
    };
  }).electronAPI.debugOptions;
}

export function DebugOptionsSettings() {
  const { t } = useTranslation('pages');
  const [settings, setSettings] = useState<DebugOptionsSettingsSnapshot | null>(null);
  const [useIgnoreScriptsForManagedNpm, setUseIgnoreScriptsForManagedNpm] = useState(false);
  const [msstoreInstallDateRaw, setMsstoreInstallDateRaw] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaveResult, setLastSaveResult] = useState<DebugOptionsSaveResult | null>(null);

  useEffect(() => {
    let disposed = false;

    void getDebugOptionsBridge()
      .getSettings()
      .then((snapshot) => {
        if (!disposed) {
          setSettings(snapshot);
          setUseIgnoreScriptsForManagedNpm(snapshot.useIgnoreScriptsForManagedNpm);
          setMsstoreInstallDateRaw(snapshot.msstoreInstallDateRaw ?? '');
          setError(null);
        }
      })
      .catch((loadError) => {
        if (!disposed) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      });

    return () => {
      disposed = true;
    };
  }, []);

  const handleSave = async () => {
    if (!settings || isSaving) {
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const result = await getDebugOptionsBridge().setSettings({
        useIgnoreScriptsForManagedNpm,
        msstoreInstallDateRaw,
      });
      setSettings(result.settings);
      setUseIgnoreScriptsForManagedNpm(result.settings.useIgnoreScriptsForManagedNpm);
      setMsstoreInstallDateRaw(result.settings.msstoreInstallDateRaw ?? '');
      setLastSaveResult(result);

      if (result.status === 'saved') {
        toast.success(t('settings.debugOptions.messages.saveSuccess'));
      } else if (result.status === 'unchanged') {
        toast.message(t('settings.debugOptions.messages.unchanged'));
      } else {
        const message = result.error || t('settings.debugOptions.messages.saveFailed');
        toast.error(message);
        setError(message);
      }
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(message);
      toast.error(t('settings.debugOptions.messages.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (!settings || isSaving) {
      return;
    }

    setUseIgnoreScriptsForManagedNpm(settings.useIgnoreScriptsForManagedNpm);
    setMsstoreInstallDateRaw(settings.msstoreInstallDateRaw ?? '');
    setError(null);
    setLastSaveResult(null);
  };

  const hasChanges = settings !== null && (
    useIgnoreScriptsForManagedNpm !== settings.useIgnoreScriptsForManagedNpm
    || msstoreInstallDateRaw !== (settings.msstoreInstallDateRaw ?? '')
  );

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bug className="h-5 w-5" />
          <CardTitle>{t('settings.debugOptions.title')}</CardTitle>
        </div>
        <CardDescription>{t('settings.debugOptions.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {settings ? (
          <>
            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
              <div>
                <h4 className="text-sm font-medium">{t('settings.debugOptions.useIgnoreScriptsForManagedNpm.label')}</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('settings.debugOptions.useIgnoreScriptsForManagedNpm.description')}
                </p>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border/50 bg-background px-3 py-2">
                <span className="text-sm">--ignore-scripts</span>
                <Switch
                  checked={useIgnoreScriptsForManagedNpm}
                  onCheckedChange={setUseIgnoreScriptsForManagedNpm}
                  disabled={isSaving || settings === null}
                  aria-label={t('settings.debugOptions.useIgnoreScriptsForManagedNpm.label')}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/30 p-4">
              <div>
                <h4 className="text-sm font-medium">{t('settings.debugOptions.installDate.label')}</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('settings.debugOptions.installDate.description')}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('settings.debugOptions.installDate.ageDays', {
                    value: settings.msstoreInstallAgeDays == null
                      ? t('settings.debugOptions.installDate.ageDaysUnknown')
                      : settings.msstoreInstallAgeDays,
                  })}
                </p>
              </div>
              <Input
                value={msstoreInstallDateRaw}
                onChange={(event) => setMsstoreInstallDateRaw(event.target.value)}
                disabled={isSaving || settings === null}
                placeholder={t('settings.debugOptions.installDate.placeholder')}
              />
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>{t('settings.debugOptions.notes.scope')}</p>
              <p>{t('settings.debugOptions.notes.npm')}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={!hasChanges || isSaving}
              >
                {isSaving ? t('settings.debugOptions.actions.saving') : t('settings.debugOptions.actions.save')}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleReset}
                disabled={!hasChanges || isSaving}
              >
                {t('settings.debugOptions.actions.cancel')}
              </Button>
            </div>

            {lastSaveResult?.status === 'failed' ? (
              <p className="text-sm text-destructive">
                {t('settings.debugOptions.errors.saveErrorDetail', {
                  error: lastSaveResult.error ?? t('settings.debugOptions.messages.saveFailed'),
                })}
              </p>
            ) : null}

            {error ? (
              <p className="text-sm text-destructive">
                {t('settings.debugOptions.errors.saveErrorDetail', { error })}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        )}
      </CardContent>
    </Card>
  );
}
