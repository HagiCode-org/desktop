import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AgentCliType, getAllCliConfigs } from '../../../types/agent-cli';

interface StoredAgentCliSelection {
  cliType: AgentCliType | null;
  isSkipped: boolean;
  selectedAt: string | null;
}

declare global {
  interface Window {
    electronAPI: {
      agentCliSave: (data: { cliType: AgentCliType }) => Promise<{ success: boolean; error?: string }>;
      agentCliLoad: () => Promise<StoredAgentCliSelection>;
    };
  }
}

export function AgentCliSettings() {
  const { t, i18n } = useTranslation('pages');
  const { t: tAgent } = useTranslation('agent-cli');
  const [selectedCliType, setSelectedCliType] = useState<AgentCliType | null>(null);
  const [selectedAt, setSelectedAt] = useState<string | null>(null);
  const [isSkipped, setIsSkipped] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [savingCliType, setSavingCliType] = useState<AgentCliType | null>(null);

  const cliConfigs = useMemo(() => getAllCliConfigs(), []);

  useEffect(() => {
    const loadSelection = async () => {
      try {
        const stored = await window.electronAPI.agentCliLoad();
        setSelectedCliType(stored.cliType);
        setSelectedAt(stored.selectedAt);
        setIsSkipped(stored.isSkipped);
      } catch (error) {
        toast.error(t('settings.agentCli.messages.loadFailed', { error: String(error) }));
      } finally {
        setIsLoading(false);
      }
    };

    loadSelection();
  }, [t]);

  const handleSelect = async (cliType: AgentCliType) => {
    if (savingCliType || selectedCliType === cliType) {
      return;
    }

    setSavingCliType(cliType);
    try {
      const result = await window.electronAPI.agentCliSave({ cliType });
      if (!result.success) {
        throw new Error(result.error || 'unknown error');
      }
      setSelectedCliType(cliType);
      setSelectedAt(new Date().toISOString());
      setIsSkipped(false);
      const displayName = cliConfigs.find(item => item.cliType === cliType)?.displayName || cliType;
      toast.success(t('settings.agentCli.messages.saved', { name: displayName }));
    } catch (error) {
      toast.error(t('settings.agentCli.messages.saveFailed', { error: String(error) }));
    } finally {
      setSavingCliType(null);
    }
  };

  const getCurrentLabel = () => {
    if (selectedCliType) {
      return cliConfigs.find(item => item.cliType === selectedCliType)?.displayName || selectedCliType;
    }
    if (isSkipped) {
      return t('settings.agentCli.current.skipped');
    }
    return t('settings.agentCli.current.none');
  };

  const formatSelectedAt = (value: string | null) => {
    if (!value) {
      return '-';
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString(i18n.language);
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader>
        <CardTitle>{t('settings.agentCli.title')}</CardTitle>
        <CardDescription>{t('settings.agentCli.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{t('settings.agentCli.current.label')}</p>
            <Badge variant={selectedCliType ? 'default' : 'secondary'}>
              {getCurrentLabel()}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t('settings.agentCli.current.updatedAt', { value: formatSelectedAt(selectedAt) })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('settings.agentCli.notes.fallback')}
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-3">
            {cliConfigs.map(config => {
              const isSelected = selectedCliType === config.cliType;
              const isSaving = savingCliType === config.cliType;

              return (
                <div
                  key={config.cliType}
                  className={`rounded-lg border p-3 transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'bg-background'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {isSelected && <Check className="h-4 w-4 text-primary" />}
                        <p className="font-medium">{config.displayName}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">{config.description}</p>
                      <p className="text-xs text-muted-foreground">{config.package}</p>
                      {config.docsUrl && (
                        <a
                          href={config.docsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          {tAgent('viewDocs')}
                          <ChevronRight className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={isSelected ? 'secondary' : 'default'}
                      onClick={() => handleSelect(config.cliType)}
                      disabled={isSaving || Boolean(savingCliType)}
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t('settings.agentCli.actions.switching')}
                        </>
                      ) : isSelected ? (
                        t('settings.agentCli.actions.selected')
                      ) : (
                        t('settings.agentCli.actions.select')
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
