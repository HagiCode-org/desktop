import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
  selectPackageManagementInfo,
  selectWebServiceVersion,
  setInstallProgress,
} from '../store/slices/webServiceSlice';
import {
  checkPackageInstallationAction,
  installWebServicePackageAction,
  fetchAvailableVersionsAction,
} from '../store/sagas/webServiceSaga';
import { RootState, AppDispatch } from '../store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Package,
  Download,
  RotateCw,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Info,
} from 'lucide-react';

const PackageManagementCard: React.FC = () => {
  const { t } = useTranslation('components');
  const dispatch = useDispatch<AppDispatch>();
  const { packageInfo, installProgress, isInstalling, availableVersions, platform } = useSelector((state: RootState) => selectPackageManagementInfo(state));
  const version = useSelector(selectWebServiceVersion);

  const [selectedVersion, setSelectedVersion] = React.useState<string>('');

  useEffect(() => {
    // Initial data fetch
    dispatch(checkPackageInstallationAction());
    dispatch(fetchAvailableVersionsAction());

    // Listen for package install progress
    const unsubscribe = (window as any).electronAPI.onPackageInstallProgress?.((progress: any) => {
      dispatch(setInstallProgress(progress));
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [dispatch]);

  const handleInstall = () => {
    if (selectedVersion) {
      // selectedVersion is now just the version number (e.g., "0.1.0-alpha.8")
      dispatch(installWebServicePackageAction(selectedVersion));
    }
  };

  const handleRefresh = () => {
    dispatch(checkPackageInstallationAction());
    dispatch(fetchAvailableVersionsAction());
  };

  const getProgressPercentage = () => {
    if (!installProgress) return 0;
    return installProgress.progress;
  };

  const getProgressStageText = () => {
    if (!installProgress) return '';
    const stageKey = installProgress.stage as keyof typeof t;
    return t(`packageManagement.progress.${stageKey}`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="w-5 h-5" />
          {t('packageManagement.cardTitle')}
        </CardTitle>
        <CardDescription>{t('packageManagement.cardDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Platform Info */}
        <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
          <span className="text-sm text-muted-foreground">{t('packageManagement.platformLabel')}</span>
          <Badge variant="outline">{platform || t('packageManagement.detecting')}</Badge>
        </div>

        <Separator />

        {/* Installation Status */}
        {packageInfo && (
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">{t('packageManagement.installationStatusLabel')}</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={packageInfo.isInstalled ? 'default' : 'secondary'}>
                    {packageInfo.isInstalled ? t('status.installed') : t('status.notInstalled')}
                  </Badge>
                </div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t('packageManagement.installedVersionLabel')}</Label>
                <div className="text-sm font-mono mt-1">
                  {packageInfo.isInstalled ? packageInfo.version : 'N/A'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Installation Progress */}
        {installProgress && installProgress.stage !== 'completed' && installProgress.stage !== 'error' && (
          <div className="p-4 bg-muted/50 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{getProgressStageText()}</span>
              <span className="text-sm text-muted-foreground">{getProgressPercentage()}%</span>
            </div>
            <Progress value={getProgressPercentage()} />
            <p className="text-xs text-muted-foreground">{installProgress.message}</p>
          </div>
        )}

        {/* Installation Complete Message */}
        {installProgress?.stage === 'completed' && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>{installProgress.message}</AlertDescription>
          </Alert>
        )}

        {/* Installation Error Message */}
        {installProgress?.stage === 'error' && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{installProgress.message}</AlertDescription>
          </Alert>
        )}

        <Separator />

        {/* Version Selection */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="version-select">{t('packageManagement.selectVersionLabel')}</Label>
            <Select
              value={selectedVersion}
              onValueChange={setSelectedVersion}
              disabled={isInstalling || availableVersions.length === 0}
            >
              <SelectTrigger id="version-select">
                <SelectValue placeholder={t('packageManagement.versionPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {availableVersions.map((ver) => (
                  <SelectItem key={ver} value={ver}>
                    {ver}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleInstall}
              disabled={isInstalling || !selectedVersion}
              className="flex-1"
            >
              {isInstalling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('packageManagement.installingProgress')}
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  {t('packageManagement.downloadButton')}
                </>
              )}
            </Button>

            <Button
              onClick={handleRefresh}
              disabled={isInstalling}
              variant="outline"
              size="icon"
              title={t('packageManagement.refreshButton')}
            >
              <RotateCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Info */}
        {!availableVersions || availableVersions.length === 0 ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {t('packageManagement.noPackagesMessage')}
              <code className="ml-2 px-2 py-1 bg-muted rounded text-xs">
                ~/repos/newbe36524/pcode/Release/release-packages/
              </code>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="text-xs text-muted-foreground">
            {t('packageManagement.availableVersionsCount', { count: availableVersions.length })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PackageManagementCard;
