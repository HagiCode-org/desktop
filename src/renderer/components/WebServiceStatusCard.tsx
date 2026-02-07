import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  selectWebServiceInfo,
  selectWebServiceError,
  selectPackageManagementInfo,
  selectActiveVersion,
  selectCanLaunchService,
  selectLaunchBlockingReason,
  setProcessInfo,
  type ProcessStatus,
} from '../store/slices/webServiceSlice';
import {
  startWebServiceAction,
  stopWebServiceAction,
  restartWebServiceAction,
  fetchWebServiceVersionAction,
  fetchActiveVersionAction,
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
  Square,
  RotateCw,
  Loader2,
  AlertCircle,
  Settings,
  Check,
  Package,
  FolderOpen,
} from 'lucide-react';
import HagicodeActionButton from './HagicodeActionButton';
import DependencyWarningBanner from './DependencyWarningBanner';

// Types
declare global {
  interface Window {
    electronAPI: {
      getWebServiceVersion: () => Promise<string>;
      onWebServiceStatusChange: (callback: (status: any) => void) => (() => void) | void;
      versionOpenLogs: (versionId: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

const WebServiceStatusCard: React.FC = () => {
  const { t } = useTranslation(['components', 'common']);
  const dispatch = useDispatch<AppDispatch>();
  const webServiceInfo = useSelector((state: RootState) => selectWebServiceInfo(state));
  const error = useSelector(selectWebServiceError);
  const { packageInfo } = useSelector((state: RootState) => selectPackageManagementInfo(state));
  const activeVersion = useSelector(selectActiveVersion);
  const canLaunchService = useSelector(selectCanLaunchService);
  const launchBlockingReason = useSelector(selectLaunchBlockingReason);

  const [isEditingPort, setIsEditingPort] = useState(false);
  const [portInputValue, setPortInputValue] = useState((webServiceInfo.port || 36556).toString());
  const [portError, setPortError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch version on mount
    dispatch(fetchWebServiceVersionAction());
    // Fetch active version on mount
    dispatch(fetchActiveVersionAction());

    // Listen for web service status changes from main process
    const unsubscribe = window.electronAPI.onWebServiceStatusChange((status: any) => {
      dispatch(setProcessInfo(status));
    });

    // Listen for tray start/stop service commands
    const unsubscribeTrayStart = window.electronAPI.onTrayStartService(() => {
      dispatch(startWebServiceAction());
    });

    const unsubscribeTrayStop = window.electronAPI.onTrayStopService(() => {
      dispatch(stopWebServiceAction());
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
      if (typeof unsubscribeTrayStart === 'function') {
        unsubscribeTrayStart();
      }
      if (typeof unsubscribeTrayStop === 'function') {
        unsubscribeTrayStop();
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

  const handleOpenHagicode = async () => {
    if (webServiceInfo.url) {
      try {
        await window.electronAPI.openHagicodeInApp(webServiceInfo.url);
      } catch (error) {
        console.error('Failed to open Hagicode in app:', error);
      }
    }
  };

  const handleOpenInBrowser = async () => {
    if (webServiceInfo.url) {
      try {
        await window.electronAPI.openExternal(webServiceInfo.url);
      } catch (error) {
        console.error('Failed to open URL in browser:', error);
      }
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

  const handleOpenLogs = async () => {
    if (!activeVersion) {
      toast.error(t('webServiceStatus.toast.noActiveVersion'));
      return;
    }

    try {
      const result = await window.electronAPI.versionOpenLogs(activeVersion.id);

      if (result.success) {
        toast.success(t('webServiceStatus.toast.openLogsSuccess'));
      } else {
        if (result.error === 'logs_not_found') {
          toast.error(t('webServiceStatus.toast.logsNotFound'));
        } else {
          toast.error(t('webServiceStatus.toast.openLogsError'));
        }
      }
    } catch (error) {
      console.error('Error opening logs folder:', error);
      toast.error(t('webServiceStatus.toast.openLogsError'));
    }
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

  // Render blocking reason alert
  const renderBlockingReason = () => {
    if (launchBlockingReason === 'no-version') {
      return (
        <Alert>
          <Package className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-medium">{t('webServiceStatus.noVersionAlert.title') || 'No Active Version'}</p>
              <p className="text-sm">
                {t('webServiceStatus.noVersionAlert.message') || 'Please install and activate a version first.'}
              </p>
            </div>
          </AlertDescription>
        </Alert>
      );
    }

    if (launchBlockingReason === 'version-not-ready') {
      return (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-medium">{t('webServiceStatus.versionNotReadyAlert.title') || 'Version Not Ready'}</p>
              <p className="text-sm">
                {t('webServiceStatus.versionNotReadyAlert.message') || 'Active version has missing dependencies.'}
              </p>
            </div>
          </AlertDescription>
        </Alert>
      );
    }

    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="relative overflow-hidden border-border/50 shadow-lg shadow-primary/5">
        {/* Animated status indicator line */}
        <motion.div
          className="absolute top-0 left-0 h-1 bg-linear-to-r from-primary to-primary/50"
          initial={{ width: 0 }}
          animate={{ width: isRunning ? '100%' : isStopped ? '0%' : '50%' }}
          transition={{ duration: 0.5 }}
        />

        <CardHeader>
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <CardTitle className="flex items-center gap-2">
              <motion.div
                animate={isRunning ? {
                  rotate: [0, 5, -5, 0],
                  scale: [1, 1.1, 1],
                } : {}}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Server className={`w-5 h-5 ${isRunning ? 'text-primary' : ''}`} />
              </motion.div>
              {t('webServiceStatus.cardTitle')}
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              <motion.span
                key={webServiceInfo.status}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {getStatusDescription(webServiceInfo.status)}
              </motion.span>
              {isRunning && (
                <motion.span
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-2 h-2 bg-primary rounded-full"
                />
              )}
            </CardDescription>
          </motion.div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Badge */}
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="flex items-center gap-4"
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={webServiceInfo.status}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Badge
                  variant={getStatusVariant(webServiceInfo.status)}
                  className="text-sm px-3 py-1"
                >
                  {getStatusText(webServiceInfo.status)}
                </Badge>
              </motion.span>
            </AnimatePresence>
          </motion.div>

          {/* Dependency Warning Banner */}
          <DependencyWarningBanner />

          {/* Primary Action Button - Full Width */}
          <AnimatePresence mode="wait">
            {isStopped && !canLaunchService ? (
              <motion.div
                key="blocking-reason"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                {renderBlockingReason()}
              </motion.div>
            ) : (
              <HagicodeActionButton
                isRunning={isRunning}
                isDisabled={isDisabled}
                status={webServiceInfo.status}
                canLaunchService={canLaunchService}
                onStart={handleStart}
                onOpenApp={handleOpenHagicode}
                onOpenBrowser={handleOpenInBrowser}
              />
            )}
          </AnimatePresence>

          {/* Secondary Controls - Restart/Stop (only when running) */}
          <AnimatePresence mode="wait">
            {isRunning && (
              <motion.div
                key="secondary-controls"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, delay: 0.1 }}
                className="flex gap-2 justify-center"
              >
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={handleRestart}
                    disabled={isDisabled}
                    variant="secondary"
                    size="sm"
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
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    onClick={handleStop}
                    disabled={isDisabled}
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
                </motion.div>

                {/* Open Logs Button - only when active version exists */}
                {activeVersion && (
                  <motion.div
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button
                      onClick={handleOpenLogs}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                    >
                      <FolderOpen className="w-4 h-4" />
                      {t('webServiceStatus.openLogsButton')}
                    </Button>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

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
                {isEditingPort ? t('common:button.cancel') : t('common:button.edit')}
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
                  {t('common:button.save')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelEditPort}
                >
                  {t('common:button.cancel')}
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
          <AnimatePresence mode="wait">
            {isRunning && (
              <motion.div
                key="service-details"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 p-4 bg-muted/30 rounded-lg border border-border/50"
              >
                {[
                  { label: t('webServiceStatus.details.serviceUrl'), value: webServiceInfo.url || 'N/A', mono: true, primary: true },
                  { label: t('webServiceStatus.details.processId'), value: webServiceInfo.pid || 'N/A', mono: true },
                  { label: t('webServiceStatus.details.uptime'), value: formatUptime(webServiceInfo.uptime), mono: true },
                  { label: t('webServiceStatus.details.restartCount'), value: webServiceInfo.restartCount.toString(), mono: true },
                  { label: t('webServiceStatus.details.port'), value: (webServiceInfo.port || 'N/A').toString(), mono: true },
                  { label: t('webServiceStatus.details.version') || 'Version', value: activeVersion?.version || 'N/A', mono: true },
                ].map((item, index) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ y: -2 }}
                    className="p-2 rounded transition-all cursor-default"
                  >
                    <div className="text-xs text-muted-foreground mb-1">{item.label}</div>
                    <div className={`text-sm font-mono ${item.primary ? 'text-primary' : ''} break-all`}>
                      {item.value}
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Display */}
          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                key="error-alert"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default WebServiceStatusCard;
