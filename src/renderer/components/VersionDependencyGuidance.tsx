import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot } from 'lucide-react';
import type { PromptGuidanceResponse } from '../../types/prompt-guidance.js';
import { PromptGuidancePanel } from './prompt-guidance';

interface VersionDependencyGuidanceProps {
  versionId: string;
}

declare global {
  interface Window {
    electronAPI: {
      llmGetVersionPromptGuidance: (
        versionId: string,
        region?: 'cn' | 'international',
      ) => Promise<PromptGuidanceResponse>;
    };
  }
}

export function VersionDependencyGuidance({ versionId }: VersionDependencyGuidanceProps) {
  const { t } = useTranslation('pages');
  const [selectedRegion, setSelectedRegion] = useState<'cn' | 'international'>('cn');
  const [status, setStatus] = useState<'idle' | 'loading' | 'resolved'>('idle');
  const [guidance, setGuidance] = useState<PromptGuidanceResponse | null>(null);

  const loadGuidance = useCallback(async () => {
    setStatus('loading');
    try {
      const nextGuidance = await window.electronAPI.llmGetVersionPromptGuidance(versionId, selectedRegion);
      setGuidance(nextGuidance);
    } finally {
      setStatus('resolved');
    }
  }, [selectedRegion, versionId]);

  useEffect(() => {
    void loadGuidance();
  }, [loadGuidance]);

  return (
    <div className="mb-3 space-y-3 rounded-lg border border-primary/20 bg-primary/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            {t('versionManagement.aiGuidance.title')}
          </span>
        </div>

        <select
          value={selectedRegion}
          onChange={(event) => setSelectedRegion(event.target.value as 'cn' | 'international')}
          disabled={status === 'loading'}
          className="rounded-md border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        >
          <option value="cn">{t('versionManagement.aiGuidance.region.cn')}</option>
          <option value="international">{t('versionManagement.aiGuidance.region.international')}</option>
        </select>
      </div>

      <p className="text-xs text-muted-foreground">
        {t('versionManagement.aiGuidance.description')}
      </p>

      <PromptGuidancePanel
        title={t('versionManagement.aiGuidance.panelTitle')}
        description={t('versionManagement.aiGuidance.panelDescription')}
        guidance={guidance}
        status={status}
        onRefresh={loadGuidance}
        compact
      />
    </div>
  );
}

export default VersionDependencyGuidance;
