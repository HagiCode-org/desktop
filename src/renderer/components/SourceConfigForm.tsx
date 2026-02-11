import { useTranslation } from 'react-i18next';
import { AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState } from '../store';
import {
  setSelectedSourceType,
  setValidationError,
  clearErrors,
} from '../store/slices/packageSourceSlice';
import { FolderConfigForm } from './FolderConfigForm';
import { GitHubConfigForm } from './GitHubConfigForm';
import { scanFolder, fetchGithub, validateConfig } from '../store/thunks/packageSourceThunks';

export function SourceConfigForm() {
  const { t } = useTranslation('components');
  const dispatch = useDispatch();
  const selectedSourceType = useSelector((state: RootState) => state.packageSource.selectedSourceType);
  const validating = useSelector((state: RootState) => state.packageSource.validating);
  const fetchingVersions = useSelector((state: RootState) => state.packageSource.fetchingVersions);
  const validationError = useSelector((state: RootState) => state.packageSource.validationError);
  const error = useSelector((state: RootState) => state.packageSource.error);
  const folderPath = useSelector((state: RootState) => state.packageSource.folderPath);
  const githubOwner = useSelector((state: RootState) => state.packageSource.githubOwner);
  const githubRepo = useSelector((state: RootState) => state.packageSource.githubRepo);
  const githubToken = useSelector((state: RootState) => state.packageSource.githubToken);

  const handleSourceTypeChange = (value: 'local-folder' | 'github-release') => {
    dispatch(setSelectedSourceType(value));
    dispatch(clearErrors());
  };

  const handleScanFolder = () => {
    dispatch(scanFolder(folderPath));
  };

  const handleFetchGithub = () => {
    dispatch(fetchGithub({
      owner: githubOwner,
      repo: githubRepo,
      token: githubToken || undefined,
    }));
  };

  const handleValidate = () => {
    const config =
      selectedSourceType === 'local-folder'
        ? { type: 'local-folder' as const, path: folderPath }
        : {
            type: 'github-release' as const,
            owner: githubOwner,
            repo: githubRepo,
            token: githubToken || undefined,
          };

    dispatch(validateConfig(config));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">{t('packageSource.sourceType.label')}</label>
        <Select value={selectedSourceType} onValueChange={handleSourceTypeChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="local-folder">
              {t('packageSource.sourceType.folder')}
            </SelectItem>
            <SelectItem value="github-release">
              {t('packageSource.sourceType.github')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selectedSourceType === 'local-folder' && <FolderConfigForm />}

      {selectedSourceType === 'github-release' && <GitHubConfigForm />}

      {validationError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        {selectedSourceType === 'local-folder' && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={handleValidate}
              disabled={validating || !folderPath}
              className="flex-1"
            >
              {validating ? t('packageSource.validating') : t('packageSource.validateButton')}
            </Button>
            <Button
              type="button"
              onClick={handleScanFolder}
              disabled={fetchingVersions || !folderPath}
              className="flex-1"
            >
              {fetchingVersions
                ? t('packageSource.folder.scanning')
                : t('packageSource.folder.scanButton')}
            </Button>
          </>
        )}

        {selectedSourceType === 'github-release' && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={handleValidate}
              disabled={validating || !githubOwner || !githubRepo}
              className="flex-1"
            >
              {validating ? t('packageSource.validating') : t('packageSource.validateButton')}
            </Button>
            <Button
              type="button"
              onClick={handleFetchGithub}
              disabled={fetchingVersions || !githubOwner || !githubRepo}
              className="flex-1"
            >
              {fetchingVersions
                ? t('packageSource.github.fetching')
                : t('packageSource.github.fetchButton')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
