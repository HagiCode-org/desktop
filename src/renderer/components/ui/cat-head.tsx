import { CAT_HEADS_SPRITE_URL } from '@/assets/cat-sprite';
import { getCatSpriteStyle } from '@/lib/cat-sprite';
import { cn } from '@/lib/utils';

interface CatHeadProps {
  /** Cell of the cat-head sprite sheet (0-19). */
  index: number;
  className?: string;
}

/**
 * One cat head from the sprite sheet, sized by the caller (`h-9 w-9`). Decorative, so it is hidden from
 * assistive technology. The sheet is drawn 6% oversized inside a clipping box so the lossy edge of a
 * neighbouring cell never shows at fractional pixel ratios; each head leaves a margin of backdrop for that.
 */
export function CatHead({ index, className }: CatHeadProps) {
  return (
    <span aria-hidden className={cn('relative block shrink-0 overflow-hidden', className)}>
      <span
        className="absolute inset-0 scale-[1.06] bg-no-repeat"
        style={{
          backgroundImage: `url("${CAT_HEADS_SPRITE_URL}")`,
          ...getCatSpriteStyle(index),
        }}
      />
    </span>
  );
}
