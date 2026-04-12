import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertCircle,
  Clipboard,
  Loader2,
  RefreshCw,
  Stethoscope,
  TerminalSquare,
} from 'lucide-react';
import type { SystemDiagnosticBridge, SystemDiagnosticResult } from '../../types/system-diagnostic.js';
import { writeTextToClipboard } from '../lib/clipboard.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

type DiagnosticPageStatus = 'idle' | 'loading' | 'ready' | 'error';

function getSystemDiagnosticBridge(): SystemDiagnosticBridge {
  return (window as Window & {
    electronAPI: {
      systemDiagnostic: SystemDiagnosticBridge;
    };
  }).electronAPI.systemDiagnostic;
}

function formatCompletedAt(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString();
}

export default function SystemDiagnosticPage() {
  const { t } = useTranslation('common');
  const [pageStatus, setPageStatus] = useState<DiagnosticPageStatus>('idle');
  const [result, setResult] = useState<SystemDiagnosticResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);

  useEffect(() => {
    let disposed = false;

    const loadCachedResult = async () => {
      try {
        const cached = await getSystemDiagnosticBridge().getLast();
        if (!disposed && cached) {
          setResult(cached);
          setPageStatus('ready');
        }
      } catch (error) {
        console.warn('[SystemDiagnosticPage] Failed to load cached diagnostic result:', error);
      }
    };

    void loadCachedResult();

    return () => {
      disposed = true;
    };
  }, []);

  const runDiagnostic = async () => {
    setPageStatus('loading');
    setErrorMessage(null);
    setResult(null);

    try {
      const nextResult = await getSystemDiagnosticBridge().run();
      setResult(nextResult);
      setPageStatus('ready');

      if (nextResult.summary.status === 'partial-failure') {
        toast.error(
          t('systemDiagnostic.toast.partialFailure', {
            count: nextResult.summary.errorCount,
          }),
        );
        return;
      }

      toast.success(t('systemDiagnostic.toast.success'));
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : String(error);
      setErrorMessage(nextMessage);
      setPageStatus('error');
      toast.error(t('systemDiagnostic.toast.runFailed', { error: nextMessage }));
    }
  };

  const handleCopy = async () => {
    if (!result) {
      return;
    }

    setIsCopying(true);
    try {
      await writeTextToClipboard(result.report);
      toast.success(t('systemDiagnostic.toast.copySuccess'));
    } catch (error) {
      const nextMessage = error instanceof Error ? error.message : String(error);
      toast.error(t('systemDiagnostic.toast.copyFailed', { error: nextMessage }));
    } finally {
      setIsCopying(false);
    }
  };

  const showResult = pageStatus === 'ready' && result;
  const showPartialFailure = result?.summary.status === 'partial-failure';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Card className="border-border/80 shadow-md">
        <CardHeader className="gap-4 pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-primary" />
                {t('systemDiagnostic.title')}
              </CardTitle>
              <CardDescription>{t('systemDiagnostic.description')}</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void runDiagnostic()}
                disabled={pageStatus === 'loading'}
              >
                {pageStatus === 'loading' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('systemDiagnostic.actions.running')}
                  </>
                ) : result ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {t('systemDiagnostic.actions.rerun')}
                  </>
                ) : (
                  <>
                    <Stethoscope className="mr-2 h-4 w-4" />
                    {t('systemDiagnostic.actions.run')}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => void handleCopy()}
                disabled={!result || pageStatus === 'loading' || isCopying}
              >
                {isCopying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('systemDiagnostic.actions.copying')}
                  </>
                ) : (
                  <>
                    <Clipboard className="mr-2 h-4 w-4" />
                    {t('systemDiagnostic.actions.copy')}
                  </>
                )}
              </Button>
            </div>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('systemDiagnostic.boundary.title')}</AlertTitle>
            <AlertDescription>{t('systemDiagnostic.boundary.description')}</AlertDescription>
          </Alert>
        </CardHeader>

        <CardContent className="space-y-4">
          {showResult && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
              <Badge variant={showPartialFailure ? 'secondary' : 'default'}>
                {showPartialFailure
                  ? t('systemDiagnostic.status.partialFailure')
                  : t('systemDiagnostic.status.success')}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {t('systemDiagnostic.summary.completedAt', {
                  value: formatCompletedAt(result.summary.completedAt),
                })}
              </span>
              <span className="text-sm text-muted-foreground">
                {t('systemDiagnostic.summary.issueCount', {
                  count: result.summary.errorCount,
                })}
              </span>
            </div>
          )}

          {pageStatus === 'loading' && (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">{t('systemDiagnostic.loading')}</p>
            </div>
          )}

          {pageStatus === 'error' && errorMessage && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t('systemDiagnostic.error.title')}</AlertTitle>
              <AlertDescription>{t('systemDiagnostic.error.description', { error: errorMessage })}</AlertDescription>
            </Alert>
          )}

          {showPartialFailure && result && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t('systemDiagnostic.partialFailure.title')}</AlertTitle>
              <AlertDescription>
                {t('systemDiagnostic.partialFailure.description', {
                  count: result.summary.errorCount,
                })}
              </AlertDescription>
            </Alert>
          )}

          {pageStatus === 'idle' && !result && (
            <div className="flex min-h-72 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center">
              <TerminalSquare className="h-10 w-10 text-primary/70" />
              <p className="max-w-2xl text-sm text-muted-foreground">{t('systemDiagnostic.empty')}</p>
            </div>
          )}

          {showResult && result && (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{t('systemDiagnostic.reportTitle')}</p>
                <p className="text-xs text-muted-foreground">{t('systemDiagnostic.reportDescription')}</p>
              </div>
              <ScrollArea className="h-[28rem] rounded-xl border border-border bg-black/[0.03] p-4">
                <pre className="font-mono text-sm leading-6 text-foreground whitespace-pre-wrap break-words">
                  {result.report}
                </pre>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
