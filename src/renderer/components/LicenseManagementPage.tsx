import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useDispatch, useSelector } from 'react-redux';
import { Key, RefreshCw, CheckCircle, AlertCircle, Info, Clock } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { saveLicense } from '../store/thunks/licenseThunks';
import {
  selectLicense,
  selectLicenseLoading,
  selectLicenseError,
  selectLicenseIsConfigured,
} from '../store/slices/licenseSlice';
import { DEFAULT_LICENSE_KEY, type LicenseSyncStatus } from '../../types/license';
import type { RootState } from '../store';

declare global {
  interface Window {
    electronAPI: {
      license: {
        get: () => Promise<import('../../types/license').LicenseData | null>;
        save: (licenseKey: string) => Promise<{ success: boolean; error?: string }>;
        onSyncStatus: (callback: (status: LicenseSyncStatus) => void) => () => void;
      };
    };
  }
}

export default function LicenseManagementPage() {
  const { t } = useTranslation('components');
  const dispatch = useDispatch();
  const license = useSelector((state: RootState) => selectLicense(state));
  const loading = useSelector((state: RootState) => selectLicenseLoading(state));
  const error = useSelector((state: RootState) => selectLicenseError(state));
  const isConfigured = useSelector((state: RootState) => selectLicenseIsConfigured(state));

  const [licenseKey, setLicenseKey] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [syncStatus, setSyncStatus] = useState<LicenseSyncStatus | null>(null);

  useEffect(() => {
    // Pre-fill the input with current license or default
    if (license?.licenseKey) {
      setLicenseKey(license.licenseKey);
    } else {
      setLicenseKey(DEFAULT_LICENSE_KEY);
    }

    // Listen for license sync status changes
    const unsubscribe = window.electronAPI.license.onSyncStatus((status) => {
      console.log('[LicenseManagementPage] License sync status:', status);
      setSyncStatus(status);

      // Show toast notification for sync status
      if (status.synced) {
        const sourceText = status.source === 'default' ? '默认许可证' :
                          status.source === 'existing' ? '已有许可证' : '手动设置';
        const isDefaultText = status.isDefault ? '（默认公测许可证）' : '';
        const versionsText = status.syncedVersions !== undefined
          ? `\n已同步到 ${status.syncedVersions} 个版本`
          : '';

        toast.success(`许可证已同步: ${sourceText}${isDefaultText}${versionsText}`, {
          description: `时间: ${new Date(status.timestamp).toLocaleString('zh-CN')}`,
        });
      }
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [license]);

  const handleSaveLicense = () => {
    if (!licenseKey.trim()) {
      toast.error('许可证密钥不能为空', {
        description: 'License key cannot be empty',
      });
      return;
    }

    dispatch(saveLicense(licenseKey.trim()));
    setIsDirty(false);
  };

  const handleRefresh = () => {
    dispatch({ type: 'license/fetch' });
  };

  const handleCancel = () => {
    if (license?.licenseKey) {
      setLicenseKey(license.licenseKey);
    } else {
      setLicenseKey(DEFAULT_LICENSE_KEY);
    }
    setIsDirty(false);
  };

  const maskLicenseKey = (key: string) => {
    if (!key) return '';
    const parts = key.split('-');
    if (parts.length >= 2) {
      return `${parts[0]}-${parts.slice(1).map(() => '***').join('-')}`;
    }
    return key.substring(0, 8) + '***';
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 bg-primary rounded-xl">
              <Key className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                {t('licenseManagement.title')}
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                {t('licenseManagement.description')}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {t('licenseManagement.actions.refresh')}
          </Button>
        </div>
      </div>

      {/* Sync Status Card */}
      {syncStatus && (
        <Card className="mb-6 border-primary/50 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-4 h-4" />
              许可证同步状态
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">同步状态:</span>
                <Badge variant={syncStatus.synced ? "default" : "secondary"}>
                  {syncStatus.synced ? '已同步' : '未同步'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">来源:</span>
                <span className="font-medium">
                  {syncStatus.source === 'default' && '默认许可证'}
                  {syncStatus.source === 'existing' && '已有配置'}
                  {syncStatus.source === 'manual' && '手动设置'}
                  {syncStatus.isDefault && ' (公测版)'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">同步时间:</span>
                <span className="font-mono text-xs">
                  {new Date(syncStatus.timestamp).toLocaleString('zh-CN')}
                </span>
              </div>
              {syncStatus.syncedVersions !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">同步版本数:</span>
                  <span className="font-medium">
                    {syncStatus.syncedVersions} 个版本
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current License Status Card */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            {t('licenseManagement.currentStatus.title')}
          </CardTitle>
          <CardDescription>
            {t('licenseManagement.currentStatus.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${isConfigured ? 'bg-green-500' : 'bg-yellow-500'}`} />
                <span className="font-medium">
                  {t('licenseManagement.currentStatus.status')}:
                </span>
              </div>
              <span className={`font-semibold ${isConfigured ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                {isConfigured
                  ? t('licenseManagement.currentStatus.configured')
                  : t('licenseManagement.currentStatus.notConfigured')}
              </span>
            </div>

            {isConfigured && license && (
              <>
                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <span className="font-medium">
                    {t('licenseManagement.currentStatus.licenseKey')}:
                  </span>
                  <span className="font-mono text-sm">
                    {maskLicenseKey(license.licenseKey)}
                  </span>
                </div>

                <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                  <span className="font-medium">
                    {t('licenseManagement.currentStatus.updatedAt')}:
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatDate(license.updatedAt)}
                  </span>
                </div>
              </>
            )}

            <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
              <p className="text-sm text-primary-foreground">
                {t('licenseManagement.currentStatus.note')}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Update License Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5" />
            {t('licenseManagement.updateLicense.title')}
          </CardTitle>
          <CardDescription>
            {t('licenseManagement.updateLicense.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="license-key">
                {t('licenseManagement.updateLicense.licenseKeyLabel')} *
              </Label>
              <Input
                id="license-key"
                type="text"
                value={licenseKey}
                onChange={(e) => {
                  setLicenseKey(e.target.value.toUpperCase());
                  setIsDirty(true);
                }}
                placeholder={t('licenseManagement.updateLicense.placeholder')}
                className="font-mono"
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                {t('licenseManagement.updateLicense.hint')}
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <span className="text-sm text-destructive">{error}</span>
              </div>
            )}

            <div className="flex items-center gap-3 justify-end">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={loading || !isDirty}
              >
                {t('licenseManagement.actions.cancel')}
              </Button>
              <Button
                onClick={handleSaveLicense}
                disabled={loading || !isDirty}
                className="gap-2"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
                    {t('licenseManagement.actions.saving')}
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4" />
                    {t('licenseManagement.actions.save')}
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Footer */}
      <div className="mt-8 p-4 bg-muted/30 rounded-lg border border-border">
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center w-5 h-5 bg-primary/10 rounded mt-0.5 flex-shrink-0">
            <AlertCircle className="w-3 h-3 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-foreground font-medium mb-1">
              {t('licenseManagement.info.title')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('licenseManagement.info.description')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
