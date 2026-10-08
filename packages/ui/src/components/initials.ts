/**
 * The initial an avatar shows for a name (docs/DESIGN_SYSTEM.md §14, the child chip and the
 * account avatar): the first user-perceived character, uppercased. `Array.from` walks code
 * points rather than UTF-16 units so a name that starts with a surrogate pair does not become
 * half a glyph, and a character whose uppercase is more than one letter (ß → SS) keeps its
 * original form — one avatar, one mark. Pure, so it is tested without React Native.
 */
export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  if (!first) return '';
  const upper = first.toLocaleUpperCase();
  return Array.from(upper).length === 1 ? upper : first;
}
