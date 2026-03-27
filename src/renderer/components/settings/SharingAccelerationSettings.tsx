import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import type { DistributionMode } from '../../../types/distribution-mode';

interface SharingAccelerationFormState {
  enabled: boolean;
  uploadLimitMbps: number;
  cacheLimitGb: number;
  retentionDays: number;
}

const defaultState: SharingAccelerationFormState = {
  enabled: true,
  uploadLimitMbps: 2,
  cacheLimitGb: 10,
  retentionDays: 7,
};

interface SharingAccelerationSettingsProps {
  distributionMode?: DistributionMode;
}

export function SharingAccelerationSettings({ distributionMode = 'normal' }: SharingAccelerationSettingsProps) {
  const { t } = useTranslation('pages');
  const [state, setState] = useState<SharingAccelerationFormState>(defaultState);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const isPortableMode = distributionMode === 'steam';

  useEffect(() => {
    void (async () => {
      try {
        const settings = await window.electronAPI.sharingAcceleration.get();
        if (settings) {
          setState({
            enabled: settings.enabled,
            uploadLimitMbps: settings.uploadLimitMbps,
            cacheLimitGb: settings.cacheLimitGb,
            retentionDays: settings.retentionDays,
          });
        }
      } catch (error) {
        toast.error(t('settings.sharingAcceleration.loadError'));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  const updateNumber = (key: 'uploadLimitMbps' | 'cacheLimitGb' | 'retentionDays', value: string) => {
    setState((previous) => ({
      ...previous,
      [key]: Number.parseInt(value || '0', 10) || 0,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electronAPI.sharingAcceleration.set(state);
      toast.success(t('settings.sharingAcceleration.saveSuccess'));
    } catch (error) {
      toast.error(t('settings.sharingAcceleration.saveError'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>{t('settings.sharingAcceleration.title')}</CardTitle>
        <CardDescription>{t('settings.sharingAcceleration.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-medium text-foreground">{t('settings.sharingAcceleration.enabledTitle')}</h3>
              <p className="text-sm text-muted-foreground">{t('settings.sharingAcceleration.enabledDescription')}</p>
            </div>
            <Switch
              checked={state.enabled}
              onCheckedChange={(checked) => setState((previous) => ({ ...previous, enabled: checked }))}
              disabled={loading || saving || isPortableMode}
            />
          </div>
        </div>

        {isPortableMode ? (
          <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-foreground">
            {t('settings.sharingAcceleration.portableModeHint')}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="upload-limit">{t('settings.sharingAcceleration.uploadLimit')}</Label>
            <Input
              id="upload-limit"
              type="number"
              min={1}
              value={state.uploadLimitMbps}
              onChange={(event) => updateNumber('uploadLimitMbps', event.target.value)}
              disabled={loading || saving || isPortableMode}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cache-limit">{t('settings.sharingAcceleration.cacheLimit')}</Label>
            <Input
              id="cache-limit"
              type="number"
              min={1}
              value={state.cacheLimitGb}
              onChange={(event) => updateNumber('cacheLimitGb', event.target.value)}
              disabled={loading || saving || isPortableMode}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="retention-days">{t('settings.sharingAcceleration.retentionDays')}</Label>
            <Input
              id="retention-days"
              type="number"
              min={1}
              value={state.retentionDays}
              onChange={(event) => updateNumber('retentionDays', event.target.value)}
              disabled={loading || saving || isPortableMode}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground">
          <p>{t('settings.sharingAcceleration.thresholdHint')}</p>
          <p className="mt-1">{t('settings.sharingAcceleration.networkHint')}</p>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={loading || saving || isPortableMode}>
            {saving ? t('settings.sharingAcceleration.saving') : t('settings.sharingAcceleration.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
