import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertCircle,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Loader2,
  RefreshCw,
  Sparkles,
  TerminalSquare,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { PromptGuidanceResponse } from '../../../types/prompt-guidance.js';
import { writeTextToClipboard } from '../../lib/clipboard.js';
import {
  copyPromptContent,
  formatPromptGuidanceError,
  orderPromptGuidanceTools,
} from './promptGuidanceModel.js';

type PromptGuidanceStatus = 'idle' | 'loading' | 'resolved';

interface PromptGuidancePanelProps {
  title: string;
  description: string;
  guidance: PromptGuidanceResponse | null;
  status: PromptGuidanceStatus;
  onRefresh: () => Promise<void> | void;
  compact?: boolean;
}

declare global {
  interface Window {
    electronAPI: {
      openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}

export function PromptGuidancePanel({
  title,
  description,
  guidance,
  status,
  onRefresh,
  compact = false,
}: PromptGuidancePanelProps) {
  const { t } = useTranslation('prompt-guidance');
  const [isCopying, setIsCopying] = useState(false);
  const [isOpeningDocs, setIsOpeningDocs] = useState<string | null>(null);

  const orderedTools = useMemo(() => {
    if (!guidance) {
      return [];
    }
    return orderPromptGuidanceTools(guidance.supportedTools);
  }, [guidance]);

  const steps = useMemo(() => [
    t('steps.openTool'),
    t('steps.copyPrompt'),
    guidance?.suggestedWorkingDirectory
      ? t('steps.runFromDirectory', { path: guidance.suggestedWorkingDirectory })
      : t('steps.runFromCurrentDirectory'),
    t('steps.returnToDesktop'),
  ], [guidance?.suggestedWorkingDirectory, t]);

  const guidanceErrorMessage = guidance && !guidance.success
    ? formatPromptGuidanceError(guidance, {
        defaultMessage: t('errors.defaultMessage'),
        promptNotFound: t('errors.promptNotFound'),
        resolverUnavailable: t('errors.resolverUnavailable'),
        managerUnavailable: t('errors.managerUnavailable'),
        promptLoadFailed: t('errors.promptLoadFailed'),
        promptReadFailed: t('errors.promptReadFailed'),
        diagnosticPrefix: t('errors.diagnosticPrefix'),
      })
    : null;

  const handleCopy = async () => {
    if (!guidance || !guidance.success) {
      toast.error(t('copy.failed'));
      return;
    }

    setIsCopying(true);
    const result = await copyPromptContent(guidance.promptContent, writeTextToClipboard);
    setIsCopying(false);

    if (result.success) {
      toast.success(t('copy.success'));
    } else {
      toast.error(result.error ? t('copy.failedWithReason', { error: result.error }) : t('copy.failed'));
    }
  };

  const handleOpenDocs = async (url: string, cliType: string) => {
    setIsOpeningDocs(cliType);
    const result = await window.electronAPI.openExternal(url);
    setIsOpeningDocs(null);

    if (!result.success) {
      toast.error(result.error || t('docs.failed'));
    }
  };

  return (
    <Card className={compact ? 'border-border/80 shadow-sm' : 'border-border/80 shadow-md'}>
      <CardHeader className={compact ? 'pb-3' : 'pb-4'}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onRefresh()}
            disabled={status === 'loading'}
          >
            {status === 'loading' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('actions.loading')}
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('actions.refresh')}
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {status === 'loading' && (
          <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed border-border bg-muted/20">
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {t('loading')}
            </div>
          </div>
        )}

        {status === 'idle' && !guidance && (
          <div className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center">
            <TerminalSquare className="h-10 w-10 text-primary/70" />
            <p className="max-w-xl text-sm text-muted-foreground">{t('emptyState')}</p>
          </div>
        )}

        {guidance && (
          <>
            <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{t('availableTools')}</span>
                {orderedTools.map((tool) => (
                  <Badge key={tool.cliType} variant="secondary">
                    {tool.displayName}
                  </Badge>
                ))}
              </div>

              <ol className="grid gap-2 text-sm text-muted-foreground">
                {steps.map((step, index) => (
                  <li key={step} className="flex gap-3">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {guidance.success ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t('promptTitle')}</p>
                    <p className="text-xs text-muted-foreground">{t('promptDescription')}</p>
                  </div>
                  <Button size="sm" onClick={() => void handleCopy()} disabled={isCopying}>
                    {isCopying ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('copy.copying')}
                      </>
                    ) : (
                      <>
                        <Clipboard className="mr-2 h-4 w-4" />
                        {t('copy.button')}
                      </>
                    )}
                  </Button>
                </div>

                <ScrollArea className="h-72 rounded-xl border border-border bg-black/[0.03] p-4">
                  <pre className="font-mono text-sm leading-6 text-foreground whitespace-pre-wrap break-words">
                    {guidance.promptContent}
                  </pre>
                </ScrollArea>
              </div>
            ) : (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{t('errors.title')}</AlertTitle>
                <AlertDescription>{guidanceErrorMessage}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="rounded-xl border border-border/70 bg-background/70 p-4 text-sm">
                <div className="grid gap-2 text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">{t('metadata.source')}</span>{' '}
                    {guidance.success ? t(`sources.${guidance.promptSource}`) : t('metadata.unavailable')}
                  </p>
                  {guidance.success && (
                    <p className="break-all">
                      <span className="font-medium text-foreground">{t('metadata.promptPath')}</span>{' '}
                      {guidance.promptPath}
                    </p>
                  )}
                  <p>
                    <span className="font-medium text-foreground">{t('metadata.activeVersion')}</span>{' '}
                    {guidance.activeVersion || t('metadata.unavailable')}
                  </p>
                  <p className="break-all">
                    <span className="font-medium text-foreground">{t('metadata.workingDirectory')}</span>{' '}
                    {guidance.suggestedWorkingDirectory || t('metadata.unavailable')}
                  </p>
                </div>

                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-medium text-foreground">
                    {t('metadata.attemptedPaths')}
                  </summary>
                  <ul className="mt-2 grid gap-1 text-xs text-muted-foreground">
                    {guidance.attemptedPaths.map((attemptedPath) => (
                      <li key={attemptedPath} className="break-all rounded-md bg-muted/40 px-2 py-1">
                        {attemptedPath}
                      </li>
                    ))}
                  </ul>
                </details>
              </div>

              <div className="flex flex-col gap-2">
                {orderedTools
                  .filter((tool) => tool.docsUrl)
                  .map((tool) => (
                    <Button
                      key={tool.cliType}
                      variant="outline"
                      onClick={() => void handleOpenDocs(tool.docsUrl!, tool.cliType)}
                      disabled={isOpeningDocs === tool.cliType}
                    >
                      {isOpeningDocs === tool.cliType ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ExternalLink className="mr-2 h-4 w-4" />
                      )}
                      {t('docs.button', { tool: tool.displayName })}
                    </Button>
                  ))}
              </div>
            </div>

            {guidance.success && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>{t('tipTitle')}</AlertTitle>
                <AlertDescription>{t('tipDescription')}</AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default PromptGuidancePanel;
