import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Package, Folder, Github, Globe } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
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
  selectCurrentConfig,
  selectAllConfigs,
  setFolderPath,
  setGithubOwner,
  setGithubRepo,
  setGithubToken,
  setHttpIndexUrl,
  selectHttpIndexUrl,
} from '../store/slices/packageSourceSlice';
import { setSourceConfig, switchSource } from '../store/thunks/packageSourceThunks';

export function PackageSourceSelector() {
  const { t } = useTranslation('components');
  const dispatch = useDispatch();
  const currentConfig = useSelector((state: RootState) => selectCurrentConfig(state));
  const allConfigs = useSelector((state: RootState) => selectAllConfigs(state));

  // Use Redux state for form inputs
  const folderPath = useSelector((state: RootState) => state.packageSource.folderPath);
  const githubOwner = useSelector((state: RootState) => state.packageSource.githubOwner);
  const githubRepo = useSelector((state: RootState) => state.packageSource.githubRepo);
  const githubToken = useSelector((state: RootState) => state.packageSource.githubToken);
  const httpIndexUrl = useSelector((state: RootState) => selectHttpIndexUrl(state));

  const [hasChanges, setHasChanges] = useState(false);

  // Derive sourceType from currentConfig
  const sourceType: 'local-folder' | 'github-release' | 'http-index' = currentConfig?.type || 'local-folder';

  // Sync form state with currentConfig when it changes
  useEffect(() => {
    if (currentConfig) {
      if (currentConfig.type === 'local-folder' && currentConfig.path) {
        dispatch(setFolderPath(currentConfig.path));
      } else if (currentConfig.type === 'github-release') {
        dispatch(setGithubOwner(currentConfig.owner || 'HagiCode-org'));
        dispatch(setGithubRepo(currentConfig.repo || 'releases'));
        dispatch(setGithubToken(currentConfig.token || ''));
      } else if (currentConfig.type === 'http-index') {
        dispatch(setHttpIndexUrl(currentConfig.indexUrl || ''));
      }
      setHasChanges(false);
    }
  }, [currentConfig, dispatch]);

  // Detect changes
  useEffect(() => {
    if (!currentConfig) return;

    let changed = false;
    if (sourceType !== currentConfig.type) {
      changed = true;
    } else if (sourceType === 'local-folder') {
      changed = folderPath !== (currentConfig.path || '');
    } else if (sourceType === 'github-release') {
      changed =
        githubOwner !== (currentConfig.owner || 'HagiCode-org') ||
        githubRepo !== (currentConfig.repo || 'releases') ||
        githubToken !== (currentConfig.token || '');
    } else if (sourceType === 'http-index') {
      changed = httpIndexUrl !== (currentConfig.indexUrl || '');
    }
    setHasChanges(changed);
  }, [sourceType, folderPath, githubOwner, githubRepo, githubToken, httpIndexUrl, currentConfig]);

  const handleSourceTypeChange = async (value: 'local-folder' | 'github-release' | 'http-index') => {
    // Find an existing source of this type
    const existingSource = allConfigs.find(config => config.type === value);

    if (existingSource) {
      // Switch to existing source using its ID
      dispatch(switchSource(existingSource.id));
    } else {
      // Create a new source with default values
      const config =
        value === 'local-folder'
          ? {
              type: 'local-folder' as const,
              name: '本地文件夹',
              path: folderPath || process.env.NODE_ENV === 'development'
                ? '/home/newbe36524/repos/newbe36524/pcode/Release/release-packages/'
                : '',
            }
          : value === 'github-release'
          ? {
              type: 'github-release' as const,
              name: 'HagiCode Releases',
              owner: githubOwner || 'HagiCode-org',
              repo: githubRepo || 'releases',
              token: githubToken || undefined,
            }
          : {
              type: 'http-index' as const,
              name: 'HTTP 索引源',
              indexUrl: httpIndexUrl || 'https://server.dl.hagicode.com/index.json',
            };

      // Save and switch to the new source
      dispatch(setSourceConfig(config));
    }
  };

  const handleSave = async () => {
    const config =
      sourceType === 'local-folder'
        ? {
            type: 'local-folder' as const,
            name: '本地文件夹',
            path: folderPath,
          }
        : sourceType === 'github-release'
        ? {
            type: 'github-release' as const,
            name: 'HagiCode Releases',
            owner: githubOwner,
            repo: githubRepo,
            token: githubToken || undefined,
          }
        : {
            type: 'http-index' as const,
            name: 'HTTP 索引源',
            indexUrl: httpIndexUrl || 'https://server.dl.hagicode.com/index.json',
          };

    // Save the configuration via Redux thunk
    dispatch(setSourceConfig(config));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          {t('packageSource.cardTitle')}
        </CardTitle>
        <CardDescription>{t('packageSource.cardDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Source Type Selector */}
        <div className="space-y-2">
          <Label>{t('packageSource.sourceType.label')}</Label>
          <Select value={sourceType} onValueChange={handleSourceTypeChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="local-folder">
                <div className="flex items-center gap-2">
                  <Folder className="h-4 w-4" />
                  {t('packageSource.sourceType.folder')}
                </div>
              </SelectItem>
              <SelectItem value="github-release">
                <div className="flex items-center gap-2">
                  <Github className="h-4 w-4" />
                  {t('packageSource.sourceType.github')}
                </div>
              </SelectItem>
              <SelectItem value="http-index">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  {t('packageSource.sourceType.httpIndex')}
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Configuration Form */}
        <div className="space-y-4">
          {sourceType === 'local-folder' && (
            <div className="space-y-2">
              <Label htmlFor="folder-path">{t('packageSource.folder.path.label')}</Label>
              <Input
                id="folder-path"
                type="text"
                value={folderPath}
                onChange={(e) => dispatch(setFolderPath(e.target.value))}
                placeholder={t('packageSource.folder.path.placeholder')}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                当前路径: {currentConfig?.type === 'local-folder' ? currentConfig.path : '未设置'}
              </p>
            </div>
          )}

          {sourceType === 'github-release' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="github-owner">{t('packageSource.github.owner.label')}</Label>
                  <Input
                    id="github-owner"
                    type="text"
                    value={githubOwner}
                    onChange={(e) => dispatch(setGithubOwner(e.target.value))}
                    placeholder={t('packageSource.github.owner.placeholder')}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="github-repo">{t('packageSource.github.repository.label')}</Label>
                  <Input
                    id="github-repo"
                    type="text"
                    value={githubRepo}
                    onChange={(e) => dispatch(setGithubRepo(e.target.value))}
                    placeholder={t('packageSource.github.repository.placeholder')}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="github-token">{t('packageSource.github.token.label')}</Label>
                <Input
                  id="github-token"
                  type="password"
                  value={githubToken}
                  onChange={(e) => dispatch(setGithubToken(e.target.value))}
                  placeholder={t('packageSource.github.token.placeholder')}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  {t('packageSource.github.token.hint')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('packageSource.github.token.rateLimitHint')}
                </p>
              </div>

              <div className="text-xs text-muted-foreground">
                当前配置: {currentConfig?.type === 'github-release'
                  ? `${currentConfig.owner}/${currentConfig.repo}`
                  : '未设置'}
              </div>
            </div>
          )}

          {sourceType === 'http-index' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="http-index-url">{t('packageSource.httpIndex.indexUrl.label')}</Label>
                <Input
                  id="http-index-url"
                  type="text"
                  value={httpIndexUrl}
                  onChange={(e) => dispatch(setHttpIndexUrl(e.target.value))}
                  placeholder={t('packageSource.httpIndex.indexUrl.placeholder')}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  {t('packageSource.httpIndex.indexUrl.hint')}
                </p>
              </div>

              <div className="text-xs text-muted-foreground">
                当前配置: {currentConfig?.type === 'http-index'
                  ? currentConfig.indexUrl || '未设置'
                  : '未设置'}
              </div>
            </div>
          )}

          {/* Save Button */}
          {hasChanges && (
            <Button onClick={handleSave} className="w-full">
              保存配置
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
