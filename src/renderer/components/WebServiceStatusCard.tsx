import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
  selectWebServiceInfo,
  selectWebServiceError,
  selectPackageManagementInfo,
  setProcessInfo,
  type ProcessStatus,
} from '../store/slices/webServiceSlice';
import {
  startWebServiceAction,
  stopWebServiceAction,
  restartWebServiceAction,
  fetchWebServiceVersionAction,
  updateWebServicePortAction,
} from '../store/sagas/webServiceSaga';
import { RootState, AppDispatch } from '../store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import {
  Server,
  Play,
  Square,
  RotateCw,
  ExternalLink,
  Loader2,
  AlertCircle,
  Info,
  Settings,
  Check,
} from 'lucide-react';

// Types
declare global {
  interface Window {
    electronAPI: {
      getWebServiceVersion: () => Promise<string>;
      onWebServiceStatusChange: (callback: (status: any) => void) => (() => void) | void;
    };
  }
}

const WebServiceStatusCard: React.FC = () => {
  const { t } = useTranslation(['components', 'common']);
  const dispatch = useDispatch<AppDispatch>();
  const webServiceInfo = useSelector((state: RootState) => selectWebServiceInfo(state));
  const error = useSelector(selectWebServiceError);
  const { packageInfo } = useSelector((state: RootState) => selectPackageManagementInfo(state));

  const [isEditingPort, setIsEditingPort] = useState(false);
  const [portInputValue, setPortInputValue] = useState((webServiceInfo.port || 36556).toString());
  const [portError, setPortError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch version on mount
    dispatch(fetchWebServiceVersionAction());

    // Listen for web service status changes from main process
    const unsubscribe = window.electronAPI.onWebServiceStatusChange((status: any) => {
      dispatch(setProcessInfo(status));
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [dispatch]);

  // Update port input when port changes from outside
  useEffect(() => {
    setPortInputValue((webServiceInfo.port || 36556).toString());
  }, [webServiceInfo.port]);

  const handleStart = async () => {
    dispatch(startWebServiceAction());
  };

  const handleStop = async () => {
    dispatch(stopWebServiceAction());
  };

  const handleRestart = async () => {
    dispatch(restartWebServiceAction());
  };

  const handleOpenInBrowser = () => {
    if (webServiceInfo.url) {
      window.open(webServiceInfo.url, '_blank');
    }
  };

  const handleUpdatePort = () => {
    const port = parseInt(portInputValue, 10);

    // Validate port
    if (isNaN(port)) {
      setPortError(t('webServiceStatus.portError.invalid') as string);
      return;
    }

    if (port < 1024 || port > 65535) {
      setPortError(t('webServiceStatus.portError.range') as string);
      return;
    }

    // Dispatch action to update port
    dispatch(updateWebServicePortAction(port));
    setPortError(null);
    setIsEditingPort(false);
  };

  const handleCancelEditPort = () => {
    setPortInputValue((webServiceInfo.port || 36556).toString());
    setPortError(null);
    setIsEditingPort(false);
  };

  const getStatusVariant = (status: ProcessStatus): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'running':
        return 'default';
      case 'stopped':
        return 'secondary';
      case 'error':
        return 'destructive';
      case 'starting':
      case 'stopping':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  const getStatusText = (status: ProcessStatus) => {
    return t(`webServiceStatus.status.${status}` as any);
  };

  const getStatusDescription = (status: ProcessStatus) => {
    return t(`webServiceStatus.statusDescription.${status}` as any);
  };

  const formatUptime = (milliseconds: number): string => {
    if (!milliseconds) return '0s';

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return days + 'd ' + (hours % 24) + 'h';
    } else if (hours > 0) {
      return hours + 'h ' + (minutes % 60) + 'm';
    } else if (minutes > 0) {
      return minutes + 'm ' + (seconds % 60) + 's';
    } else {
      return seconds + 's';
    }
  };

  const isRunning = webServiceInfo.status === 'running';
  const isStopped = webServiceInfo.status === 'stopped' || webServiceInfo.status === 'error';
  const isTransitioning = webServiceInfo.status === 'starting' || webServiceInfo.status === 'stopping';
  const isDisabled = webServiceInfo.isOperating || isTransitioning;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="w-5 h-5" />
          {t('webServiceStatus.cardTitle')}
        </CardTitle>
        <CardDescription>{getStatusDescription(webServiceInfo.status)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Badge variant={getStatusVariant(webServiceInfo.status)} className="text-sm px-3 py-1">
              {getStatusText(webServiceInfo.status)}
            </Badge>
          </div>

          <div className="flex gap-2">
            {isStopped && (
              packageInfo?.isInstalled ? (
                <Button
                  onClick={handleStart}
                  disabled={isDisabled}
                  variant="default"
                >
                  {isDisabled && webServiceInfo.status === 'starting' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('webServiceStatus.status.starting')}
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      {t('webServiceStatus.startButton')}
                    </>
                  )}
                </Button>
              ) : (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-medium">{t('webServiceStatus.notInstalledAlert.title')}</p>
                      <p className="text-sm">
                        {t('webServiceStatus.notInstalledAlert.message')}
                      </p>
                    </div>
                  </AlertDescription>
                </Alert>
              )
            )}

            {isRunning && (
              <>
                <Button
                  onClick={handleRestart}
                  disabled={isDisabled}
                  variant="secondary"
                >
                  {isDisabled && webServiceInfo.status === 'stopping' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('webServiceStatus.restartingButton')}
                    </>
                  ) : (
                    <>
                      <RotateCw className="w-4 h-4 mr-2" />
                      {t('webServiceStatus.restartButton')}
                    </>
                  )}
                </Button>

                <Button
                  onClick={handleStop}
                  disabled={isDisabled}
                  variant="destructive"
                >
                  {isDisabled && webServiceInfo.status === 'stopping' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('webServiceStatus.stoppingButton')}
                    </>
                  ) : (
                    <>
                      <Square className="w-4 h-4 mr-2" />
                      {t('webServiceStatus.stopButton')}
                    </>
                  )}
                </Button>

                {webServiceInfo.url && (
                  <Button
                    onClick={handleOpenInBrowser}
                    variant="outline"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    {t('webServiceStatus.openInBrowser')}
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        <Separator />

        {/* Port Configuration - Always visible when service is stopped */}
        {!isRunning && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">{t('webServiceStatus.details.port')}</div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={() => setIsEditingPort(!isEditingPort)}
              >
                <Settings className="w-3 h-3 mr-1" />
                {isEditingPort ? t('common.cancel') : t('common.edit')}
              </Button>
            </div>
            {isEditingPort ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={portInputValue}
                  onChange={(e) => setPortInputValue(e.target.value)}
                  className="flex-1 text-sm"
                  min={1024}
                  max={65535}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleUpdatePort();
                    } else if (e.key === 'Escape') {
                      handleCancelEditPort();
                    }
                  }}
                  autoFocus
                />
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleUpdatePort}
                >
                  <Check className="w-3 h-3 mr-1" />
                  {t('common.save')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelEditPort}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            ) : (
              <div className="text-2xl font-mono font-semibold">{webServiceInfo.port || 36556}</div>
            )}
            {portError && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">{portError}</AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Service Details */}
        {isRunning && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-muted/50 rounded-lg">
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('webServiceStatus.details.serviceUrl')}</div>
              <div className="text-sm font-mono text-primary break-all">
                {webServiceInfo.url || 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('webServiceStatus.details.processId')}</div>
              <div className="text-sm font-mono">
                {webServiceInfo.pid || 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('webServiceStatus.details.uptime')}</div>
              <div className="text-sm font-mono">
                {formatUptime(webServiceInfo.uptime)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('webServiceStatus.details.restartCount')}</div>
              <div className="text-sm font-mono">
                {webServiceInfo.restartCount}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t('webServiceStatus.details.port')}</div>
              <div className="text-sm font-mono">
                {webServiceInfo.port || 'N/A'}
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

export default WebServiceStatusCard;
