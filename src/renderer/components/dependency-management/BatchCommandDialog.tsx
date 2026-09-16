import { useState } from 'react';
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

interface BatchCommandDialogProps {
  open: boolean;
  command: string;
  onOpenChange: (open: boolean) => void;
}

export function BatchCommandDialog({ open, command, onOpenChange }: BatchCommandDialogProps) {
  const { t } = useTranslation('common');
  const [copied, setCopied] = useState(false);

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
          <DialogDescription>{t('dependencyManagement.batch.selectedCount', { count: command.split('\n').length, ns: 'components' })}</DialogDescription>
        </DialogHeader>
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
