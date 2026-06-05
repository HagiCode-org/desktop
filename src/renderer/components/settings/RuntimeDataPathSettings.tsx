import { useEffect, useState } from 'react';
import { AlertTriangle, HardDrive, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type {
  RuntimeDataPathBridge,
  RuntimeDataPathPreset,
  RuntimeDataPathSaveResult,
  RuntimeDataPathSettingsSnapshot,
} from '../../../types/runtime-data-path.js';

const runtimeDataPathOptions: readonly RuntimeDataPathPreset[] = [
  'userData-runtime-data',
  'home-runtime-data',
];

function getRuntimeDataPathBridge(): RuntimeDataPathBridge {
  return (window as Window & {
    electronAPI: {
      runtimeDataPath: RuntimeDataPathBridge;
    };
  }).electronAPI.runtimeDataPath;
}

export function RuntimeDataPathSettings() {
  const { t } = useTranslation('pages');
  const [settings, setSettings] = useState<RuntimeDataPathSettingsSnapshot | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<RuntimeDataPathPreset>('userData-runtime-data');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaveResult, setLastSaveResult] = useState<RuntimeDataPathSaveResult | null>(null);

  useEffect(() => {
    let disposed = false;

    void getRuntimeDataPathBridge()
      .getSettings()
      .then((snapshot) => {
        if (!disposed) {
          setSettings(snapshot);
          setSelectedPreset(snapshot.configuredPreset);
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
      const result = await getRuntimeDataPathBridge().setPreset(selectedPreset);
      setSettings(result.settings);
      setSelectedPreset(result.settings.configuredPreset);
      setLastSaveResult(result);

      if (result.status === 'unchanged') {
        toast.success(t('settings.runtimeDataPath.messages.unchanged'));
      } else if (result.status === 'restarted' && result.restartCompleted) {
        toast.success(t('settings.runtimeDataPath.messages.restartSuccess'));
      } else if (result.status === 'restarted') {
        toast.success(t('settings.runtimeDataPath.messages.saveSuccess'));
      } else {
        toast.error(t('settings.runtimeDataPath.messages.saveFailed'));
        setError(result.error ?? t('settings.runtimeDataPath.messages.saveFailed'));
      }
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(message);
      toast.error(t('settings.runtimeDataPath.messages.saveFailed'));
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
    setSelectedPreset(settings.configuredPreset);
  };

  const configuredPreset = settings?.configuredPreset ?? selectedPreset;
  const isLocked = settings?.lockedByRuntime ?? false;
  const controlDisabled = !settings || isSaving || isLocked;
  const hasPendingChanges = settings ? selectedPreset !== settings.configuredPreset : false;
  const activePreset = settings?.effectivePreset ?? configuredPreset;
  const activePresetLabel = t(`settings.runtimeDataPath.options.${activePreset}.label`);

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <HardDrive className="h-5 w-5" />
          <CardTitle>{t('settings.runtimeDataPath.title')}</CardTitle>
        </div>
        <CardDescription>{t('settings.runtimeDataPath.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Badge variant="default">
            {t('settings.runtimeDataPath.activePreset', { preset: activePresetLabel })}
          </Badge>
          {settings?.environmentOverrideActive ? (
            <Badge variant="secondary">
              {t('settings.runtimeDataPath.environmentOverrideBadge')}
            </Badge>
          ) : null}
          {isLocked ? (
            <Badge variant="secondary">
              <Lock className="mr-1 h-3 w-3" />
              {t('settings.runtimeDataPath.lockedByRuntime')}
            </Badge>
          ) : null}
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          <p>{t('settings.runtimeDataPath.paths.configuredRoot', { path: settings?.configuredRootPath ?? '—' })}</p>
          <p>{t('settings.runtimeDataPath.paths.effectiveRoot', { path: settings?.effectiveRootPath ?? '—' })}</p>
          {settings?.environmentOverrideActive && settings.environmentOverrideRoot ? (
            <p>{t('settings.runtimeDataPath.paths.environmentOverride', { path: settings.environmentOverrideRoot })}</p>
          ) : null}
        </div>

        <RadioGroup
          value={selectedPreset}
          onValueChange={(value) => setSelectedPreset(value as RuntimeDataPathPreset)}
          disabled={controlDisabled}
          className="gap-3"
        >
          {runtimeDataPathOptions.map((preset) => (
            <Label
              key={preset}
              htmlFor={`runtime-data-path-${preset}`}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/20 p-4"
            >
              <RadioGroupItem value={preset} id={`runtime-data-path-${preset}`} className="mt-1" />
              <div className="space-y-1">
                <div className="font-medium">{t(`settings.runtimeDataPath.options.${preset}.label`)}</div>
                <p className="text-sm text-muted-foreground">
                  {t(`settings.runtimeDataPath.options.${preset}.description`)}
                </p>
              </div>
            </Label>
          ))}
        </RadioGroup>

        {isLocked && settings?.readOnlyReason ? (
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            {settings.readOnlyReason}
          </div>
        ) : (
          <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-950 dark:text-amber-100">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="space-y-1">
                <p>{t('settings.runtimeDataPath.warnings.noMigration')}</p>
                <p>{t('settings.runtimeDataPath.warnings.restart')}</p>
              </div>
            </div>
          </div>
        )}

        {lastSaveResult && lastSaveResult.status === 'restarted' && !lastSaveResult.restartCompleted ? (
          <p className="text-sm text-muted-foreground">
            {t('settings.runtimeDataPath.messages.saveSuccess')}
          </p>
        ) : null}

        {error ? (
          <p className="text-sm text-destructive">
            {t('settings.runtimeDataPath.errors.saveErrorDetail', { error })}
          </p>
        ) : null}

        {!isLocked ? (
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={handleReset} disabled={controlDisabled || !hasPendingChanges}>
              {t('settings.runtimeDataPath.actions.cancel')}
            </Button>
            <Button type="button" onClick={() => void handleSave()} disabled={controlDisabled || !hasPendingChanges}>
              {isSaving ? t('settings.runtimeDataPath.actions.saving') : t('settings.runtimeDataPath.actions.save')}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
