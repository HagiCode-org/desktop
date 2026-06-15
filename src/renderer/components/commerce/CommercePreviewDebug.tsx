import { useEffect, useRef, useState } from 'react';
import { useTranslation, type TFunction } from 'react-i18next';
import { Eye, Monitor, ShieldCheck, Store } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/lib/utils';

const COMMERCE_PREVIEW_STORAGE_KEY = 'hagicode-commerce-preview-scenario';
const COMMERCE_PREVIEW_EVENT = 'hagicode-commerce-preview-change';
const TITLE_TAP_COUNT = 5;
const TITLE_TAP_RESET_MS = 1400;

export type CommercePreviewScenario = 'live' | 'non-store' | 'inactive' | 'active';

const commercePreviewScenarios: CommercePreviewScenario[] = ['live', 'non-store', 'inactive', 'active'];

function readCommercePreviewScenario(): CommercePreviewScenario {
  if (typeof window === 'undefined') {
    return 'live';
  }

  const value = window.sessionStorage.getItem(COMMERCE_PREVIEW_STORAGE_KEY);
  return commercePreviewScenarios.includes(value as CommercePreviewScenario)
    ? value as CommercePreviewScenario
    : 'live';
}

function writeCommercePreviewScenario(next: CommercePreviewScenario) {
  if (typeof window === 'undefined') {
    return;
  }

  if (next === 'live') {
    window.sessionStorage.removeItem(COMMERCE_PREVIEW_STORAGE_KEY);
  } else {
    window.sessionStorage.setItem(COMMERCE_PREVIEW_STORAGE_KEY, next);
  }

  window.dispatchEvent(new CustomEvent(COMMERCE_PREVIEW_EVENT, { detail: next }));
}

export function getCommercePreviewScenarioLabel(t: TFunction, scenario: CommercePreviewScenario): string {
  switch (scenario) {
    case 'non-store':
      return t('system.commercePanel.debug.modes.nonStore');
    case 'inactive':
      return t('system.commercePanel.debug.modes.inactive');
    case 'active':
      return t('system.commercePanel.debug.modes.active');
    default:
      return t('system.commercePanel.debug.modes.live');
  }
}

export function useCommercePreviewDebug() {
  const [scenario, setScenario] = useState<CommercePreviewScenario>(() => readCommercePreviewScenario());
  const [dialogOpen, setDialogOpen] = useState(false);
  const tapCountRef = useRef(0);
  const tapResetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const syncScenario = () => {
      setScenario(readCommercePreviewScenario());
    };

    const handleCustomSync = () => {
      syncScenario();
    };

    window.addEventListener(COMMERCE_PREVIEW_EVENT, handleCustomSync);
    window.addEventListener('storage', syncScenario);

    return () => {
      window.removeEventListener(COMMERCE_PREVIEW_EVENT, handleCustomSync);
      window.removeEventListener('storage', syncScenario);

      if (tapResetTimerRef.current !== null) {
        window.clearTimeout(tapResetTimerRef.current);
      }
    };
  }, []);

  const updateScenario = (next: CommercePreviewScenario) => {
    writeCommercePreviewScenario(next);
    setScenario(next);
  };

  const handleDebugTitleClick = () => {
    tapCountRef.current += 1;

    if (tapResetTimerRef.current !== null) {
      window.clearTimeout(tapResetTimerRef.current);
    }

    if (tapCountRef.current >= TITLE_TAP_COUNT) {
      tapCountRef.current = 0;
      setDialogOpen(true);
      return;
    }

    tapResetTimerRef.current = window.setTimeout(() => {
      tapCountRef.current = 0;
      tapResetTimerRef.current = null;
    }, TITLE_TAP_RESET_MS);
  };

  return {
    dialogOpen,
    handleDebugTitleClick,
    isPreviewing: scenario !== 'live',
    scenario,
    setDialogOpen,
    setScenario: updateScenario,
  };
}

interface CommercePreviewDebugDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenario: CommercePreviewScenario;
  onScenarioChange: (scenario: CommercePreviewScenario) => void;
}

export function CommercePreviewDebugDialog({
  open,
  onOpenChange,
  scenario,
  onScenarioChange,
}: CommercePreviewDebugDialogProps) {
  const { t } = useTranslation('common');

  const options: Array<{
    description: string;
    icon: typeof Eye;
    value: CommercePreviewScenario;
  }> = [
    {
      description: t('system.commercePanel.debug.descriptions.live'),
      icon: Eye,
      value: 'live',
    },
    {
      description: t('system.commercePanel.debug.descriptions.nonStore'),
      icon: Monitor,
      value: 'non-store',
    },
    {
      description: t('system.commercePanel.debug.descriptions.inactive'),
      icon: Store,
      value: 'inactive',
    },
    {
      description: t('system.commercePanel.debug.descriptions.active'),
      icon: ShieldCheck,
      value: 'active',
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl border-border/80 p-0 shadow-xl">
        <div className="border-b border-border/70 px-6 py-5">
          <DialogHeader className="text-left">
            <DialogTitle>{t('system.commercePanel.debug.title')}</DialogTitle>
            <DialogDescription className="pt-2 text-sm leading-6">
              {t('system.commercePanel.debug.description')}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 py-5">
          <RadioGroup value={scenario} onValueChange={(value) => onScenarioChange(value as CommercePreviewScenario)} className="space-y-3">
            {options.map(({ description, icon: Icon, value }) => (
              <Label
                key={value}
                htmlFor={`commerce-preview-${value}`}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-2xl border border-border/70 px-4 py-4 transition-colors',
                  scenario === value ? 'border-primary/50 bg-accent/40' : 'bg-background/60 hover:bg-muted/40',
                )}
              >
                <RadioGroupItem id={`commerce-preview-${value}`} value={value} className="mt-0.5" />
                <div className="rounded-xl border border-border/70 bg-background/90 p-2">
                  <Icon className="h-4 w-4 text-foreground" />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {getCommercePreviewScenarioLabel(t, value)}
                    </span>
                    {scenario === value ? (
                      <Badge variant="secondary" className="rounded-full px-2 py-0.5 text-[11px]">
                        {t('status.info')}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">{description}</p>
                </div>
              </Label>
            ))}
          </RadioGroup>
        </div>

        <DialogFooter className="border-t border-border/70 bg-muted/[0.14] px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('button.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
