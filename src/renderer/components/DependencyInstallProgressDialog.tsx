import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { ScrollArea } from './ui/scroll-area';
import { Loader2, CheckCircle2, XCircle, Terminal, AlertCircle } from 'lucide-react';
import { selectInstallCommandProgress } from '../store/slices/dependencySlice';
import { useDispatch } from 'react-redux';
import { closeInstallCommandDialog } from '../store/slices/dependencySlice';
import { executeInstallCommands } from '../store/thunks/dependencyThunks';

export interface DependencyInstallProgressDialogProps {
  isOpen?: boolean;
  commands?: string[];
  checkCommand?: string;
  workingDirectory?: string;
  onClose?: () => void;
  onSuccess?: () => void;
  onFailure?: (error: string) => void;
  title?: string;
}

export function DependencyInstallProgressDialog({
  isOpen: externalIsOpen,
  commands: externalCommands,
  checkCommand: externalCheckCommand,
  workingDirectory,
  onClose,
  onSuccess,
  onFailure,
  title: customTitle,
}: DependencyInstallProgressDialogProps) {
  const { t } = useTranslation('pages');
  const dispatch = useDispatch();

  // Get progress state from Redux
  const progressState = useSelector(selectInstallCommandProgress);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Use external props if provided, otherwise use Redux state
  const isOpen = externalIsOpen ?? progressState.isOpen;
  const commands = externalCommands ?? progressState.commands;
  const checkCommand = externalCheckCommand ?? progressState.checkCommand;
  const isExecuting = progressState.isExecuting;
  const currentCommandIndex = progressState.currentCommandIndex;
  const logs = progressState.logs;
  const status = progressState.status;
  const error = progressState.error;
  const verificationPassed = progressState.verificationPassed;

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Calculate progress percentage
  const progressPercentage = commands.length > 0
    ? ((currentCommandIndex + 1) / commands.length) * 100
    : 0;

  // Handle dialog close - only call onSuccess/onFailure when user manually closes
  const handleClose = () => {
    if (isExecuting || status === 'verifying') return; // Prevent closing while executing or verifying

    dispatch(closeInstallCommandDialog());

    // Call callbacks only when user manually closes the dialog
    if (status === 'success') {
      onSuccess?.();
    } else if (status === 'error') {
      onFailure?.(error || 'Installation failed');
    }

    onClose?.();
  };

  // Handle retry
  const handleRetry = () => {
    if (commands.length > 0) {
      dispatch(executeInstallCommands({ commands, workingDirectory }));
    }
  };

  const title = customTitle || t('installProgressDialog.title');

  // Status display helper
  const getStatusDisplay = () => {
    switch (status) {
      case 'executing':
        return (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-muted-foreground">
              {t('installProgressDialog.executingCommand', {
                current: currentCommandIndex + 1,
                total: commands.length,
              })}
            </span>
          </>
        );
      case 'verifying':
        return (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <span className="text-blue-600 dark:text-blue-400">
              正在验证安装结果...
            </span>
          </>
        );
      case 'success':
        return (
          <>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-green-600 dark:text-green-400">
              {verificationPassed === true ? '安装成功并已验证' : t('installProgressDialog.status.success')}
            </span>
          </>
        );
      case 'error':
        return (
          <>
            <XCircle className="h-4 w-4 text-destructive" />
            <span className="text-destructive">
              {error || t('installProgressDialog.status.error')}
            </span>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {status === 'executing' && t('installProgressDialog.executing', {
              current: currentCommandIndex + 1,
              total: commands.length,
            })}
            {status === 'verifying' && '正在验证安装结果...'}
            {status === 'success' && t('installProgressDialog.status.success')}
            {status === 'error' && t('installProgressDialog.status.error')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Command execution status */}
          <div className="flex items-center gap-2 text-sm">
            {getStatusDisplay()}
          </div>

          {/* Verification result indicator */}
          {status === 'success' && verificationPassed !== undefined && (
            <div className={`flex items-center gap-2 text-sm p-3 rounded-md ${
              verificationPassed
                ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300'
            }`}>
              {verificationPassed ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <span>
                {verificationPassed
                  ? '验证通过：依赖已成功安装'
                  : '无法自动验证安装结果，请手动确认'}
              </span>
            </div>
          )}

          {/* Current command display */}
          {commands.length > 0 && currentCommandIndex < commands.length && status === 'executing' && (
            <div className="rounded-md bg-muted p-3">
              <div className="text-xs font-medium text-muted-foreground mb-1">
                {t('installProgressDialog.currentCommand')}
              </div>
              <code className="text-sm break-all font-mono">
                {commands[currentCommandIndex]}
              </code>
            </div>
          )}

          {/* Progress bar */}
          {(status === 'executing' || status === 'verifying') && (
            <Progress value={progressPercentage} className="h-2" />
          )}

          {/* Logs section */}
          {logs.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">
                {t('installProgressDialog.logs')}
              </div>
              <ScrollArea className="h-48 w-full rounded-md border bg-background">
                <div ref={logContainerRef} className="p-3 space-y-1 font-mono text-xs">
                  {logs.map((log, index) => (
                    <div
                      key={index}
                      className={
                        log.type === 'error'
                          ? 'text-destructive'
                          : log.type === 'warning'
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : log.type === 'success'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-foreground'
                      }
                    >
                      {log.message}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={handleClose}
            disabled={isExecuting || status === 'verifying'}
            variant={status === 'error' ? 'outline' : 'default'}
          >
            {(isExecuting || status === 'verifying')
              ? status === 'verifying' ? '验证中...' : t('installProgressDialog.status.executing')
              : t('installProgressDialog.buttons.close')}
          </Button>
          {status === 'error' && (
            <Button onClick={handleRetry} variant="default">
              {t('installProgressDialog.buttons.retry')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default DependencyInstallProgressDialog;
