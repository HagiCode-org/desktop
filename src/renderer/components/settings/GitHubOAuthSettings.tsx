import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { AlertTriangle, Eye, EyeOff, Github, Info, RotateCcw, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { AppDispatch, RootState } from '@/store';
import {
  clearGitHubOAuthConfig,
  fetchGitHubOAuthConfig,
  resetGitHubOAuthForm,
  saveGitHubOAuthConfig,
  selectGitHubOAuthClientId,
  selectGitHubOAuthClientSecret,
  selectGitHubOAuthFieldErrors,
  selectGitHubOAuthIsClearing,
  selectGitHubOAuthIsConfigured,
  selectGitHubOAuthIsDirty,
  selectGitHubOAuthIsInitialized,
  selectGitHubOAuthIsLoading,
  selectGitHubOAuthIsSaving,
  selectGitHubOAuthIsSecretVisible,
  selectGitHubOAuthLastUpdated,
  selectGitHubOAuthRequiresRestart,
  selectGitHubOAuthSaveError,
  setClientId,
  setClientSecret,
  toggleSecretVisibility,
} from '@/store/slices/githubOAuthSlice';
import { selectWebServiceStatus } from '@/store/slices/webServiceSlice';
import { initializeGitHubOAuth } from '@/store/thunks/githubOAuthThunks';

export function GitHubOAuthSettings() {
  const { t, i18n } = useTranslation('pages');
  const dispatch = useDispatch<AppDispatch>();
  const clientId = useSelector(selectGitHubOAuthClientId);
  const clientSecret = useSelector(selectGitHubOAuthClientSecret);
  const fieldErrors = useSelector(selectGitHubOAuthFieldErrors);
  const isLoading = useSelector(selectGitHubOAuthIsLoading);
  const isSaving = useSelector(selectGitHubOAuthIsSaving);
  const isClearing = useSelector(selectGitHubOAuthIsClearing);
  const isSecretVisible = useSelector(selectGitHubOAuthIsSecretVisible);
  const requiresRestart = useSelector(selectGitHubOAuthRequiresRestart);
  const lastUpdated = useSelector(selectGitHubOAuthLastUpdated);
  const saveError = useSelector(selectGitHubOAuthSaveError);
  const isDirty = useSelector(selectGitHubOAuthIsDirty);
  const isConfigured = useSelector(selectGitHubOAuthIsConfigured);
  const isInitialized = useSelector(selectGitHubOAuthIsInitialized);
  const webServiceStatus = useSelector((state: RootState) => selectWebServiceStatus(state));
  const previousStatusRef = useRef(webServiceStatus);

  useEffect(() => {
    dispatch(initializeGitHubOAuth());
  }, [dispatch]);

  useEffect(() => {
    if (previousStatusRef.current !== webServiceStatus && isInitialized) {
      previousStatusRef.current = webServiceStatus;
      dispatch(fetchGitHubOAuthConfig());
    } else {
      previousStatusRef.current = webServiceStatus;
    }
  }, [dispatch, isInitialized, webServiceStatus]);

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdated) {
      return null;
    }

    const parsed = new Date(lastUpdated);
    if (Number.isNaN(parsed.getTime())) {
      return lastUpdated;
    }

    return new Intl.DateTimeFormat(i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(parsed);
  }, [i18n.language, lastUpdated]);

  const isBusy = isLoading || isSaving || isClearing;
  const canClear = isConfigured || clientId.trim().length > 0 || clientSecret.trim().length > 0;

  const handleSave = async () => {
    try {
      const result = await dispatch(saveGitHubOAuthConfig()).unwrap();
      toast.success(
        result.requiresRestart && webServiceStatus === 'running'
          ? t('settings.githubOAuth.messages.savedRunning')
          : t('settings.githubOAuth.messages.savedStopped')
      );
    } catch (error) {
      if (error !== 'validation') {
        toast.error(t('settings.githubOAuth.messages.saveFailed'));
      }
    }
  };

  const handleClear = async () => {
    try {
      const result = await dispatch(clearGitHubOAuthConfig()).unwrap();
      toast.success(
        result.requiresRestart && webServiceStatus === 'running'
          ? t('settings.githubOAuth.messages.clearedRunning')
          : t('settings.githubOAuth.messages.clearedStopped')
      );
    } catch {
      toast.error(t('settings.githubOAuth.messages.clearFailed'));
    }
  };

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Github className="h-5 w-5" />
          <CardTitle>{t('settings.githubOAuth.title')}</CardTitle>
        </div>
        <CardDescription>{t('settings.githubOAuth.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>{t('settings.githubOAuth.notes.helper')}</AlertDescription>
        </Alert>

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="github-oauth-client-id">
              {t('settings.githubOAuth.fields.clientId.label')} *
            </Label>
            <Input
              id="github-oauth-client-id"
              value={clientId}
              onChange={(event) => dispatch(setClientId(event.target.value))}
              placeholder={t('settings.githubOAuth.fields.clientId.placeholder')}
              autoComplete="off"
              spellCheck={false}
              disabled={isBusy}
            />
            <p className="text-sm text-muted-foreground">
              {t('settings.githubOAuth.fields.clientId.helper')}
            </p>
            {fieldErrors.clientId ? (
              <p className="text-sm text-destructive">
                {t(`settings.githubOAuth.errors.${fieldErrors.clientId}`)}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="github-oauth-client-secret">
              {t('settings.githubOAuth.fields.clientSecret.label')} *
            </Label>
            <div className="flex gap-2">
              <Input
                id="github-oauth-client-secret"
                type={isSecretVisible ? 'text' : 'password'}
                value={clientSecret}
                onChange={(event) => dispatch(setClientSecret(event.target.value))}
                placeholder={t('settings.githubOAuth.fields.clientSecret.placeholder')}
                autoComplete="new-password"
                spellCheck={false}
                disabled={isBusy}
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => dispatch(toggleSecretVisibility())}
                disabled={isBusy || clientSecret.length === 0}
              >
                {isSecretVisible ? (
                  <>
                    <EyeOff className="mr-2 h-4 w-4" />
                    {t('settings.githubOAuth.actions.hideSecret')}
                  </>
                ) : (
                  <>
                    <Eye className="mr-2 h-4 w-4" />
                    {t('settings.githubOAuth.actions.showSecret')}
                  </>
                )}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {t('settings.githubOAuth.fields.clientSecret.helper')}
            </p>
            {fieldErrors.clientSecret ? (
              <p className="text-sm text-destructive">
                {t(`settings.githubOAuth.errors.${fieldErrors.clientSecret}`)}
              </p>
            ) : null}
          </div>
        </div>

        {saveError ? (
          <Alert variant="destructive">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        ) : null}

        {requiresRestart && webServiceStatus === 'running' ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{t('settings.githubOAuth.notes.restartRunning')}</AlertDescription>
          </Alert>
        ) : null}

        {!requiresRestart && lastUpdatedLabel ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {t(
                webServiceStatus === 'running'
                  ? 'settings.githubOAuth.notes.currentlyApplied'
                  : 'settings.githubOAuth.notes.restartStopped',
                { value: lastUpdatedLabel }
              )}
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-3 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => dispatch(resetGitHubOAuthForm())}
            disabled={isBusy || !isDirty}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {t('settings.githubOAuth.actions.reset')}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleClear}
            disabled={isBusy || !canClear}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {isClearing
              ? t('settings.githubOAuth.actions.clearing')
              : t('settings.githubOAuth.actions.clear')}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isBusy || !isDirty}
          >
            <Save className="mr-2 h-4 w-4" />
            {isSaving
              ? t('settings.githubOAuth.actions.saving')
              : t('settings.githubOAuth.actions.save')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
