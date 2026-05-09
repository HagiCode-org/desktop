import { ExternalLink, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import type { SidebarPromotionModel } from '../lib/sidebar-promotion';

interface SidebarPromotionCardProps {
  readonly promotion: SidebarPromotionModel;
  readonly collapsed: boolean;
  readonly label: string;
  readonly onActivate: (url: string) => void;
}

export function SidebarPromotionCard({
  promotion,
  collapsed,
  label,
  onActivate,
}: SidebarPromotionCardProps) {
  const title = collapsed ? `${promotion.title} · ${promotion.cta}` : promotion.title;

  if (collapsed) {
    return (
      <motion.button
        type="button"
        title={title}
        aria-label={title}
        onClick={() => onActivate(promotion.link)}
        whileHover={{ x: 4 }}
        whileTap={{ scale: 0.98 }}
        className="group relative flex w-full items-center gap-3 overflow-hidden rounded-lg px-3 py-2.5 text-muted-foreground hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
      >
        <motion.div
          initial={{ opacity: 0 }}
          whileHover={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-accent/50"
        />
        <Sparkles className="relative z-10 h-5 w-5 shrink-0 group-hover:scale-110 transition-transform duration-200" />
        <div className="absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow-lg transition-opacity pointer-events-none group-hover:opacity-100 group-focus-visible:opacity-100">
          {title}
        </div>
      </motion.button>
    );
  }

  return (
    <motion.button
      type="button"
      title={title}
      aria-label={title}
      onClick={() => onActivate(promotion.link)}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.98 }}
      className="group relative w-full overflow-hidden rounded-2xl border border-border/80 bg-card p-4 text-left shadow-sm transition-colors hover:border-border hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
    >
      <motion.div
        initial={{ opacity: 0 }}
        whileHover={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-muted/30"
      />
      <div className="relative z-10 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border/70 bg-muted/35 text-primary shadow-sm">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {label}
            </p>
          </div>
          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground transition-colors group-hover:text-foreground" />
        </div>
        {promotion.image ? (
          <div className="overflow-hidden rounded-xl border border-border/60 bg-background/70 shadow-sm">
            <img
              src={promotion.image.src}
              alt={promotion.image.alt}
              width={promotion.image.width}
              height={promotion.image.height}
              loading="lazy"
              className="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <p className="line-clamp-2 text-base font-semibold leading-6 text-foreground">
            {promotion.title}
          </p>
          <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">
            {promotion.description}
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
          <p className="line-clamp-1 text-xs text-muted-foreground">{promotion.cta}</p>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors group-hover:text-primary/80">
            <Sparkles className="h-3.5 w-3.5" />
            <ExternalLink className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </motion.button>
  );
}
