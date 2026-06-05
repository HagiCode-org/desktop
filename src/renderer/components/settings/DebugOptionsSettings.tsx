import { useEffect, useState } from 'react';
import { Bug } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  const [usePsfForManagedServer, setUsePsfForManagedServer] = useState(false);
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
          setUsePsfForManagedServer(snapshot.usePsfForManagedServer);
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
        usePsfForManagedServer,
      });
      setSettings(result.settings);
      setUsePsfForManagedServer(result.settings.usePsfForManagedServer);
      setLastSaveResult(result);

      if (result.status === 'unchanged') {
        toast.success(t('settings.debugOptions.messages.unchanged'));
      } else if (result.status === 'saved' && result.restartCompleted) {
        toast.success(t('settings.debugOptions.messages.restartSuccess'));
      } else if (result.status === 'saved') {
        toast.success(t('settings.debugOptions.messages.saveSuccess'));
      } else {
        toast.error(t('settings.debugOptions.messages.saveFailed'));
        setError(result.error ?? t('settings.debugOptions.messages.saveFailed'));
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
    if (!settings) {
      return;
    }

    setError(null);
    setLastSaveResult(null);
    setUsePsfForManagedServer(settings.usePsfForManagedServer);
  };

  const controlDisabled = !settings || isSaving || !settings.windowsStoreRuntime;
  const hasPendingChanges = settings ? usePsfForManagedServer !== settings.usePsfForManagedServer : false;

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
        <div className="flex flex-wrap gap-2">
          <Badge variant={settings?.windowsStoreRuntime ? 'default' : 'secondary'}>
            {settings?.windowsStoreRuntime
              ? t('settings.debugOptions.runtime.windowsStore')
              : t('settings.debugOptions.runtime.standard')}
          </Badge>
          {settings?.managedServerLauncherPath ? (
            <Badge variant="secondary">{t('settings.debugOptions.runtime.launcherReady')}</Badge>
          ) : null}
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          <p>
            {t('settings.debugOptions.launcherPath', {
              path: settings?.managedServerLauncherPath ?? '—',
            })}
          </p>
          <p>{t('settings.debugOptions.runtimeHint')}</p>
        </div>

        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-medium text-foreground">
                {t('settings.debugOptions.usePsfForManagedServer.label')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t('settings.debugOptions.usePsfForManagedServer.description')}
              </p>
            </div>
            <Switch
              checked={usePsfForManagedServer}
              onCheckedChange={setUsePsfForManagedServer}
              disabled={controlDisabled}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground">
          <p>{t('settings.debugOptions.notes.scope')}</p>
          <p className="mt-1">
            {settings?.windowsStoreRuntime
              ? t('settings.debugOptions.notes.restart')
              : t('settings.debugOptions.notes.unavailable')}
          </p>
        </div>

        {lastSaveResult && lastSaveResult.status === 'saved' && !lastSaveResult.restartCompleted ? (
          <p className="text-sm text-muted-foreground">
            {t('settings.debugOptions.messages.saveSuccess')}
          </p>
        ) : null}

        {error ? (
          <p className="text-sm text-destructive">
            {t('settings.debugOptions.errors.saveErrorDetail', { error })}
          </p>
        ) : null}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={handleReset} disabled={isSaving || !hasPendingChanges}>
            {t('settings.debugOptions.actions.cancel')}
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={controlDisabled || !hasPendingChanges}>
            {isSaving ? t('settings.debugOptions.actions.saving') : t('settings.debugOptions.actions.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
