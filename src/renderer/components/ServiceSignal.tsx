import type { ProcessStatus } from '../store/slices/webServiceSlice';
import { cn } from '@/lib/utils';

/**
 * The home page's one living element: the service's pulse.
 *
 * `ServiceSignalLine` is a 2px edge on top of the status card. `ServiceStatusDot` is the same
 * signal at badge size. Both are pure CSS (transform/opacity only), so they cost no JS per
 * frame, and both collapse to a static state under prefers-reduced-motion (see index.css).
 */

type SignalMode = 'idle' | 'live' | 'working' | 'fault';

function resolveSignalMode(status: ProcessStatus, isBusy: boolean): SignalMode {
  if (status === 'error') return 'fault';
  if (status === 'starting' || status === 'stopping' || isBusy) return 'working';
  if (status === 'running') return 'live';
  return 'idle';
}

interface ServiceSignalProps {
  status: ProcessStatus;
  /** True while a check or an operation is in flight even though `status` has not changed yet. */
  isBusy?: boolean;
}

export function ServiceSignalLine({ status, isBusy = false }: ServiceSignalProps) {
  const mode = resolveSignalMode(status, isBusy);

  return (
    <div
      aria-hidden
      data-signal-line={mode}
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden transition-colors duration-500',
        mode === 'live' && 'bg-primary/15',
        mode === 'working' && 'bg-primary/10',
        mode === 'fault' && 'bg-destructive/50',
      )}
    >
      {mode === 'live' || mode === 'working' ? (
        <span
          className={cn(
            'service-signal-sweep absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-primary to-transparent',
            mode === 'working' && 'service-signal-sweep-fast',
          )}
        />
      ) : null}
    </div>
  );
}

export function ServiceStatusDot({ status, isBusy = false }: ServiceSignalProps) {
  const mode = resolveSignalMode(status, isBusy);

  return (
    <span aria-hidden data-signal-dot={mode} className="relative mr-2 inline-flex h-2 w-2 shrink-0">
      {mode === 'live' || mode === 'working' ? (
        <span
          className={cn(
            'service-signal-ring absolute inset-0 rounded-full bg-current',
            mode === 'working' && 'service-signal-ring-fast',
          )}
        />
      ) : null}
      <span
        className={cn(
          'relative h-2 w-2 rounded-full bg-current transition-opacity duration-300',
          mode === 'idle' && 'opacity-40',
        )}
      />
    </span>
  );
}
