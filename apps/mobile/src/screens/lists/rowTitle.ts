import type { ShoppingLine } from '@nibblecue/core';

/**
 * The name a shopping row shows: the words the parent entered.
 *
 * The category sits on the quieter line under the name (`productCaption`), and the shop is the
 * band the row already sits under. Share still uses `lineTitle` / `lineLabel`, which keep
 * `Diapers: Pampers` and append ` ×2` when the quantity is above one. A title the parent typed
 * that already contains `×2` is their words, so this never strips a suffix from the stored title.
 */
export function shoppingRowTitle(line: Pick<ShoppingLine, 'title'>): string {
  return line.title;
}
