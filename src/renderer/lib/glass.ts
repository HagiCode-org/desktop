/**
 * Glassmorphism utility classes for theme-aware glass effects
 * These classes work seamlessly with both light and dark themes
 *
 * Usage:
 *   import { cn } from '@/lib/utils';
 *   import { glassCard, glassButton, glassInput } from '@/lib/glass';
 *
 *   <Card className={cn(glassCard.base, glassCard.hover)}>
 *     <CardContent>...</CardContent>
 *   </Card>
 */

/**
 * Glass card variants
 * @example
 * className={cn(glassCard.base, glassCard.hover)}
 */
export const glassCard = {
  /** Base glass card styles */
  base: `
    bg-glass-bg backdrop-blur-glass
    border border-glass-border
    shadow-glass
    transition-all duration-300 ease-out
  `,

  /** Hover effect with elevated shadow */
  hover: `
    hover:shadow-glass-lg
    hover:border-glass-border/80
  `,

  /** Interactive card with scale effect */
  interactive: `
    hover:shadow-glass-hover
    hover:scale-[1.01]
    active:scale-[0.99]
  `,

  /** Card with inner glow effect */
  glow: `
    relative overflow-hidden
    before:absolute before:inset-0
    before:bg-gradient-to-br
    before:from-glass-highlight
    before:to-transparent
    before:pointer-events-none
  `,
};

/**
 * Glass button variants
 * @example
 * className={cn(glassButton.base, glassButton.primary)}
 */
export const glassButton = {
  /** Base glass button styles */
  base: `
    relative overflow-hidden
    backdrop-blur-glass
    border transition-all duration-200
    disabled:opacity-50 disabled:cursor-not-allowed
  `,

  /** Primary glass button */
  primary: `
    bg-primary/90 hover:bg-primary
    border-primary/30
    text-primary-foreground
    hover:shadow-lg hover:shadow-primary/20
    hover:scale-[1.02] active:scale-[0.98]
  `,

  /** Secondary glass button */
  secondary: `
    bg-glass-bg
    border-glass-border
    text-foreground
    hover:bg-accent
    hover:scale-[1.02] active:scale-[0.98]
  `,

  /** Ghost glass button */
  ghost: `
    bg-transparent
    border-transparent
    text-muted-foreground
    hover:bg-accent/50
    hover:text-foreground
  `,

  /** Shimmer effect button */
  shimmer: `
    after:content-[''] after:absolute after:inset-0
    after:bg-gradient-to-r after:from-transparent
    after:via-white/10 after:to-transparent
    after:-translate-x-full after:animate-shimmer
  `,
};

/**
 * Glass input variants
 * @example
 * className={cn(glassInput.base)}
 */
export const glassInput = {
  /** Base glass input styles */
  base: `
    bg-glass-bg/50 backdrop-blur-glass
    border-glass-border
    focus:border-ring focus:ring-2 focus:ring-ring/20
    transition-all duration-200
    placeholder:text-muted-foreground
  `,

  /** With floating label style */
  floating: `
    peer
    pt-6
  `,
};

/**
 * Glass badge styles
 * @example
 * className={cn(glassBadge.base, glassBadge.success)}
 */
export const glassBadge = {
  /** Base glass badge styles */
  base: `
    backdrop-blur-glass
    border transition-all duration-200
  `,

  /** Default badge */
  default: `
    bg-glass-bg border-glass-border
    text-foreground
  `,

  /** Success badge */
  success: `
    bg-primary/20 border-primary/30
    text-primary
  `,

  /** Warning badge */
  warning: `
    bg-yellow-500/20 border-yellow-500/30
    text-yellow-500 dark:text-yellow-400
  `,

  /** Error badge */
  error: `
    bg-destructive/20 border-destructive/30
    text-destructive
  `,

  /** Info badge */
  info: `
    bg-blue-500/20 border-blue-500/30
    text-blue-500 dark:text-blue-400
  `,
};

/**
 * Glass sidebar styles
 * @example
 * className={cn(glassSidebar.base)}
 */
export const glassSidebar = {
  /** Base glass sidebar styles */
  base: `
    bg-glass-bg backdrop-blur-glass
    border-r border-glass-border
    transition-all duration-300
  `,

  /** Navigation item styles */
  navItem: `
    relative overflow-hidden
    rounded-lg transition-all duration-200
  `,

  /** Active navigation item */
  navItemActive: `
    bg-primary/20 backdrop-blur-sm
    border border-primary/30
    shadow-lg shadow-primary/10
  `,

  /** Hover state for navigation items */
  navItemHover: `
    hover:bg-accent/50 hover:backdrop-blur-sm
    hover:border-accent/30
  `,
};

/**
 * Glass status indicator styles
 * @example
 * className={cn(glassStatus.indicator, glassStatus.pulse)}
 */
export const glassStatus = {
  /** Base status indicator */
  indicator: `
    relative inline-flex items-center gap-2
    px-3 py-1.5 rounded-full
    backdrop-blur-glass border
  `,

  /** Pulsing glow effect */
  pulse: `
    after:content-[''] after:absolute
    after:inset-0 after:rounded-full
    after:animate-ping after:opacity-75
  `,

  /** Running state */
  running: `
    bg-primary/10 border-primary/30
    text-primary
    after:bg-primary/20
  `,

  /** Stopped state */
  stopped: `
    bg-muted/50 border-muted-foreground/20
    text-muted-foreground
  `,

  /** Error state */
  error: `
    bg-destructive/10 border-destructive/30
    text-destructive
    after:bg-destructive/20
  `,
};

/**
 * Glass overlay/backdrop styles
 * @example
 * className={cn(glassOverlay.base)}
 */
export const glassOverlay = {
  /** Base overlay styles */
  base: `
    fixed inset-0
    bg-glass-bg/80 backdrop-blur-glass
    transition-opacity duration-300
  `,

  /** Modal overlay */
  modal: `
    z-50
    flex items-center justify-center
    p-4
  `,

  /** Loading overlay */
  loading: `
    z-50
    flex items-center justify-center
  `,
};

/**
 * Animation easing presets
 */
export const easing = {
  /** Smooth ease-out for entering elements */
  easeOut: [0.25, 0.1, 0.25, 1],

  /** Bouncy ease for spring-like effects */
  spring: [0.34, 1.56, 0.64, 1],

  /** Sharp ease for quick transitions */
  sharp: [0.4, 0, 0.2, 1],
};

/**
 * Animation duration presets (in seconds)
 */
export const duration = {
  fast: 0.15,
  normal: 0.2,
  slow: 0.3,
  slower: 0.5,
};

/**
 * Combine multiple glass classes with conditional logic
 * @param {...string} classes - Classes to combine
 * @returns {string} Combined class string
 *
 * @example
 * const cardClasses = glass(
 *   glassCard.base,
 *   glassCard.hover,
 *   isInteractive && glassCard.interactive,
 *   hasGlow && glassCard.glow
 * );
 */
export function glass(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
