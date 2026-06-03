import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gauge } from 'lucide-react';
import { toast } from 'sonner';
import type {
  DependencyManagementBridge,
  DependencyManagementMode,
  DependencyManagementModeSettings as DependencyManagementModeSettingsState,
} from '../../../types/dependency-management.js';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

function getDependencyManagementBridge(): DependencyManagementBridge {
  return (window as Window & {
    electronAPI: {
      dependencyManagement: DependencyManagementBridge;
    };
  }).electronAPI.dependencyManagement;
}

export function DependencyManagementModeSettings() {
  const { t } = useTranslation('pages');
  const [settings, setSettings] = useState<DependencyManagementModeSettingsState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    void getDependencyManagementBridge()
      .getModeSettings()
      .then((nextSettings) => {
        if (!disposed) {
          setSettings(nextSettings);
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

  const handleValueChange = async (value: string) => {
    if (!settings || settings.lockedByRuntime || isSaving) {
      return;
    }

    const nextMode = value as DependencyManagementMode;
    if (nextMode === settings.configuredMode) {
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const snapshot = await getDependencyManagementBridge().setMode(nextMode);
      setSettings(snapshot.mode);
      toast.success(t('settings.dependencyManagementMode.messages.saveSuccess'));
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : String(saveError);
      setError(message);
      toast.error(t('settings.dependencyManagementMode.messages.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const configuredMode = settings?.configuredMode ?? 'internal';
  const effectiveMode = settings?.effectiveMode ?? configuredMode;
  const controlDisabled = !settings || settings.lockedByRuntime || isSaving;

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5" />
          <CardTitle>{t('settings.dependencyManagementMode.title')}</CardTitle>
        </div>
        <CardDescription>{t('settings.dependencyManagementMode.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Badge variant={effectiveMode === 'internal' ? 'default' : 'secondary'}>
            {t('settings.dependencyManagementMode.effectiveMode', {
              mode: t(`settings.dependencyManagementMode.options.${effectiveMode}.label`),
            })}
          </Badge>
          {settings?.lockedByRuntime ? (
            <Badge variant="secondary">{t('settings.dependencyManagementMode.lockedBadge')}</Badge>
          ) : null}
        </div>

        <RadioGroup
          value={configuredMode}
          onValueChange={(value) => void handleValueChange(value)}
          disabled={controlDisabled}
          className="gap-3"
        >
          {(['internal', 'external'] as const).map((mode) => (
            <Label
              key={mode}
              htmlFor={`dependency-management-mode-${mode}`}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-muted/20 p-4"
            >
              <RadioGroupItem value={mode} id={`dependency-management-mode-${mode}`} className="mt-1" />
              <div className="space-y-1">
                <div className="font-medium">{t(`settings.dependencyManagementMode.options.${mode}.label`)}</div>
                <p className="text-sm text-muted-foreground">
                  {t(`settings.dependencyManagementMode.options.${mode}.description`)}
                </p>
              </div>
            </Label>
          ))}
        </RadioGroup>

        {settings?.readOnlyReason ? (
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            {settings.lockedByRuntime
              ? t('settings.dependencyManagementMode.lockedHint')
              : settings.readOnlyReason}
          </div>
        ) : null}

        {error ? (
          <p className="text-sm text-destructive">
            {t('settings.dependencyManagementMode.errors.saveErrorDetail', { error })}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
