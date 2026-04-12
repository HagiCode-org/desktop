import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, Globe, Package } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { OFFICIAL_SERVER_HTTP_INDEX_URL } from '../../shared/package-source-defaults';
import type { RootState, AppDispatch } from '../store';
import {
  selectAllConfigs,
  selectCurrentConfig,
  selectFolderPath,
  selectHttpIndexUrl,
  selectSelectedSourceType,
  setFolderPath,
  setHttpIndexUrl,
  setSelectedSourceType,
} from '../store/slices/packageSourceSlice';
import { setSourceConfig, switchSource } from '../store/thunks/packageSourceThunks';
import {
  buildDraftSourceConfig,
  hasPackageSourceDraftChanges,
  resolveSourceTypeChange,
} from './packageSourceSelectorState';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

export function PackageSourceSelector() {
  const { t } = useTranslation('components');
  const dispatch = useDispatch<AppDispatch>();
  const currentConfig = useSelector((state: RootState) => selectCurrentConfig(state));
  const allConfigs = useSelector((state: RootState) => selectAllConfigs(state));
  const folderPath = useSelector((state: RootState) => selectFolderPath(state));
  const httpIndexUrl = useSelector((state: RootState) => selectHttpIndexUrl(state));
  const sourceType = useSelector((state: RootState) => selectSelectedSourceType(state));

  const draftConfig = useMemo(() => (
    buildDraftSourceConfig({
      sourceType,
      folderPath,
      httpIndexUrl,
      folderSourceName: t('packageSource.sourceType.folder'),
      httpIndexSourceName: t('packageSource.sourceType.httpIndex'),
    })
  ), [folderPath, httpIndexUrl, sourceType, t]);

  const hasChanges = useMemo(() => (
    hasPackageSourceDraftChanges({
      currentConfig,
      sourceType,
      folderPath,
      httpIndexUrl,
    })
  ), [currentConfig, folderPath, httpIndexUrl, sourceType]);

  const handleSourceTypeChange = (value: 'local-folder' | 'http-index') => {
    const nextAction = resolveSourceTypeChange(allConfigs, value);
    if (nextAction.kind === 'switch-saved-source') {
      dispatch(switchSource(nextAction.sourceId));
      return;
    }

    dispatch(setSelectedSourceType(nextAction.sourceType));
  };

  const handleSave = () => {
    dispatch(setSourceConfig(draftConfig));
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
              <SelectItem value="http-index">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  {t('packageSource.sourceType.httpIndex')}
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {sourceType === 'local-folder' && (
          <div className="space-y-2">
            <Label htmlFor="folder-path">{t('packageSource.folder.path.label')}</Label>
            <Input
              id="folder-path"
              type="text"
              value={folderPath}
              onChange={(event) => dispatch(setFolderPath(event.target.value))}
              placeholder={t('packageSource.folder.path.placeholder')}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              当前路径: {currentConfig?.type === 'local-folder' ? currentConfig.path : '未设置'}
            </p>
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
                onChange={(event) => dispatch(setHttpIndexUrl(event.target.value))}
                placeholder={OFFICIAL_SERVER_HTTP_INDEX_URL}
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

        {hasChanges && (
          <Button onClick={handleSave} className="w-full">
            保存配置
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
