/**
 * PICK ONE, AS CARDS WITH PICTURES (`ChoiceCard.tsx`; the owner, 2026-09-26, of the medicine form:
 * *"add different icosn to medicine, vitamin, cream or ointment, and other. just to add some
 * graphic"*). The card is What you track's (`ModuleCard`), made a radio: the numbers and the paint
 * are `moduleCard.ts`'s and are measured in `moduleCard.test.ts` in every design × scheme × theme,
 * so what is held here is that this card really is that card, and really is a radio — read from
 * its source, because this suite has no renderer (`interaction.test.ts` says why that is the
 * honest instrument).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { choiceHaptic } from '../feedback/choice';
import { CARD_WORD_EM, CARD_WORD_FALLBACK_EM } from './moduleCard';

const here = dirname(fileURLToPath(import.meta.url));
/** Comments out and whitespace folded: the component explains itself, and a scan reads code. */
const code = (f: string): string =>
  readFileSync(join(here, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');
const card = code('ChoiceCard.tsx');
const moduleCard = code('ModuleCard.tsx');

describe('a choice card is a radio', () => {
  it('names itself, says whether it is chosen, and is one target', () => {
    expect(card).toContain('accessibilityRole="radio"');
    expect(card).toContain('accessibilityLabel={accessibilityLabel ?? title}');
    expect(card).toContain('accessibilityState={{ checked: chosen, selected: chosen, disabled }}');
    // one pressable per card, and the radio carries the id a flow taps
    const cardOnly = card.slice(0, card.indexOf('export interface ChoiceCardOption'));
    expect(cardOnly.match(/<Pressable/g) ?? []).toHaveLength(1);
    expect(cardOnly).toMatch(
      /onPress=\{choose\} style=[\s\S]*?\{\.\.\.\(testID \? \{ testID \} : \{\}\)\}/,
    );
  });

  it('chooses — tapping the chosen one again moves nothing and is felt as nothing', () => {
    expect(card).toContain(
      "feelChoice({ locked: false, current: chosen, kind: 'tap' }); if (!chosen) onChoose();",
    );
    expect(choiceHaptic({ locked: false, current: true, kind: 'tap' })).toBeNull();
    expect(choiceHaptic({ locked: false, current: false, kind: 'tap' })).toBe('tap');
  });

  it('is a radio group named with its question, each card with the group’s id and its own', () => {
    expect(card).toContain('accessibilityRole="radiogroup" accessibilityLabel={label}');
    expect(card).toContain('{...(testID ? { testID: `${testID}.${idOf(o.value)}` } : {})}');
    expect(card).toContain('chosen={o.value === value}');
    expect(card).toContain('onChoose={() => onChange(o.value)}');
    // nothing chosen yet is a real state: the value may be null
    expect(card).toContain('value: T | null;');
  });
});

describe('a choice card is What you track’s card', () => {
  it('is painted by the module card’s own paint, measured there', () => {
    expect(card).toContain(
      "const paint = moduleCardPaint(t.color, chosen, t.theme, t.skinTokens.surface.shadow !== 'none');",
    );
    expect(moduleCard).toContain(
      "const paint = moduleCardPaint(t.color, on, t.theme, t.skinTokens.surface.shadow !== 'none');",
    );
  });

  it('draws the picture in the module’s disc at Today’s size, and wakes it when chosen', () => {
    // the same swatch on both; the module card names it once for its full and compact drawings
    expect(card).toContain('backgroundColor: cat.disc ?? composite(cat.soft, cat.fg, 0.2)');
    expect(moduleCard).toContain('const disc = cat.disc ?? composite(cat.soft, cat.fg, 0.2);');
    expect(card).toContain(
      '<WakingIcon module={module} on={chosen} size={MODULE_CARD.picture}> <Icon name={icon} size={MODULE_CARD.picture} color={cat.fg} /> </WakingIcon>',
    );
  });

  it('lights its edge over the whole card, and draws the check with the design system’s tick', () => {
    expect(card).toContain(
      'borderRadius: r, borderWidth: MODULE_CARD.edge, borderColor: paint.edge',
    );
    expect(card).toContain('<TickMark checked={chosen} size={MODULE_CARD.markGlyph}');
    expect(card.indexOf('</Surface>')).toBeLessThan(card.indexOf('{paint.edge ? ('));
  });

  it('lays out as the module grid does: two across, one across when a word would not fit', () => {
    expect(card).toContain(
      'const columns = moduleCardColumns( gridWidth, t.fontScale.body, options.map(o => o.title), );',
    );
    expect(card).toContain('moduleCardRows(options, columns)');
    expect(card).toContain('wide={row.length === 1}');
  });

  it('never cuts a title short, and paints nothing of its own', () => {
    expect(card).toContain('<BodyStrong>{title}</BodyStrong>');
    expect(card).not.toContain('numberOfLines');
    expect(readFileSync(join(here, 'ChoiceCard.tsx'), 'utf8')).not.toMatch(
      /#[0-9a-fA-F]{3,8}\b|rgba?\(/,
    );
  });

  it('knows the width of every word of the care kinds it is drawn with first', () => {
    for (const w of ['Medicine', 'Vitamin', 'Cream', 'or', 'ointment', 'Other']) {
      expect(CARD_WORD_EM[w], w).toBeDefined();
      expect((CARD_WORD_EM[w] ?? 0) / [...w].length, w).toBeLessThan(CARD_WORD_FALLBACK_EM);
    }
  });
});
