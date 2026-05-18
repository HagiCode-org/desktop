import React, { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import {
  selectWebServiceInfo,
  selectWebServiceError,
  selectStartupFailure,
  selectShowStartupFailureDialog,
  selectActiveVersion,
  selectCanLaunchService,
  selectLaunchBlockingReason,
  hideStartupFailureDialog,
  showStartupFailureDialog,
  type ProcessStatus,
} from '../store/slices/webServiceSlice';
import { writeTextToClipboard } from '../lib/clipboard.js';
import { evaluateDependencyReadiness, npmInstallableAgentCliPackages } from '../../shared/npm-managed-packages.js';
import type { DependencyReadinessSummary } from '../../types/dependency-management.js';
import {
  startWebService,
  stopWebService,
  restartWebService,
  fetchWebServiceVersion,
  fetchActiveVersion,
  updateWebServiceConfig,
} from '../store/thunks/webServiceThunks';
import { RootState, AppDispatch } from '../store';
import { switchViewWithSideEffects } from '../store/thunks/viewThunks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Server,
  Square,
  RotateCw,
  Loader2,
  AlertCircle,
  Settings,
  Package,
  FolderOpen,
} from 'lucide-react';
import HagicodeActionButton from './HagicodeActionButton';
import type { CodeServerBridge } from '../../types/code-server-management.js';
import type { OmniRouteBridge } from '../../types/omniroute-management.js';
import {
  buildAccessUrl,
  DEFAULT_WEB_SERVICE_HOST,
  DEFAULT_WEB_SERVICE_PORT,
  isValidIpv4Address,
  normalizeListenHost,
  resolveListenHostPreset,
  type ListenHostPreset,
} from '../../types/web-service-network';
import type {
  LogDirectoryBridge,
  LogDirectoryErrorCode,
  LogDirectoryTarget,
} from '@types/log-directory';

// Types
declare global {
  interface Window {
    electronAPI: {
      getWebServiceVersion: () => Promise<string>;
      logDirectory: LogDirectoryBridge;
      codeServer: CodeServerBridge;
      omniroute: OmniRouteBridge;
    };
  }
}

const WEB_APP_LOG_DIRECTORY_TARGET: LogDirectoryTarget = 'web-app';
const AUTO_START_CODE_SERVER_STORAGE_KEY = 'webService.autoStart.codeServer';
const AUTO_START_OMNIROUTE_STORAGE_KEY = 'webService.autoStart.omniroute';

function readStoredStartupPreference(key: string, fallback: boolean): boolean {
  if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
    return fallback;
  }

  const raw = globalThis.localStorage.getItem(key);
  if (raw === null) {
    return fallback;
  }

  return raw === 'true';
}

const WebServiceStatusCard: React.FC = () => {
  const { t } = useTranslation(['components', 'common', 'pages']);
  const dispatch = useDispatch<AppDispatch>();
  const webServiceInfo = useSelector((state: RootState) => selectWebServiceInfo(state));
  const error = useSelector(selectWebServiceError);
  const startupFailure = useSelector((state: RootState) => selectStartupFailure(state));
  const showStartupFailure = useSelector((state: RootState) => selectShowStartupFailureDialog(state));
  const activeVersion = useSelector(selectActiveVersion);
  const canLaunchService = useSelector(selectCanLaunchService);
  const launchBlockingReason = useSelector(selectLaunchBlockingReason);

  const [portInputValue, setPortInputValue] = useState((webServiceInfo.port || DEFAULT_WEB_SERVICE_PORT).toString());
  const [selectedListenPreset, setSelectedListenPreset] = useState<ListenHostPreset>(
    resolveListenHostPreset(webServiceInfo.host || DEFAULT_WEB_SERVICE_HOST)
  );
  const [customListenHost, setCustomListenHost] = useState(
    resolveListenHostPreset(webServiceInfo.host || DEFAULT_WEB_SERVICE_HOST) === 'custom'
      ? (webServiceInfo.host || '')
      : ''
  );
  const [networkConfigError, setNetworkConfigError] = useState<string | null>(null);
  const [dependencyReadiness, setDependencyReadiness] = useState<DependencyReadinessSummary | null>(null);
  const [dependencyReadinessError, setDependencyReadinessError] = useState<string | null>(null);
  const [autoStartCodeServer, setAutoStartCodeServer] = useState(() =>
    readStoredStartupPreference(AUTO_START_CODE_SERVER_STORAGE_KEY, true)
  );
  const [autoStartOmniRoute, setAutoStartOmniRoute] = useState(() =>
    readStoredStartupPreference(AUTO_START_OMNIROUTE_STORAGE_KEY, false)
  );
  const debounceSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRunning = webServiceInfo.status === 'running';
  const isStopped = webServiceInfo.status === 'stopped' || webServiceInfo.status === 'error';
  const isTransitioning = webServiceInfo.status === 'starting' || webServiceInfo.status === 'stopping';
  const hasReadyWebUrl = Boolean(webServiceInfo.url?.trim());
  const isWaitingForPort = (
    webServiceInfo.status === 'starting' ||
    webServiceInfo.status === 'running' ||
    webServiceInfo.phase === 'waiting_listening'
  ) && !hasReadyWebUrl;
  const isDisabled = webServiceInfo.isOperating || isTransitioning;
  const showRuntimeSecondaryControls = isRunning;
  const showOpenLogsButton = Boolean(activeVersion);
  const pendingHostValue = selectedListenPreset === 'custom' ? customListenHost.trim() : selectedListenPreset;
  const normalizedPendingHost = normalizeListenHost(pendingHostValue);
  const pendingPort = Number.parseInt(portInputValue, 10);
  const portValidationError = Number.isNaN(pendingPort)
    ? t('webServiceStatus.portError.invalid')
    : (pendingPort < 1024 || pendingPort > 65535)
      ? t('webServiceStatus.portError.range')
      : null;
  const isCustomListenHostMissing = selectedListenPreset === 'custom' && customListenHost.trim().length === 0;
  const customListenHostError = selectedListenPreset === 'custom' && customListenHost.trim().length > 0 && !isValidIpv4Address(customListenHost)
    ? t('webServiceStatus.listenAddress.customError')
    : null;
  const effectiveNetworkConfigError = networkConfigError || customListenHostError || portValidationError;
  const normalizedCurrentHost = normalizeListenHost(webServiceInfo.host) || DEFAULT_WEB_SERVICE_HOST;
  const isNetworkConfigDirty = (
    (normalizedPendingHost ?? pendingHostValue) !== normalizedCurrentHost ||
    (!Number.isNaN(pendingPort) && pendingPort !== webServiceInfo.port)
  );
  const accessUrlPreview = buildAccessUrl(normalizedPendingHost || normalizedCurrentHost, Number.isNaN(pendingPort) ? webServiceInfo.port : pendingPort);

  useEffect(() => {
    // Fetch version on mount
    dispatch(fetchWebServiceVersion());
    // Fetch active version on mount
    dispatch(fetchActiveVersion());
  }, [dispatch]);

  useEffect(() => {
    let disposed = false;

    const loadDependencyReadiness = async () => {
      try {
        const snapshot = await window.electronAPI.dependencyManagement.refresh();
        if (!disposed) {
          setDependencyReadiness(evaluateDependencyReadiness(snapshot, [npmInstallableAgentCliPackages[0]?.id].filter(Boolean)));
          setDependencyReadinessError(null);
        }
      } catch (error) {
        if (!disposed) {
          setDependencyReadiness(null);
          setDependencyReadinessError(error instanceof Error ? error.message : String(error));
        }
      }
    };

    if (isStopped) {
      void loadDependencyReadiness();
    }

    return () => {
      disposed = true;
    };
  }, [isStopped]);

  // Re-sync the stopped-state editor when main-process status changes.
  useEffect(() => {
    const persistedHost = webServiceInfo.host || DEFAULT_WEB_SERVICE_HOST;
    const preset = resolveListenHostPreset(persistedHost);

    setPortInputValue((webServiceInfo.port || DEFAULT_WEB_SERVICE_PORT).toString());
    setSelectedListenPreset(preset);
    setCustomListenHost(preset === 'custom' ? persistedHost : '');
    setNetworkConfigError(null);
  }, [webServiceInfo.host, webServiceInfo.port]);

  useEffect(() => {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
      return;
    }

    globalThis.localStorage.setItem(AUTO_START_CODE_SERVER_STORAGE_KEY, String(autoStartCodeServer));
  }, [autoStartCodeServer]);

  useEffect(() => {
    if (typeof globalThis === 'undefined' || !('localStorage' in globalThis)) {
      return;
    }

    globalThis.localStorage.setItem(AUTO_START_OMNIROUTE_STORAGE_KEY, String(autoStartOmniRoute));
  }, [autoStartOmniRoute]);

  const persistNetworkConfig = async () => {
    const port = parseInt(portInputValue, 10);
    const candidateHost = selectedListenPreset === 'custom' ? customListenHost.trim() : selectedListenPreset;
    const normalizedHost = normalizeListenHost(candidateHost);

    if (!normalizedHost) {
      setNetworkConfigError(t('webServiceStatus.listenAddress.customError') as string);
      return false;
    }

    if (Number.isNaN(port)) {
      setNetworkConfigError(t('webServiceStatus.portError.invalid') as string);
      return false;
    }

    if (port < 1024 || port > 65535) {
      setNetworkConfigError(t('webServiceStatus.portError.range') as string);
      return false;
    }

    const result = await dispatch(updateWebServiceConfig({ host: normalizedHost, port })).unwrap();
    if (result.success) {
      setNetworkConfigError(null);
      return true;
    }

    return false;
  };

  const flushPendingNetworkConfig = async () => {
    if (debounceSaveTimeoutRef.current) {
      clearTimeout(debounceSaveTimeoutRef.current);
      debounceSaveTimeoutRef.current = null;
    }

    if (!isNetworkConfigDirty) {
      return true;
    }

    return await persistNetworkConfig();
  };

  const handleStart = async () => {
    if (!dependencyReadiness?.environmentAvailable || !dependencyReadiness?.requiredReady) {
      dispatch(switchViewWithSideEffects('dependency-management'));
      return;
    }

    const saveSucceeded = await flushPendingNetworkConfig();
    if (!saveSucceeded) {
      return;
    }

    const ensureCodeServerStarted = async () => {
      try {
        const status = await window.electronAPI.codeServer.getStatus();
        if (status.status === 'running') {
          return;
        }

        if (!status.pm2Available || status.runtime.installStatus !== 'installed') {
          toast.error(t('webServiceStatus.managedStartup.errors.codeServerUnavailable'));
          return;
        }

        const result = await window.electronAPI.codeServer.start();
        if (!result.success) {
          toast.error(t('webServiceStatus.managedStartup.errors.codeServerStartFailed'));
        }
      } catch {
        toast.error(t('webServiceStatus.managedStartup.errors.codeServerStartFailed'));
      }
    };

    const ensureOmniRouteStarted = async () => {
      try {
        const status = await window.electronAPI.omniroute.getStatus();
        if (status.status === 'running') {
          return;
        }

        if (!status.pm2Available || status.runtime.installStatus !== 'installed') {
          toast.error(t('webServiceStatus.managedStartup.errors.omnirouteUnavailable'));
          return;
        }

        const result = await window.electronAPI.omniroute.start();
        if (!result.success) {
          toast.error(t('webServiceStatus.managedStartup.errors.omnirouteStartFailed'));
        }
      } catch {
        toast.error(t('webServiceStatus.managedStartup.errors.omnirouteStartFailed'));
      }
    };

    const startHagicodePromise = dispatch(startWebService());
    const managedStartupTasks = [
      ...(autoStartCodeServer ? [ensureCodeServerStarted()] : []),
      ...(autoStartOmniRoute ? [ensureOmniRouteStarted()] : []),
    ];

    await Promise.allSettled([startHagicodePromise, ...managedStartupTasks]);
  };

  const handleStop = async () => {
    dispatch(stopWebService());
  };

  const handleRestart = async () => {
    dispatch(restartWebService());
  };

  const handleOpenHagicode = async () => {
    const url = webServiceInfo.url;
    if (url) {
      try {
        await window.electronAPI.openHagicodeInApp(url);
      } catch (error) {
        console.error('Failed to open Hagicode in app:', error);
      }
    }
  };

  const handleOpenInBrowser = async () => {
    const url = webServiceInfo.url;
    if (url) {
      try {
        await window.electronAPI.openExternal(url);
      } catch (error) {
        console.error('Failed to open URL in browser:', error);
      }
    }
  };

  const handleResetNetworkConfig = () => {
    if (debounceSaveTimeoutRef.current) {
      clearTimeout(debounceSaveTimeoutRef.current);
      debounceSaveTimeoutRef.current = null;
    }

    const persistedHost = webServiceInfo.host || DEFAULT_WEB_SERVICE_HOST;
    const preset = resolveListenHostPreset(persistedHost);

    setPortInputValue((webServiceInfo.port || DEFAULT_WEB_SERVICE_PORT).toString());
    setSelectedListenPreset(preset);
    setCustomListenHost(preset === 'custom' ? persistedHost : '');
    setNetworkConfigError(null);
  };

  const getOpenLogsErrorMessage = (errorCode?: LogDirectoryErrorCode) => {
    switch (errorCode) {
      case 'no_active_version':
        return t('webServiceStatus.toast.noActiveVersion');
      case 'logs_not_found':
        return t('webServiceStatus.toast.logsNotFound');
      case 'open_failed':
      default:
        return t('webServiceStatus.toast.openLogsError');
    }
  };

  const handleOpenLogs = async () => {
    try {
      const result = await window.electronAPI.logDirectory.open(WEB_APP_LOG_DIRECTORY_TARGET);

      if (result.success) {
        toast.success(t('webServiceStatus.toast.openLogsSuccess'));
      } else {
        toast.error(getOpenLogsErrorMessage(result.error));
      }
    } catch (error) {
      console.error('Error opening logs folder:', error);
      toast.error(getOpenLogsErrorMessage('open_failed'));
    }
  };

  const handleOpenStartupFailure = () => {
    dispatch(showStartupFailureDialog());
  };

  const handleCloseStartupFailure = () => {
    dispatch(hideStartupFailureDialog());
  };

  const handleCopyStartupFailureLog = async () => {
    if (!startupFailure?.log) {
      toast.error(t('webServiceStatus.startupFailureDialog.copyEmpty'));
      return;
    }

    try {
      await writeTextToClipboard(startupFailure.log);
      toast.success(t('webServiceStatus.startupFailureDialog.copySuccess'));
    } catch (copyError) {
      console.error('Failed to copy startup failure log:', copyError);
      toast.error(t('webServiceStatus.startupFailureDialog.copyError'));
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

  useEffect(() => {
    if (!isStopped || !isNetworkConfigDirty) {
      return;
    }

    if (effectiveNetworkConfigError || isCustomListenHostMissing) {
      return;
    }

    debounceSaveTimeoutRef.current = setTimeout(() => {
      void persistNetworkConfig();
      debounceSaveTimeoutRef.current = null;
    }, 1000);

    return () => {
      if (debounceSaveTimeoutRef.current) {
        clearTimeout(debounceSaveTimeoutRef.current);
        debounceSaveTimeoutRef.current = null;
      }
    };
  }, [
    customListenHost,
    effectiveNetworkConfigError,
    isCustomListenHostMissing,
    isNetworkConfigDirty,
    isStopped,
    pendingPort,
    portInputValue,
    selectedListenPreset,
  ]);

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

  const statusBadgeClassName = cn(
    'text-sm px-3 py-1',
    webServiceInfo.status === 'running' && 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/10',
    webServiceInfo.status === 'stopped' && 'bg-muted text-muted-foreground border-border/60 hover:bg-muted',
    webServiceInfo.status === 'error' && 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/10',
  );

  const serviceDetailItems = [
    { label: t('webServiceStatus.details.serviceUrl'), value: webServiceInfo.url || 'N/A', primary: true },
    { label: t('webServiceStatus.details.listenAddress'), value: webServiceInfo.host || 'N/A' },
    { label: t('webServiceStatus.details.uptime'), value: formatUptime(webServiceInfo.uptime) },
    { label: t('webServiceStatus.details.restartCount'), value: webServiceInfo.restartCount.toString() },
    { label: t('webServiceStatus.details.port'), value: (webServiceInfo.port || 'N/A').toString() },
    { label: t('webServiceStatus.details.version') || 'Version', value: activeVersion?.version || 'N/A' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="relative overflow-hidden rounded-[24px] border-border/80 shadow-sm">
        <CardHeader className="pb-4">
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="space-y-2">
              <CardTitle className="flex items-center gap-2 text-lg">
                <motion.div>
                  <Server className={`w-5 h-5 ${isRunning ? 'text-primary' : ''}`} />
                </motion.div>
                {t('webServiceStatus.cardTitle')}
              </CardTitle>
              <CardDescription className="max-w-2xl text-sm leading-6">
                <motion.span
                  key={webServiceInfo.status}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {getStatusDescription(webServiceInfo.status)}
                </motion.span>
              </CardDescription>
            </div>

            <motion.div
              key={webServiceInfo.status}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="self-start rounded-xl border border-border/70 bg-muted/25 px-3 py-2"
            >
              <Badge variant={getStatusVariant(webServiceInfo.status)} className={statusBadgeClassName}>
                {getStatusText(webServiceInfo.status)}
              </Badge>
            </motion.div>
          </motion.div>
        </CardHeader>
        <CardContent className="space-y-5">
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl border border-border/70 bg-muted/20 p-4"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1 space-y-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {webServiceInfo.phaseMessage?.trim() || getStatusDescription(webServiceInfo.status)}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isRunning ? (webServiceInfo.url || 'N/A') : accessUrlPreview}
                  </p>
                </div>

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
                  ) : null}
                </AnimatePresence>
              </div>

              {!(isStopped && !canLaunchService) ? (
                <div className="w-full shrink-0 lg:w-[280px]">
                  <HagicodeActionButton
                    isRunning={isRunning}
                    isDisabled={isDisabled}
                    status={webServiceInfo.status}
                    canLaunchService={canLaunchService}
                    startLabel={isStopped && (!dependencyReadiness?.environmentAvailable || !dependencyReadiness?.requiredReady || dependencyReadinessError) ? t('webServiceStatus.dependencyReadinessButton') : undefined}
                    isWaitingForPort={isWaitingForPort}
                    waitingPort={webServiceInfo.port}
                    waitingPhaseMessage={webServiceInfo.phaseMessage}
                    onStart={handleStart}
                    onOpenApp={handleOpenHagicode}
                    onOpenBrowser={handleOpenInBrowser}
                  />
                </div>
              ) : null}
            </div>

            <AnimatePresence mode="wait">
              {(showRuntimeSecondaryControls || showOpenLogsButton) && (
                <motion.div
                  key="secondary-controls"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, delay: 0.1 }}
                  className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-4"
                >
                  {showRuntimeSecondaryControls && (
                    <>
                      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
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

                      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
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
                    </>
                  )}

                  {showOpenLogsButton && (
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
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
          </motion.div>

          {isStopped && (dependencyReadinessError || (dependencyReadiness && !dependencyReadiness.ready)) && canLaunchService && (
            <Alert>
              <Package className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p className="font-medium">{t('webServiceStatus.dependencyReadinessAlert.title')}</p>
                  <p className="text-sm">
                    {dependencyReadinessError || t('webServiceStatus.dependencyReadinessAlert.message')}
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {startupFailure && (
            <Button
              onClick={handleOpenStartupFailure}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              {t('webServiceStatus.startupFailureDialog.viewButton')}
            </Button>
          )}

          <Separator />

          {/* Local bind host + port configuration - only editable while stopped */}
          {!isRunning && (
            <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/25 p-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Settings className="h-4 w-4" />
                  <span>{t('webServiceStatus.listenAddress.label')}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('webServiceStatus.listenAddress.description')}
                </p>
              </div>

              <RadioGroup
                value={selectedListenPreset}
                onValueChange={(value) => {
                  setSelectedListenPreset(value as ListenHostPreset);
                  setNetworkConfigError(null);
                }}
                className="gap-3"
              >
                {[
                  {
                    value: 'localhost',
                    label: t('webServiceStatus.listenAddress.presets.localhost.label'),
                    description: t('webServiceStatus.listenAddress.presets.localhost.description'),
                  },
                  {
                    value: '127.0.0.1',
                    label: t('webServiceStatus.listenAddress.presets.loopback.label'),
                    description: t('webServiceStatus.listenAddress.presets.loopback.description'),
                  },
                  {
                    value: '0.0.0.0',
                    label: t('webServiceStatus.listenAddress.presets.wildcard.label'),
                    description: t('webServiceStatus.listenAddress.presets.wildcard.description'),
                  },
                  {
                    value: 'custom',
                    label: t('webServiceStatus.listenAddress.presets.custom.label'),
                    description: t('webServiceStatus.listenAddress.presets.custom.description'),
                  },
                ].map((option) => (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-background/80 p-3 transition-colors hover:border-primary/35"
                  >
                    <RadioGroupItem value={option.value} className="mt-0.5" />
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{option.label}</div>
                      <div className="text-xs text-muted-foreground">{option.description}</div>
                    </div>
                  </label>
                ))}
              </RadioGroup>

              {selectedListenPreset === 'custom' && (
                <div className="space-y-2">
                  <Label htmlFor="custom-listen-host">{t('webServiceStatus.listenAddress.customInputLabel')}</Label>
                  <Input
                    id="custom-listen-host"
                    type="text"
                    inputMode="numeric"
                    value={customListenHost}
                    onChange={(e) => {
                      setCustomListenHost(e.target.value);
                      setNetworkConfigError(null);
                    }}
                    placeholder={t('webServiceStatus.listenAddress.customPlaceholder') as string}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void flushPendingNetworkConfig();
                      } else if (e.key === 'Escape') {
                        handleResetNetworkConfig();
                      }
                    }}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="web-service-port">{t('webServiceStatus.details.port')}</Label>
                <Input
                  id="web-service-port"
                  type="number"
                  value={portInputValue}
                  onChange={(e) => {
                    setPortInputValue(e.target.value);
                    setNetworkConfigError(null);
                  }}
                  min={1024}
                  max={65535}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void flushPendingNetworkConfig();
                    } else if (e.key === 'Escape') {
                      handleResetNetworkConfig();
                    }
                  }}
                />
              </div>

              <div className="space-y-2 rounded-xl border border-dashed border-border/60 bg-background/80 p-3">
                <div className="text-xs text-muted-foreground">
                  {t('webServiceStatus.listenAddress.accessUrlPreviewLabel')}
                </div>
                <div className="break-all font-mono text-sm text-primary">{accessUrlPreview}</div>
                <div className="text-xs text-muted-foreground">
                  {normalizedPendingHost === '0.0.0.0'
                    ? t('webServiceStatus.listenAddress.wildcardHint')
                    : t('webServiceStatus.listenAddress.localOnlyHint')}
                </div>
              </div>

              <div className="space-y-4 rounded-xl border border-border/60 bg-background/80 p-4">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-foreground">{t('webServiceStatus.managedStartup.label')}</div>
                  <p className="text-xs text-muted-foreground">{t('webServiceStatus.managedStartup.description')}</p>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 p-3">
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-foreground">{t('webServiceStatus.managedStartup.options.codeServer.label')}</div>
                      <p className="text-xs text-muted-foreground">{t('webServiceStatus.managedStartup.options.codeServer.description')}</p>
                    </div>
                    <Switch checked={autoStartCodeServer} onCheckedChange={setAutoStartCodeServer} />
                  </div>

                  <div className="flex items-start justify-between gap-4 rounded-xl border border-border/60 bg-muted/20 p-3">
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-foreground">{t('webServiceStatus.managedStartup.options.omniroute.label')}</div>
                      <p className="text-xs text-muted-foreground">{t('webServiceStatus.managedStartup.options.omniroute.description')}</p>
                    </div>
                    <Switch checked={autoStartOmniRoute} onCheckedChange={setAutoStartOmniRoute} />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={handleResetNetworkConfig}
                  disabled={!isNetworkConfigDirty}
                >
                  {t('common:button.cancel')}
                </Button>
              </div>

              {effectiveNetworkConfigError && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">{effectiveNetworkConfigError}</AlertDescription>
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
                className="grid grid-cols-2 gap-3 rounded-2xl border border-border/60 bg-muted/25 p-4 md:grid-cols-3 xl:grid-cols-3"
              >
                {serviceDetailItems.map((item, index) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ y: -2 }}
                    className="rounded-xl border border-border/60 bg-background/80 p-3 transition-all cursor-default"
                  >
                    <div className="mb-1 text-xs text-muted-foreground">{item.label}</div>
                    <div className={`text-sm font-mono ${item.primary ? 'text-primary' : 'text-foreground'} break-all`}>
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

          <Dialog open={showStartupFailure} onOpenChange={(open) => {
            if (!open) {
              handleCloseStartupFailure();
            }
          }}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>{t('webServiceStatus.startupFailureDialog.title')}</DialogTitle>
                <DialogDescription>
                  {startupFailure?.summary || t('webServiceStatus.startupFailureDialog.emptySummary')}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-2">
                <div className="text-xs text-muted-foreground font-mono">
                  {startupFailure
                    ? t('webServiceStatus.startupFailureDialog.meta', {
                        port: startupFailure.port,
                        timestamp: startupFailure.timestamp,
                      })
                    : t('webServiceStatus.startupFailureDialog.emptyLog')}
                </div>
                <pre className="max-h-80 overflow-auto rounded-md border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap break-all">
                  {startupFailure?.log || t('webServiceStatus.startupFailureDialog.emptyLog')}
                </pre>
                {startupFailure?.truncated && (
                  <div className="text-xs text-muted-foreground">
                    {t('webServiceStatus.startupFailureDialog.truncatedHint')}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={handleCopyStartupFailureLog}>
                  {t('webServiceStatus.startupFailureDialog.copyButton')}
                </Button>
                <Button onClick={handleCloseStartupFailure}>
                  {t('webServiceStatus.startupFailureDialog.closeButton')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default WebServiceStatusCard;
