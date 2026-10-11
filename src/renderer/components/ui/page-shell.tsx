import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageShellProps {
  children: ReactNode;
  className?: string;
}

/**
 * Outer frame for every sidebar view. It owns the content width and the
 * vertical rhythm, and it is a size container so panels inside can switch
 * layout on the space the sidebar leaves them (`@4xl:`) instead of the window.
 */
export function PageShell({ children, className }: PageShellProps) {
  return <div className={cn('@container mx-auto w-full max-w-7xl space-y-4', className)}>{children}</div>;
}
