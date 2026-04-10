import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BellRing } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '@/store';
import {
  clearVersionUpdateSaveError,
  fetchVersionAutoUpdateSettings,
  saveVersionAutoUpdateSettings,
  selectVersionAutoUpdateSettings,
  selectVersionUpdateSaveError,
  selectVersionUpdateSaving,
  selectVersionUpdateSettingsLoading,
} from '@/store/slices/versionUpdateSlice';

export function VersionUpdateSettings() {
  const { t } = useTranslation('pages');
  const dispatch = useDispatch<AppDispatch>();
  const settings = useSelector((state: RootState) => selectVersionAutoUpdateSettings(state));
  const isLoading = useSelector((state: RootState) => selectVersionUpdateSettingsLoading(state));
  const isSaving = useSelector((state: RootState) => selectVersionUpdateSaving(state));
  const saveError = useSelector((state: RootState) => selectVersionUpdateSaveError(state));
  const [localEnabled, setLocalEnabled] = useState(settings.enabled);
  const [localRetainedArchiveCount, setLocalRetainedArchiveCount] = useState(String(settings.retainedArchiveCount));

  useEffect(() => {
    void dispatch(fetchVersionAutoUpdateSettings());
  }, [dispatch]);

  useEffect(() => {
    setLocalEnabled(settings.enabled);
    setLocalRetainedArchiveCount(String(settings.retainedArchiveCount));
  }, [settings.enabled, settings.retainedArchiveCount]);

  const validationMessage = useMemo(() => {
    const parsed = Number.parseInt(localRetainedArchiveCount, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return t('settings.updates.errors.retainedArchiveCountPositive');
    }

    return null;
  }, [localRetainedArchiveCount, t]);

  const handleSave = async () => {
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    try {
      await dispatch(saveVersionAutoUpdateSettings({
        enabled: localEnabled,
        retainedArchiveCount: Number.parseInt(localRetainedArchiveCount, 10),
      })).unwrap();
      dispatch(clearVersionUpdateSaveError());
      toast.success(t('settings.updates.messages.saveSuccess'));
    } catch (error) {
      toast.error(t('settings.updates.messages.saveFailed'));
    }
  };

  const handleReset = () => {
    dispatch(clearVersionUpdateSaveError());
    setLocalEnabled(settings.enabled);
    setLocalRetainedArchiveCount(String(settings.retainedArchiveCount));
  };

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <BellRing className="h-5 w-5" />
          <CardTitle>{t('settings.updates.title')}</CardTitle>
        </div>
        <CardDescription>{t('settings.updates.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-medium text-foreground">{t('settings.updates.enabled.label')}</h3>
              <p className="text-sm text-muted-foreground">{t('settings.updates.enabled.description')}</p>
            </div>
            <Switch
              checked={localEnabled}
              onCheckedChange={setLocalEnabled}
              disabled={isLoading || isSaving}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="retained-archive-count">{t('settings.updates.retainedArchiveCount.label')}</Label>
          <Input
            id="retained-archive-count"
            type="number"
            min={1}
            value={localRetainedArchiveCount}
            onChange={(event) => setLocalRetainedArchiveCount(event.target.value)}
            disabled={isLoading || isSaving}
          />
          <p className="text-sm text-muted-foreground">{t('settings.updates.retainedArchiveCount.description')}</p>
          {validationMessage ? (
            <p className="text-sm text-destructive">{validationMessage}</p>
          ) : null}
          {saveError ? (
            <p className="text-sm text-destructive">{t('settings.updates.errors.saveErrorDetail', { error: saveError })}</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-border bg-background p-4 text-sm text-muted-foreground">
          <p>{t('settings.updates.notes.snapshotModel')}</p>
          <p className="mt-1">{t('settings.updates.notes.retentionPolicy')}</p>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={handleReset} disabled={isLoading || isSaving}>
            {t('settings.updates.actions.cancel')}
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={Boolean(validationMessage) || isLoading || isSaving}>
            {isSaving ? t('settings.updates.actions.saving') : t('settings.updates.actions.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
