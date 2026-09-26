import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Folder, Globe, Package } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from '../store';
import {
  selectAllConfigs,
  selectCurrentConfig,
  selectFolderPath,
  selectHttpIndexUrl,
  selectSelectedSourceType,
  setFolderPath,
  setSelectedSourceType,
} from '../store/slices/packageSourceSlice';
import { setSourceConfig, switchSource } from '../store/thunks/packageSourceThunks';
import {
  buildDraftSourceConfig,
  getSelectedSourceChoice,
  hasPackageSourceDraftChanges,
  officialIndexUrls,
  resolveSourceChoice,
} from './packageSourceSelectorState';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';

export function PackageSourceSelector() {
  const { t } = useTranslation('components');
  const dispatch = useDispatch<AppDispatch>();
  const currentConfig = useSelector((state: RootState) => selectCurrentConfig(state));
  const allConfigs = useSelector((state: RootState) => selectAllConfigs(state));
  const folderPath = useSelector((state: RootState) => selectFolderPath(state));
  const httpIndexUrl = useSelector((state: RootState) => selectHttpIndexUrl(state));
  const sourceType = useSelector((state: RootState) => selectSelectedSourceType(state));
  const selectedChoice = getSelectedSourceChoice(currentConfig, sourceType);
  const savedCustomSources = allConfigs.filter(source => (
    source.type === 'http-index'
    && source.indexUrl !== officialIndexUrls.mainland
    && source.indexUrl !== officialIndexUrls.international
  ));
  const selectedCustomSourceId = savedCustomSources.find(source => source.id === currentConfig?.id)?.id;

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

  const handleSourceChoiceChange = (value: string) => {
    const nextAction = resolveSourceChoice(allConfigs, value);
    if (nextAction.kind === 'switch-saved-source') {
      if (nextAction.sourceId !== currentConfig?.id) {
        dispatch(switchSource(nextAction.sourceId));
      } else if (value !== 'local-folder' && sourceType === 'local-folder') {
        dispatch(setSelectedSourceType('http-index'));
      }
      return;
    }

    if (nextAction.kind === 'edit-draft') {
      dispatch(setSelectedSourceType(nextAction.sourceType));
    } else {
      dispatch(setSourceConfig({
        type: 'http-index',
        name: t(`packageSource.officialSource.${value}`),
        indexUrl: nextAction.indexUrl,
      }));
    }
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
          <Label id="package-source-choice-label">{t('packageSource.sourceType.label')}</Label>
          <RadioGroup
            aria-labelledby="package-source-choice-label"
            value={selectedChoice ?? ''}
            onValueChange={handleSourceChoiceChange}
            className="grid gap-3 sm:grid-cols-3"
          >
            {(['mainland', 'international', 'local-folder'] as const).map((choice) => (
              <Label
                key={choice}
                htmlFor={`package-source-${choice}`}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-muted/20 p-4 has-[[data-state=checked]]:border-primary"
              >
                <RadioGroupItem id={`package-source-${choice}`} value={choice} />
                {choice === 'local-folder' ? <Folder className="h-4 w-4 shrink-0" /> : <Globe className="h-4 w-4 shrink-0" />}
                <span>{t(choice === 'local-folder'
                  ? 'packageSource.sourceType.folder'
                  : `packageSource.officialSource.${choice}`)}</span>
              </Label>
            ))}
          </RadioGroup>
        </div>

        {savedCustomSources.length > 0 ? (
          <div className="space-y-2">
            <Label id="saved-custom-package-source-label">{t('packageSource.availableSources')}</Label>
            <RadioGroup
              aria-labelledby="saved-custom-package-source-label"
              value={selectedCustomSourceId ? `saved:${selectedCustomSourceId}` : ''}
              onValueChange={handleSourceChoiceChange}
              className="grid gap-3 sm:grid-cols-2"
            >
              {savedCustomSources.map((source) => (
                <Label
                  key={source.id}
                  htmlFor={`saved-package-source-${source.id}`}
                  className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-muted/20 p-4 has-[[data-state=checked]]:border-primary"
                >
                  <RadioGroupItem id={`saved-package-source-${source.id}`} value={`saved:${source.id}`} />
                  <span>{source.name || source.indexUrl || t('packageSource.notSet')}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>
        ) : null}

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
            {currentConfig?.type === 'local-folder' && (
              <p className="text-xs text-muted-foreground">
                {t('packageSource.folder.currentPath', { path: currentConfig.path || t('packageSource.notSet') })}
              </p>
            )}
          </div>
        )}

        {sourceType === 'http-index' && currentConfig?.type === 'http-index' && (
          <div className="space-y-2">
            <Label htmlFor="http-index-url">{t('packageSource.httpIndex.indexUrl.label')}</Label>
            <Input
              id="http-index-url"
              type="url"
              value={selectedChoice === 'mainland' || selectedChoice === 'international'
                ? officialIndexUrls[selectedChoice]
                : currentConfig.indexUrl || httpIndexUrl}
              readOnly
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {t('packageSource.httpIndex.indexUrl.hint')}
            </p>
          </div>
        )}

        {sourceType === 'local-folder' && hasChanges && (
          <Button onClick={handleSave} className="w-full">
            {t('packageSource.applyButton')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
