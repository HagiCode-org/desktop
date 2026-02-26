import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, FolderOpen, HardDrive, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '@/store';
import type { AppDispatch } from '@/store';
import {
  fetchDataDirectory,
  validatePath,
  saveDataDirectory,
  fetchStorageInfo,
  restoreDefaultDataDirectory,
  selectDataDirectoryPath,
  selectDataDirectoryIsValid,
  selectDataDirectoryValidationMessage,
  selectDataDirectoryValidationWarnings,
  selectDataDirectoryStorageInfo,
  selectDataDirectoryIsLoading,
  selectDataDirectoryIsLoadingStorage,
  selectDataDirectoryIsSaving,
  selectDataDirectorySaveError,
  setPath,
  setValidation,
  setStorageInfo,
} from '@/store/slices/dataDirectorySlice';

export function DataDirectorySettings() {
  const { t } = useTranslation('pages');
  const dispatch = useDispatch<AppDispatch>();

  // Debug: Check i18n initialization
  useEffect(() => {
    console.log('[DataDirectorySettings] t function:', typeof t);
    console.log('[DataDirectorySettings] i18n ready:', !!t);
    console.log('[DataDirectorySettings] Sample translation:', t('settings.title'));
  }, [t]);

  const path = useSelector(selectDataDirectoryPath);
  const isValid = useSelector(selectDataDirectoryIsValid);
  const validationMessage = useSelector(selectDataDirectoryValidationMessage);
  const validationWarnings = useSelector(selectDataDirectoryValidationWarnings);
  const storageInfo = useSelector(selectDataDirectoryStorageInfo);
  const isLoading = useSelector(selectDataDirectoryIsLoading);
  const isLoadingStorage = useSelector(selectDataDirectoryIsLoadingStorage);
  const isSaving = useSelector(selectDataDirectoryIsSaving);
  const saveError = useSelector(selectDataDirectorySaveError);

  const [localPath, setLocalPath] = useState('');

  // Load initial data
  useEffect(() => {
    dispatch(fetchDataDirectory());
  }, [dispatch]);

  // Sync localPath with global path when it changes
  useEffect(() => {
    if (path && localPath !== path) {
      setLocalPath(path);
    }
  }, [path]);

  // Validate input path with debounce
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (localPath && localPath.trim()) {
        dispatch(validatePath(localPath.trim()));
      } else {
        dispatch(setPath(''));
        dispatch(setValidation({
          isValid: true,
          message: '',
          warnings: undefined,
        }));
      }
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [localPath, dispatch]);

  // Fetch storage info when path is loaded
  useEffect(() => {
    if (path && !storageInfo) {
      dispatch(fetchStorageInfo());
    }
  }, [dispatch, path, storageInfo]);

  const handleBrowse = async () => {
    try {
      const result = await window.electronAPI.dataDirectory.openPicker();

      if (result && !result.canceled && result.filePath) {
        // Validate the selected path
        const validationResult = await dispatch(validatePath(result.filePath));
        if (validationResult?.payload?.isValid) {
          setLocalPath(result.filePath);
        }
      }
    } catch (error) {
      console.error('Failed to open folder dialog:', error);
    }
  };

  const handleSave = async () => {
    if (!isValid) {
      toast.error(t('settings.dataDirectory.errors.invalidPath'));
      return;
    }

    try {
      await dispatch(saveDataDirectory(path || localPath));
      toast.success(t('settings.dataDirectory.messages.saveSuccess'));
    } catch (error) {
      toast.error(t('settings.dataDirectory.messages.saveFailed'));
    }
  };

  const handleRestoreDefault = async () => {
    try {
      await dispatch(restoreDefaultDataDirectory());
      toast.success(t('settings.dataDirectory.messages.restoreSuccess'));
    } catch (error) {
      toast.error(t('settings.dataDirectory.messages.restoreFailed'));
    }
  };

  const handleRefreshStorage = () => {
    dispatch(fetchStorageInfo());
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return t('settings.dataDirectory.storage.noData');

    const gb = bytes / (1024 * 1024 * 1024);
    if (gb < 1) {
      const mb = (bytes / (1024 * 1024)).toFixed(2);
      return `${mb} MB`;
    }
    return `${gb.toFixed(2)} GB`;
  };

  const getValidationIcon = () => {
    if (!path) return null;
    if (isValid) return <CheckCircle className="h-5 w-5 text-green-500" />;
    return <AlertCircle className="h-5 w-5 text-amber-500" />;
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t('settings.dataDirectory.title')}</CardTitle>
        <CardDescription>
          {t('settings.dataDirectory.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Path Input Section */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="data-directory-path">
              {t('settings.dataDirectory.path.label')}
            </Label>
            <div className="flex gap-2">
              <Input
                id="data-directory-path"
                type="text"
                value={localPath || path}
                onChange={(e) => setLocalPath(e.target.value)}
                placeholder={t('settings.dataDirectory.path.placeholder')}
                className="flex-1 font-mono text-sm"
                disabled={isLoading || isSaving}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleBrowse}
                disabled={isLoading || isSaving}
                className="shrink-0"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    {t('settings.dataDirectory.actions.scanning')}
                  </>
                ) : (
                  <>
                    <Folder className="mr-2 h-4 w-4" />
                    {t('settings.dataDirectory.actions.browse')}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Validation Status */}
          {path && (
            <Alert variant={isValid ? 'default' : 'destructive'}>
              <div className="flex items-start gap-2">
                {getValidationIcon()}
                <div className="flex-1">
                  <AlertDescription>
                    {isValid ? (
                      t('settings.dataDirectory.validation.valid')
                    ) : (
                      t('settings.dataDirectory.validation.invalid')
                    )}
                    {validationWarnings && validationWarnings.length > 0 && (
                      <ul className="mt-2 list-disc list-inside text-sm space-y-1 text-muted-foreground">
                        {validationWarnings.map((warning, index) => (
                          <li key={index}>{warning}</li>
                        ))}
                      </ul>
                    )}
                  </AlertDescription>
                </div>
              </div>
            </Alert>
          )}
        </div>

        {/* Storage Information Section */}
        {storageInfo && (
          <div className="space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <HardDrive className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">
                  {t('settings.dataDirectory.storage.title')}
                </h3>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm mb-2">
                  <span>{t('settings.dataDirectory.storage.used')}</span>
                  <span className="font-mono">
                    {formatBytes(storageInfo.used)} / {formatBytes(storageInfo.total)}
                  </span>
                </div>
                <Progress value={storageInfo.usedPercentage} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {t('settings.dataDirectory.storage.usedPercent', {
                      percent: storageInfo.usedPercentage.toFixed(1),
                    })}
                  </span>
                  <span>
                    {t('settings.dataDirectory.storage.available', {
                      available: formatBytes(storageInfo.available),
                    })}
                  </span>
                </div>
              </div>
            </div>

            {/* Refresh Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefreshStorage}
              disabled={isLoadingStorage}
              className="w-full"
            >
              {isLoadingStorage ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  {t('settings.dataDirectory.actions.refreshing')}
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t('settings.dataDirectory.actions.refresh')}
                </>
              )}
            </Button>
          </div>
        )}

        <div className="flex gap-3 pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleRestoreDefault}
            disabled={isLoading || isSaving}
            className="flex-1"
          >
            {t('settings.dataDirectory.actions.restoreDefault')}
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isValid || isLoading || isSaving}
            className="flex-1"
          >
            {isSaving ? (
              <>
                <FolderOpen className="mr-2 h-4 w-4 animate-spin" />
                {t('settings.dataDirectory.actions.saving')}
              </>
            ) : (
              <>
                <FolderOpen className="mr-2 h-4 w-4" />
                {t('settings.dataDirectory.actions.save')}
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

        {/* Note about absolute paths */}
        <Alert>
          <AlertDescription>
            {t('settings.dataDirectory.notes.absolutePathOnly')}
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
