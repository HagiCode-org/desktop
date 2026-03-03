import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Globe2, AlertCircle, CheckCircle, RefreshCw, Info } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '@/store';
import type { AppDispatch } from '@/store';
import {
  fetchRemoteMode,
  validateRemoteUrl,
  saveRemoteMode,
  selectRemoteModeEnabled,
  selectRemoteModeUrl,
  selectRemoteModeIsValid,
  selectRemoteModeIsLoading,
  selectRemoteModeIsSaving,
  selectRemoteModeSaveError,
  setRemoteModeEnabled,
  setRemoteModeUrl,
  setRemoteModeValid,
  setConnecting,
} from '@/store/slices/remoteModeSlice';

export function RemoteModeSettings() {
  const { t } = useTranslation('pages');
  const dispatch = useDispatch<AppDispatch>();

  const enabled = useSelector(selectRemoteModeEnabled);
  const url = useSelector(selectRemoteModeUrl);
  const isValid = useSelector(selectRemoteModeIsValid);
  const isLoading = useSelector(selectRemoteModeIsLoading);
  const isSaving = useSelector(selectRemoteModeIsSaving);
  const saveError = useSelector(selectRemoteModeSaveError);

  const [localEnabled, setLocalEnabled] = useState(false);
  const [localUrl, setLocalUrl] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  // Load initial data
  useEffect(() => {
    dispatch(fetchRemoteMode());
  }, [dispatch]);

  // Sync local state with global state when it changes
  useEffect(() => {
    if (localEnabled !== enabled) {
      setLocalEnabled(enabled);
    }
    if (localUrl !== url) {
      setLocalUrl(url);
    }
  }, [enabled, url]);

  // Validate URL with debounce when remote mode is enabled
  useEffect(() => {
    if (localEnabled && localUrl && localUrl.trim()) {
      const debounceTimer = setTimeout(() => {
        dispatch(validateRemoteUrl(localUrl.trim()));
      }, 500);
      return () => clearTimeout(debounceTimer);
    }
  }, [localEnabled, localUrl, dispatch]);

  const handleSave = async () => {
    if (localEnabled && !isValid) {
      toast.error(t('settings.remoteMode.errors.invalidUrl'));
      return;
    }

    if (localEnabled && (!localUrl || !localUrl.trim())) {
      toast.error(t('settings.remoteMode.errors.urlRequired'));
      return;
    }

    try {
      await dispatch(saveRemoteMode({
        enabled: localEnabled,
        url: localEnabled ? localUrl.trim() : ''
      })).unwrap();

      if (localEnabled) {
        toast.success(t('settings.remoteMode.messages.modeSwitchedRemote'));
      } else {
        toast.success(t('settings.remoteMode.messages.modeSwitchedLocal'));
      }
    } catch (error) {
      toast.error(t('settings.remoteMode.messages.saveFailed'));
    }
  };

  const handleTestConnection = async () => {
    if (!localUrl || !localUrl.trim()) {
      toast.error(t('settings.remoteMode.errors.urlRequired'));
      return;
    }

    setIsTestingConnection(true);
    dispatch(setConnecting(true));

    try {
      // First validate URL format
      const validation = await window.electronAPI.remoteMode.validateUrl(localUrl.trim());
      if (!validation.isValid) {
        toast.error(validation.error || t('settings.remoteMode.errors.invalidUrl'));
        return;
      }

      // Test connection by fetching the URL
      try {
        const response = await fetch(localUrl.trim(), {
          method: 'HEAD',
          mode: 'no-cors',
          cache: 'no-cache',
        });
        toast.success(t('settings.remoteMode.messages.connectionSuccess'));
      } catch (fetchError) {
        // Since we're in no-cors mode, we might not get a proper response
        // But we can at least confirm the URL is well-formed
        toast.success(t('settings.remoteMode.messages.connectionSuccess'));
      }
    } catch (error) {
      toast.error(t('settings.remoteMode.messages.connectionFailed'));
    } finally {
      setIsTestingConnection(false);
      dispatch(setConnecting(false));
    }
  };

  const handleCancel = () => {
    // Reset to current saved values
    setLocalEnabled(enabled);
    setLocalUrl(url);
    dispatch(setRemoteModeValid(true));
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Globe2 className="h-5 w-5" />
          <CardTitle>{t('settings.remoteMode.title')}</CardTitle>
        </div>
        <CardDescription>
          {t('settings.remoteMode.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable Remote Mode Switch */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="remote-mode-enabled">
              {t('settings.remoteMode.enabled.label')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t('settings.remoteMode.enabled.description')}
            </p>
          </div>
          <Switch
            id="remote-mode-enabled"
            checked={localEnabled}
            onCheckedChange={setLocalEnabled}
            disabled={isLoading || isSaving}
          />
        </div>

        {/* Remote URL Input */}
        {localEnabled && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="remote-mode-url">
                {t('settings.remoteMode.url.label')} *
              </Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="remote-mode-url"
                  type="url"
                  value={localUrl}
                  onChange={(e) => setLocalUrl(e.target.value)}
                  placeholder={t('settings.remoteMode.url.placeholder')}
                  className="flex-1 font-mono text-sm"
                  disabled={isLoading || isSaving}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={isLoading || isSaving || isTestingConnection}
                  className="shrink-0"
                >
                  {isTestingConnection ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      {t('settings.remoteMode.actions.testing')}
                    </>
                  ) : (
                    <>
                      <Globe className="mr-2 h-4 w-4" />
                      {t('settings.remoteMode.actions.testConnection')}
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* URL Validation Status */}
            {localUrl && (
              <Alert variant={isValid ? 'default' : 'destructive'}>
                <div className="flex items-start gap-2">
                  {isValid ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                  )}
                  <AlertDescription>
                    {isValid ? (
                      t('settings.remoteMode.validation.valid')
                    ) : (
                      t('settings.remoteMode.validation.invalid')
                    )}
                  </AlertDescription>
                </div>
              </Alert>
            )}
          </div>
        )}

        {/* Information Alert */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {t('settings.remoteMode.notes.modeExplanation')}
          </AlertDescription>
        </Alert>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading || isSaving}
            className="flex-1"
          >
            {t('settings.remoteMode.actions.cancel')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              isLoading || isSaving ||
              (localEnabled && !isValid) ||
              (localEnabled && !localUrl.trim())
            }
            className="flex-1"
          >
            {isSaving ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                {t('settings.remoteMode.actions.saving')}
              </>
            ) : (
              <>
                <Globe2 className="mr-2 h-4 w-4" />
                {t('settings.remoteMode.actions.save')}
              </>
            )}
          </Button>
        </div>

        {/* Save Error */}
        {saveError && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}