/**
 * Sprite sheet of 20 cat heads from repos/img-gen's `cat-head-gallery`, built by `scripts/build-cat-sprite.mjs`.
 * 5 columns x 4 rows of 96 px cells, read row by row. Decorative: render it through `CatHead`, which hides it
 * from assistive technology.
 */
import catHeadsSprite from './cat-heads.avif';

export const CAT_HEADS_SPRITE_URL = catHeadsSprite;
