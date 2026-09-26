import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { ManagedNpmPackageDefinition } from '../../../types/dependency-management.js';
import {
  buildBatchInstallCommand,
  isBatchCommandShell,
  type BatchCommandShell,
} from './dependencyManagementPageModel.js';

interface BatchCommandDialogProps {
  open: boolean;
  definitions: ManagedNpmPackageDefinition[];
  registryUrl?: string | null;
  platform: string;
  onOpenChange: (open: boolean) => void;
}

export function BatchCommandDialog({
  open,
  definitions,
  registryUrl,
  platform,
  onOpenChange,
}: BatchCommandDialogProps) {
  const { t } = useTranslation('common');
  const [copied, setCopied] = useState(false);
  const [shell, setShell] = useState<BatchCommandShell>('cmd');
  const isWindows = platform.toLowerCase().includes('win');
  const command = buildBatchInstallCommand(definitions, registryUrl, platform, shell);

  useEffect(() => {
    if (open) {
      setShell('cmd');
      setCopied(false);
    }
  }, [open]);

  const copyCommand = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(command);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = command;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copiedToFallback = document.execCommand('copy');
        textarea.remove();
        if (!copiedToFallback) {
          throw new Error('Clipboard copy was not available');
        }
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('dependencyManagement.batch.dialogTitle', { ns: 'components' })}</DialogTitle>
          <DialogDescription>{t('dependencyManagement.batch.selectedCount', { count: definitions.length, ns: 'components' })}</DialogDescription>
        </DialogHeader>
        {isWindows ? (
          <div className="space-y-2">
            <Label id="batch-command-shell-label">{t('dependencyManagement.batch.shellSelectorLabel', { ns: 'components' })}</Label>
            <RadioGroup
              aria-labelledby="batch-command-shell-label"
              value={shell}
              onValueChange={(value) => {
                if (isBatchCommandShell(value)) {
                  setShell(value);
                }
              }}
              className="flex flex-wrap gap-4"
            >
              <Label htmlFor="batch-command-shell-cmd" className="flex cursor-pointer items-center gap-2">
                <RadioGroupItem id="batch-command-shell-cmd" value="cmd" />
                {t('dependencyManagement.batch.cmdShell', { ns: 'components' })}
              </Label>
              <Label htmlFor="batch-command-shell-powershell" className="flex cursor-pointer items-center gap-2">
                <RadioGroupItem id="batch-command-shell-powershell" value="powershell" />
                {t('dependencyManagement.batch.powershellShell', { ns: 'components' })}
              </Label>
            </RadioGroup>
            <p className="text-sm text-muted-foreground">
              {t('dependencyManagement.batch.destinationHint', {
                shell: t(shell === 'cmd' ? 'dependencyManagement.batch.cmdShell' : 'dependencyManagement.batch.powershellShell', { ns: 'components' }),
                ns: 'components',
              })}
            </p>
          </div>
        ) : null}
        <pre className="max-h-[60vh] select-text overflow-auto rounded-md border bg-muted/30 p-4 font-mono text-sm leading-6">{command}</pre>
        <DialogFooter>
          <Button type="button" onClick={() => void copyCommand()}>
            {copied ? `${t('dependencyManagement.batch.copy', { ns: 'components' })} ✓` : t('dependencyManagement.batch.copy', { ns: 'components' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
