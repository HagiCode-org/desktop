import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Globe,
  Info,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type {
  ManagedWebTelemetryBridge,
  ManagedWebTelemetryPayload,
  ManagedWebTelemetrySettings,
  ManagedWebTelemetryWarning,
} from '../../../types/telemetry';

const DEFAULT_SETTINGS: ManagedWebTelemetrySettings = {
  enabled: true,
  enableTracing: true,
  enableMetrics: true,
  endpoint: '',
};

function normalizeEndpoint(value: string): string {
  return value.trim();
}

function getTelemetryBridge(): ManagedWebTelemetryBridge {
  return (window as Window & {
    electronAPI: { telemetry: ManagedWebTelemetryBridge };
  }).electronAPI.telemetry;
}

function createPartialWarning(payload: ManagedWebTelemetryPayload | null): ManagedWebTelemetryWarning | null {
  if (!payload || payload.status.state !== 'partial' || payload.status.unsyncedVersionIds.length === 0) {
    return null;
  }

  return {
    code: 'partial-sync',
    failedVersionIds: payload.status.unsyncedVersionIds,
  };
}

export function TelemetrySettings() {
  const { t } = useTranslation('pages');
  const [savedSettings, setSavedSettings] = useState<ManagedWebTelemetrySettings>(DEFAULT_SETTINGS);
  const [draftSettings, setDraftSettings] = useState<ManagedWebTelemetrySettings>(DEFAULT_SETTINGS);
  const [payload, setPayload] = useState<ManagedWebTelemetryPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<ManagedWebTelemetryWarning | null>(null);

  const currentWarning = saveWarning ?? createPartialWarning(payload);
  const isDirty = useMemo(() => (
    draftSettings.enabled !== savedSettings.enabled
    || draftSettings.enableTracing !== savedSettings.enableTracing
    || draftSettings.enableMetrics !== savedSettings.enableMetrics
    || normalizeEndpoint(draftSettings.endpoint) !== normalizeEndpoint(savedSettings.endpoint)
  ), [draftSettings, savedSettings]);

  const loadTelemetrySettings = async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const nextPayload = await getTelemetryBridge().get();
      setPayload(nextPayload);
      setSavedSettings(nextPayload.settings);
      setDraftSettings(nextPayload.settings);
      setSaveWarning(nextPayload.warning);
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : String(error);
      setLoadError(nextMessage);
      toast.error(t('settings.telemetry.messages.loadFailed', { error: nextMessage }));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadTelemetrySettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const nextPayload = await getTelemetryBridge().set({
        ...draftSettings,
        endpoint: normalizeEndpoint(draftSettings.endpoint),
      });
      setPayload(nextPayload);
      setSavedSettings(nextPayload.settings);
      setDraftSettings(nextPayload.settings);
      setSaveWarning(nextPayload.warning);

      if (nextPayload.warning) {
        toast(t('settings.telemetry.messages.saveWarning', {
          count: nextPayload.warning.failedVersionIds.length,
        }));
      } else {
        toast.success(t('settings.telemetry.messages.saveSuccess'));
      }
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : String(error);
      toast.error(t('settings.telemetry.messages.saveFailed', { error: nextMessage }));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setDraftSettings(savedSettings);
    setSaveWarning(payload?.warning ?? null);
  };

  const syncStatusLabel = useMemo(() => {
    if (!payload) {
      return t('settings.telemetry.summary.scopePending');
    }

    switch (payload.status.state) {
      case 'synced':
        return t('settings.telemetry.summary.scopeSynced', {
          count: payload.status.syncedVersionIds.length,
        });
      case 'partial':
        return t('settings.telemetry.summary.scopePartial', {
          synced: payload.status.syncedVersionIds.length,
          total: payload.status.installedVersionIds.length,
        });
      default:
        return t('settings.telemetry.summary.scopeLocalOnly');
    }
  }, [payload, t]);

  const badgeLabel = useMemo(() => {
    switch (payload?.status.state) {
      case 'synced':
        return t('settings.telemetry.status.badges.synced');
      case 'partial':
        return t('settings.telemetry.status.badges.partial');
      default:
        return t('settings.telemetry.status.badges.localOnly');
    }
  }, [payload?.status.state, t]);

  const badgeVariant = payload?.status.state === 'partial'
    ? 'destructive'
    : payload?.status.state === 'synced'
      ? 'default'
      : 'secondary';

  return (
    <Card className="max-w-4xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          <CardTitle>{t('settings.telemetry.title')}</CardTitle>
        </div>
        <CardDescription>{t('settings.telemetry.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loadError ? (
          <Alert variant="destructive">
            <TriangleAlert className="h-4 w-4" />
            <AlertTitle>{t('settings.telemetry.errors.loadTitle')}</AlertTitle>
            <AlertDescription>{t('settings.telemetry.messages.loadFailed', { error: loadError })}</AlertDescription>
          </Alert>
        ) : null}

        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="font-medium text-foreground">{t('settings.telemetry.summary.title')}</h3>
                <Badge variant={badgeVariant}>{badgeLabel}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{syncStatusLabel}</p>
            </div>
            <div className="text-sm text-muted-foreground md:text-right">
              {draftSettings.enabled
                ? t('settings.telemetry.status.current.enabled')
                : t('settings.telemetry.status.current.disabled')}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('settings.telemetry.summary.stateLabel')}
              </p>
              <p className="mt-1 font-medium text-foreground">
                {draftSettings.enabled
                  ? t('settings.telemetry.status.current.enabled')
                  : t('settings.telemetry.status.current.disabled')}
              </p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('settings.telemetry.summary.appliesToLabel')}
              </p>
              <p className="mt-1 font-medium text-foreground">{syncStatusLabel}</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('settings.telemetry.summary.applyRuleLabel')}
              </p>
              <p className="mt-1 font-medium text-foreground">{t('settings.telemetry.summary.applyRuleValue')}</p>
            </div>
          </div>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>{t('settings.telemetry.notes.applyTitle')}</AlertTitle>
          <AlertDescription>{t('settings.telemetry.notes.applyDescription')}</AlertDescription>
        </Alert>

        {payload?.status.state === 'local-only' ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>{t('settings.telemetry.notes.localOnlyTitle')}</AlertTitle>
            <AlertDescription>{t('settings.telemetry.notes.localOnlyDescription')}</AlertDescription>
          </Alert>
        ) : null}

        {currentWarning ? (
          <Alert variant="destructive">
            <TriangleAlert className="h-4 w-4" />
            <AlertTitle>{t('settings.telemetry.notes.partialTitle')}</AlertTitle>
            <AlertDescription>
              {t('settings.telemetry.notes.partialDescription', {
                count: currentWarning.failedVersionIds.length,
                versions: currentWarning.failedVersionIds.join(', '),
              })}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="rounded-xl border border-border bg-background p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="managed-web-telemetry-enabled" className="text-base font-medium">
                {t('settings.telemetry.enabled.label')}
              </Label>
              <p className="text-sm text-muted-foreground">{t('settings.telemetry.enabled.description')}</p>
            </div>
            <Switch
              id="managed-web-telemetry-enabled"
              checked={draftSettings.enabled}
              onCheckedChange={(checked) => setDraftSettings((current) => ({ ...current, enabled: checked }))}
              disabled={isLoading || isSaving}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="managed-web-telemetry-endpoint">{t('settings.telemetry.endpoint.label')}</Label>
          <Input
            id="managed-web-telemetry-endpoint"
            type="text"
            value={draftSettings.endpoint}
            onChange={(event) => setDraftSettings((current) => ({ ...current, endpoint: event.target.value }))}
            placeholder={t('settings.telemetry.endpoint.placeholder')}
            disabled={isLoading || isSaving}
            className="font-mono text-sm"
          />
          <p className="text-sm text-muted-foreground">{t('settings.telemetry.endpoint.description')}</p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <h3 className="font-medium text-foreground">{t('settings.telemetry.disclosures.enablement.title')}</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('settings.telemetry.disclosures.enablement.description')}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <h3 className="font-medium text-foreground">{t('settings.telemetry.disclosures.endpoint.title')}</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('settings.telemetry.disclosures.endpoint.description')}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <h3 className="font-medium text-foreground">{t('settings.telemetry.disclosures.exclusions.title')}</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('settings.telemetry.disclosures.exclusions.description')}
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={handleCancel} disabled={isLoading || isSaving || !isDirty}>
            {t('settings.telemetry.actions.cancel')}
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={isLoading || isSaving || !isDirty}>
            {isSaving ? t('settings.telemetry.actions.saving') : t('settings.telemetry.actions.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
