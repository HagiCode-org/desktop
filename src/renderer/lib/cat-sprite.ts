/** Geometry of the cat-head sprite sheet (`assets/cat-sprite/cat-heads.avif`): a grid read row by row. */
export const CAT_SPRITE_COLUMNS = 5;
export const CAT_SPRITE_ROWS = 4;
export const CAT_SPRITE_COUNT = CAT_SPRITE_COLUMNS * CAT_SPRITE_ROWS;

export function wrapCatIndex(index: number): number {
  return ((Math.trunc(index) % CAT_SPRITE_COUNT) + CAT_SPRITE_COUNT) % CAT_SPRITE_COUNT;
}

/**
 * Background styles that show one cell at any display size: the sheet is scaled to the grid
 * (500% x 400%) and positioned by the cell's share of the leftover width and height.
 */
export function getCatSpriteStyle(index: number): {
  backgroundSize: string;
  backgroundPosition: string;
} {
  const cell = wrapCatIndex(index);
  const column = cell % CAT_SPRITE_COLUMNS;
  const row = Math.floor(cell / CAT_SPRITE_COLUMNS);

  return {
    backgroundSize: `${CAT_SPRITE_COLUMNS * 100}% ${CAT_SPRITE_ROWS * 100}%`,
    backgroundPosition: `${(column / (CAT_SPRITE_COLUMNS - 1)) * 100}% ${(row / (CAT_SPRITE_ROWS - 1)) * 100}%`,
  };
}

/** Every cell exactly once, in a random order (Fisher-Yates), so each launch opens on a different cat. */
export function shuffleCatOrder(random: () => number = Math.random): number[] {
  const order = Array.from({ length: CAT_SPRITE_COUNT }, (_, index) => index);

  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = Math.min(index, Math.floor(random() * (index + 1)));
    [order[index], order[swap]] = [order[swap], order[index]];
  }

  return order;
}
