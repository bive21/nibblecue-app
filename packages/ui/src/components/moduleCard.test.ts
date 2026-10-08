/**
 * A MODULE AS A CARD (`moduleCard.ts`, `ModuleCard.tsx`; the owner, 2026-09-26, of More → What you
 * track: *"they can be in card tyle for each category, where the border lights up a little in theme
 * color if it's selected. make it look nicer"*). The numbers and the paint are pure and are held
 * here; what can only be seen on a device — that the card IS the switch, wakes its picture, draws
 * its check and lights its edge over the whole card — is held by tripwires over the component,
 * because this suite has no renderer (`interaction.test.ts` says why that is the honest
 * instrument).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  PLUS_APPEARANCE,
  resolveAppearance,
  SCHEME_NAMES,
} from '../theme/appearance';
import { AA_GRAPHIC, AA_TEXT, composite, contrastRatio, parseColor } from '../theme/contrast';
import { materialBase, SKIN_NAMES, surfaceAlphaFor } from '../theme/skins';
import { hit, space, themeNames } from '../theme/theme';
import {
  CARD_COMPACT_EDGE,
  CARD_GLOW,
  CARD_WORD_EM,
  CARD_WORD_FALLBACK_EM,
  CARD_WASH,
  cardWordWidth,
  MODULE_CARD,
  MODULE_CARD_COMPACT,
  MODULE_CARD_COMPACT_MIN_HEIGHT,
  MODULE_CARD_MIN_HEIGHT,
  MODULE_CARD_WIDE_MIN_HEIGHT,
  moduleCardColumns,
  moduleCardCompactPaint,
  moduleCardNameRoom,
  moduleCardPaint,
  moduleCardRows,
  moduleCardWidth,
} from './moduleCard';

const here = dirname(fileURLToPath(import.meta.url));
/** Comments out: the component explains its own rules, and a scan must not read the explanation. */
const code = (f: string): string =>
  readFileSync(join(here, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');
const component = code('ModuleCard.tsx');

/** Every phone width the app supports, less the Screen's own gutter either side. */
const PHONES = [320, 360, 375, 390, 393, 412, 414, 428, 430];
const gridOn = (phone: number) => phone - 2 * space.xxl;
/**
 * Every name What you track prints on a card: the four feeding answers, the milk stash, the
 * extras' registry names and the one word a household can change (tummy time → Playtime).
 */
const TITLES = [
  'At the breast',
  'Pumping',
  'Bottles',
  'Solids',
  'Milk stash',
  'Diaper',
  'Sleep',
  'Vaccines',
  'Growth',
  'Medicine',
  'Temperature',
  'Bath',
  'Tummy time',
  'Playtime',
];

describe('the card', () => {
  it('draws the module’s picture at Today’s size, large enough to read', () => {
    // the owner's pictures turn to mush under 28pt; Today's pebble draws them at 30 in a 44 disc
    expect(MODULE_CARD.picture).toBeGreaterThanOrEqual(28);
    expect(MODULE_CARD.picture).toBe(30);
    expect(MODULE_CARD.disc).toBe(44);
    expect(MODULE_CARD.disc).toBeGreaterThan(MODULE_CARD.picture);
  });

  it('is one target far over 44pt either way, in both layouts, and its mark is only a state', () => {
    expect(MODULE_CARD_MIN_HEIGHT).toBeGreaterThanOrEqual(hit.min);
    expect(MODULE_CARD_WIDE_MIN_HEIGHT).toBeGreaterThanOrEqual(hit.min);
    for (const phone of PHONES)
      expect(moduleCardWidth(gridOn(phone), 2), `${phone}`).toBeGreaterThanOrEqual(2 * hit.min);
    // the corner mark is Row's checkbox a size down, and never a target of its own
    expect(MODULE_CARD.mark).toBeLessThan(MODULE_CARD.disc);
    expect(MODULE_CARD.markRing).toBe(2);
    expect(MODULE_CARD.markGlyph).toBeLessThan(MODULE_CARD.mark);
  });

  it('is one height with its neighbor: a one-line name fills the shortest card exactly', () => {
    expect(MODULE_CARD_MIN_HEIGHT).toBe(
      2 * MODULE_CARD.pad +
        MODULE_CARD.disc +
        MODULE_CARD.gap +
        Math.ceil(MODULE_CARD.titleSize * 1.34),
    );
    expect(MODULE_CARD_WIDE_MIN_HEIGHT).toBe(2 * MODULE_CARD.pad + MODULE_CARD.disc);
  });
});

/**
 * THE COMPACT CARD (2026-09-30, More → What you track): a 64 pt line, the picture small at the
 * start and the name beside it — held to that height, and to a name that still fits beside the
 * picture two across on every common phone.
 */
describe('the compact card', () => {
  it('is 64 pt: its padding and the picture’s disc, a line and not a poster', () => {
    expect(MODULE_CARD_COMPACT_MIN_HEIGHT).toBe(64);
    expect(MODULE_CARD_COMPACT_MIN_HEIGHT).toBe(
      2 * MODULE_CARD_COMPACT.padV + MODULE_CARD_COMPACT.disc,
    );
    // well under the full card, and never under the target size
    expect(MODULE_CARD_COMPACT_MIN_HEIGHT).toBeLessThan(MODULE_CARD_MIN_HEIGHT);
    expect(MODULE_CARD_COMPACT_MIN_HEIGHT).toBeGreaterThanOrEqual(hit.min);
    // a one-line name fits beside the disc, so a card whose name is one line is exactly 64
    expect(Math.ceil(MODULE_CARD.titleSize * 1.34)).toBeLessThanOrEqual(MODULE_CARD_COMPACT.disc);
  });

  it('draws the owner’s picture small but never as the glyph, with the badge on its corner', () => {
    // `Icon` draws the picture from 16 pt up (`illustrated.ts`); the full card's is 30 in 44
    expect(MODULE_CARD_COMPACT.picture).toBeGreaterThanOrEqual(24);
    expect(MODULE_CARD_COMPACT.picture).toBeLessThan(MODULE_CARD.picture);
    expect(MODULE_CARD_COMPACT.disc).toBeLessThan(MODULE_CARD.disc);
    expect(MODULE_CARD_COMPACT.disc).toBeGreaterThan(MODULE_CARD_COMPACT.picture);
    // the badge is a state, not a target: smaller than the picture, its check smaller than it
    expect(MODULE_CARD_COMPACT.badge).toBeLessThan(MODULE_CARD_COMPACT.disc);
    expect(MODULE_CARD_COMPACT.badgeGlyph).toBeLessThan(
      MODULE_CARD_COMPACT.badge - 2 * MODULE_CARD_COMPACT.badgeRing,
    );
    // it sits out past the disc, and never reaches the name
    expect(MODULE_CARD_COMPACT.badgeOut).toBeGreaterThan(0);
    expect(MODULE_CARD_COMPACT.badgeOut).toBeLessThan(MODULE_CARD_COMPACT.gap);
    // a line, not an outline
    expect(MODULE_CARD_COMPACT.edge).toBeLessThan(MODULE_CARD.edge);
  });

  it('leaves the name the card less its padding, the picture and the gap', () => {
    for (const phone of PHONES)
      expect(moduleCardNameRoom(gridOn(phone), 2, true), `${phone}`).toBe(
        moduleCardWidth(gridOn(phone), 2) -
          MODULE_CARD_COMPACT.padStart -
          MODULE_CARD_COMPACT.disc -
          MODULE_CARD_COMPACT.gap -
          MODULE_CARD_COMPACT.padEnd,
      );
    // and the full card's room is what it always was
    expect(moduleCardNameRoom(354, 2)).toBe(moduleCardWidth(354, 2) - 2 * MODULE_CARD.pad);
  });

  it('is two across at the standard text size on every phone from 360 pt, one across on 320', () => {
    for (const phone of PHONES.filter(p => p >= 360))
      expect(moduleCardColumns(gridOn(phone), 1, TITLES, true), `${phone}`).toBe(2);
    // "Temperature" is 89 pt at 15 pt; a 320 pt phone's compact card leaves it 75
    expect(moduleCardColumns(gridOn(320), 1, TITLES, true)).toBe(1);
    // and past the room, one across, never a word broken: the same rule as the full card's
    for (const phone of PHONES)
      for (const scale of [1, 1.05, 1.1, 1.3, 2]) {
        const room = moduleCardNameRoom(gridOn(phone), 2, true);
        const widest = Math.max(...TITLES.flatMap(t => t.split(' ')).map(cardWordWidth));
        expect(moduleCardColumns(gridOn(phone), scale, TITLES, true), `${phone} @${scale}`).toBe(
          widest * scale <= room ? 2 : 1,
        );
      }
  });
});

describe('the grid', () => {
  it('lays two to a row, an odd last one alone', () => {
    expect(moduleCardRows([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
    // the feeding section: four answers and the milk stash, which spans the last row
    expect(moduleCardRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(moduleCardRows([1, 2], 2)).toEqual([[1, 2]]);
    expect(moduleCardRows([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
    expect(moduleCardRows([], 2)).toEqual([]);
  });

  it('shares the width between two, less the gap', () => {
    expect(moduleCardWidth(354, 2)).toBe((354 - MODULE_CARD.gridGap) / 2);
    expect(moduleCardWidth(354, 1)).toBe(354);
    expect(moduleCardWidth(0, 2)).toBe(0);
  });

  it('is two across on every phone at the standard text size, for every name the page prints', () => {
    for (const phone of PHONES)
      for (const scale of [0.85, 1])
        expect(moduleCardColumns(gridOn(phone), scale, TITLES), `${phone} @${scale}`).toBe(2);
  });

  it('goes to one across when the longest word would not fit half the width, never breaking it', () => {
    for (const phone of PHONES)
      for (const scale of [1, 1.1, 1.2, 1.35, 1.5, 2, 3.1]) {
        const columns = moduleCardColumns(gridOn(phone), scale, TITLES);
        const room = moduleCardWidth(gridOn(phone), 2) - 2 * MODULE_CARD.pad;
        const widest = Math.max(...TITLES.flatMap(t => t.split(' ')).map(cardWordWidth));
        expect(columns, `${phone} @${scale}`).toBe(widest * scale <= room ? 2 : 1);
      }
    // the word that decides it is the widest one, as the face sets it
    expect(cardWordWidth('Temperature')).toBeCloseTo(5.953 * MODULE_CARD.titleSize, 6);
    // two across on a 320pt phone up to about 1.23× text, on a 390pt one up to about 1.62×
    expect(moduleCardColumns(gridOn(320), 1.2, TITLES)).toBe(2);
    expect(moduleCardColumns(gridOn(320), 1.25, TITLES)).toBe(1);
    expect(moduleCardColumns(gridOn(390), 1.6, TITLES)).toBe(2);
    expect(moduleCardColumns(gridOn(390), 1.65, TITLES)).toBe(1);
    // and the largest text on the narrowest phone is one across
    expect(moduleCardColumns(gridOn(320), 3.1, TITLES)).toBe(1);
  });

  it('knows every word a card prints, and charges a word it does not know more than any it does', () => {
    for (const w of TITLES.flatMap(t => t.split(' '))) expect(CARD_WORD_EM[w], w).toBeDefined();
    const perLetter = Object.entries(CARD_WORD_EM).map(([w, em]) => em / [...w].length);
    expect(CARD_WORD_FALLBACK_EM).toBeGreaterThan(Math.max(...perLetter));
    expect(cardWordWidth('Zzzz')).toBeCloseTo(4 * CARD_WORD_FALLBACK_EM * MODULE_CARD.titleSize, 6);
  });
});

/**
 * THE PAINT, MEASURED. The lit edge, the filled mark and the check are graphics (3:1); the words
 * are text (4.5:1) — and the wash is laid over the whole card, words and all, so every one of them
 * is measured THROUGH it: on the card's own fill in every design, over the app's ground and over
 * paper, with the platform's blur and without it.
 */
describe('the paint', () => {
  const sweep = (
    check: (a: {
      at: string;
      c: ReturnType<typeof resolveAppearance>['palette'];
      theme: (typeof themeNames)[number];
      glows: boolean;
      grounds: [string, string][];
      cards: [string, string][];
    }) => void,
  ) => {
    for (const skin of SKIN_NAMES)
      for (const scheme of SCHEME_NAMES)
        for (const theme of themeNames) {
          const r = resolveAppearance(
            { ...DEFAULT_APPEARANCE, theme, scheme, skin },
            'light',
            PLUS_APPEARANCE,
          );
          const c = r.palette;
          const s = r.skinTokens.surface;
          const grounds: [string, string][] = [
            ['app', c.app],
            ['paper', c.paper],
          ];
          const cards = grounds.flatMap(([g, ground]) =>
            [true, false].map(
              blur =>
                [
                  `${g}${blur ? '' : ', no blur'}`,
                  composite(ground, materialBase(c, s), surfaceAlphaFor(s, blur)),
                ] as [string, string],
            ),
          );
          check({
            at: `${skin}/${scheme}/${theme}`,
            c,
            theme,
            glows: s.shadow !== 'none',
            grounds,
            cards,
          });
        }
  };

  it('is the plain card with an empty ring when off: no edge, no wash, no glow', () => {
    sweep(({ at, c, theme, glows }) => {
      const off = moduleCardPaint(c, false, theme, glows);
      expect(off, at).toEqual({
        edge: null,
        wash: null,
        glow: null,
        markFill: null,
        markRing: c.line2,
        check: c.onAccent,
      });
    });
  });

  it('lights the edge in the accent with a faint wash, and fills the mark, when on', () => {
    sweep(({ at, c, theme, glows }) => {
      const on = moduleCardPaint(c, true, theme, glows);
      expect(on.edge, at).toBe(c.accent);
      expect(on.markFill, at).toBe(c.accent);
      expect(on.markRing, at).toBe(c.accent);
      expect(on.check, at).toBe(c.onAccent);
      expect(parseColor(on.wash ?? '').a, at).toBeCloseTo(CARD_WASH, 6);
    });
    // faint: a wash, never a fill
    expect(CARD_WASH).toBeLessThanOrEqual(0.1);
  });

  it('glows only where the design draws shadows, and never in the amber Night', () => {
    sweep(({ at, c, theme, glows }) => {
      const on = moduleCardPaint(c, true, theme, glows);
      if (theme === 'night' || !glows) expect(on.glow, at).toBeNull();
      else expect(parseColor(on.glow ?? '').a, at).toBeCloseTo(CARD_GLOW, 6);
    });
    // and Night itself draws no shadows at all, whatever design the household picked
    for (const skin of SKIN_NAMES) {
      const r = resolveAppearance(
        { ...DEFAULT_APPEARANCE, theme: 'night', skin },
        'light',
        PLUS_APPEARANCE,
      );
      expect(r.skinTokens.surface.shadow, skin).toBe('none');
    }
  });

  it('draws the lit edge at 3:1 or better against the page it sits on', () => {
    // measured 2026-09-27, with Lilac and Sunny in the set: 4.75:1 at worst (glass, reef, light,
    // on paper). It was 4.7:1 on Clay before Clay was retired
    sweep(({ at, c, grounds }) => {
      for (const [g, ground] of grounds)
        expect(contrastRatio(c.accent, ground), `${at}: edge on ${g}`).toBeGreaterThanOrEqual(
          AA_GRAPHIC,
        );
    });
  });

  it('draws the filled mark at 3:1 on the washed card, and the check at 3:1 on the mark', () => {
    // measured 2026-09-26: the mark at 4.5:1 at worst, the check at 4.7:1. The EMPTY ring is the
    // design system's checkbox ring (`line2`, as Row's) and is not what says "off": the filled,
    // ticked mark beside it is what says "on", and that is the one measured here
    sweep(({ at, c, cards }) => {
      // the check is under the wash too: the accent over the accent is the accent
      const check = composite(c.onAccent, c.accent, CARD_WASH);
      expect(contrastRatio(check, c.accent), `${at}: check on mark`).toBeGreaterThanOrEqual(
        AA_GRAPHIC,
      );
      for (const [g, card] of cards) {
        const washed = composite(card, c.accent, CARD_WASH);
        expect(contrastRatio(c.accent, washed), `${at}: mark on ${g}`).toBeGreaterThanOrEqual(
          AA_GRAPHIC,
        );
      }
    });
  });

  it('paints the compact card on with the badge, a faint wash and a thin, softer edge, and never a glow', () => {
    sweep(({ at, c }) => {
      const on = moduleCardCompactPaint(c, true);
      const off = moduleCardCompactPaint(c, false);
      // on: the accent's edge at a strength, the full card's wash, the badge the checkbox's colors
      expect(parseColor(on.edge ?? '').a, at).toBeCloseTo(CARD_COMPACT_EDGE, 6);
      expect(parseColor(on.wash ?? '').a, at).toBeCloseTo(CARD_WASH, 6);
      expect(on.badgeFill, at).toBe(c.accent);
      expect(on.check, at).toBe(c.onAccent);
      expect(on.picture, at).toBe(1);
      // off: the plain card, the picture faded — and no badge is drawn (`ModuleCard.tsx`)
      expect(off.edge, at).toBeNull();
      expect(off.wash, at).toBeNull();
      expect(off.picture, at).toBe(MODULE_CARD_COMPACT.offPicture);
      expect(Object.keys(on), at).not.toContain('glow');
    });
    // softer than the full card's edge, and the picture faded, not gone
    expect(CARD_COMPACT_EDGE).toBeLessThan(1);
    expect(MODULE_CARD_COMPACT.offPicture).toBeGreaterThan(0.3);
    expect(MODULE_CARD_COMPACT.offPicture).toBeLessThan(0.6);
  });

  it('draws the compact card’s badge at 3:1 on the washed card, and its check at 3:1 on the badge', () => {
    // the badge is what says "on" at 3:1 (the edge is the softer third sign): the same accent and
    // onAccent the full card's mark is measured in, on the same washed card
    sweep(({ at, c, cards }) => {
      const on = moduleCardCompactPaint(c, true);
      const check = composite(on.check, c.accent, CARD_WASH);
      const badge = composite(on.badgeFill, c.accent, CARD_WASH);
      expect(contrastRatio(check, badge), `${at}: check on badge`).toBeGreaterThanOrEqual(
        AA_GRAPHIC,
      );
      for (const [g, card] of cards) {
        const washed = composite(card, c.accent, CARD_WASH);
        expect(contrastRatio(badge, washed), `${at}: badge on ${g}`).toBeGreaterThanOrEqual(
          AA_GRAPHIC,
        );
      }
    });
  });

  it('keeps the words at 4.5:1 through the wash, name and note alike', () => {
    // measured 2026-09-26: the name at 8.9:1 or better, the note (`text2`) at 5.5:1 or better
    sweep(({ at, c, cards }) => {
      for (const [g, card] of cards) {
        const washed = composite(card, c.accent, CARD_WASH);
        for (const [ink, color] of [
          ['text', c.text],
          ['text2', c.text2],
        ] as const)
          expect(
            contrastRatio(composite(color, c.accent, CARD_WASH), washed),
            `${at}: ${ink} on ${g}, washed`,
          ).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });
  });
});

describe('the component (tripwires over ModuleCard.tsx)', () => {
  it('is one switch: the whole card, its name, its state, felt as it flips', () => {
    expect(component).toContain('accessibilityRole="switch"');
    expect(component).toContain('accessibilityState={{ checked: on, disabled }}');
    expect(component).toContain(
      'accessibilityLabel={accessibilityLabel ?? (note ? `${title}, ${note}` : title)}',
    );
    expect(component).toContain("onChange(!on); haptic('tap');");
    // the switch rows' id convention: the wrapper carries the plain id, the control `.switch`
    expect(component).toContain('{...(testID ? { testID } : {})}');
    expect(component).toContain('{...(testID ? { testID: `${testID}.switch` } : {})}');
    // one pressable, no second target inside it
    expect(component.match(/<Pressable/g) ?? []).toHaveLength(1);
  });

  it('wakes the picture on its own value, and draws the check with the design system’s tick', () => {
    expect(component).toContain(
      '<WakingIcon module={module} on={on} size={MODULE_CARD.picture}> <Icon name={icon} size={MODULE_CARD.picture} color={cat.fg} /> </WakingIcon>',
    );
    // the compact card's picture wakes the same way, at its own size (2026-09-30)
    expect(component).toContain(
      '<WakingIcon module={module} on={on} size={MODULE_CARD_COMPACT.picture}> <Icon name={icon} size={MODULE_CARD_COMPACT.picture} color={cat.fg} /> </WakingIcon>',
    );
    // Today's pebble disc, in the module's own swatch (none in Night), on both cards
    expect(component).toContain('const disc = cat.disc ?? composite(cat.soft, cat.fg, 0.2);');
    expect(component.match(/backgroundColor: disc,/g) ?? []).toHaveLength(2);
    expect(component).toContain('<TickMark checked={on} size={MODULE_CARD.markGlyph}');
    expect(component).toContain('<TickMark checked={on} size={MODULE_CARD_COMPACT.badgeGlyph}');
  });

  it('draws the compact card as a line: the faded picture, the badge only while on, the name beside it', () => {
    const compact = component.slice(
      component.indexOf('const card = compact ? ('),
      component.indexOf(') : ( <Surface radius="l"'),
    );
    expect(compact).toContain('minHeight: MODULE_CARD_COMPACT_MIN_HEIGHT');
    expect(compact).toContain('opacity: small.picture,');
    expect(compact).toContain("borderColor: on ? small.badgeRing : 'transparent',");
    expect(compact).toContain("backgroundColor: on ? small.badgeFill : 'transparent',");
    // the name beside the picture, never under it: the words come after the picture, in its row
    expect(compact).toMatch(
      /<View style=\{\[styles\.top, \{ gap: MODULE_CARD_COMPACT\.gap \}\]\}>/,
    );
    expect(compact.trimEnd().endsWith('{words} </View> </Surface>')).toBe(true);
    // the thin edge and no glow
    expect(component).toContain(
      'const edgeWidth = compact ? MODULE_CARD_COMPACT.edge : MODULE_CARD.edge;',
    );
    expect(component).toContain('const glow = compact ? null : paint.glow;');
    // and the grid hands every card its variant, deciding its columns by the page's names
    expect(component).toContain(
      '<ModuleCard {...card} wide={row.length === 1} compact={compact} />',
    );
  });

  it('lays the lit edge over the whole card, where no touch and no layout can reach it', () => {
    const edge = component.slice(component.indexOf('{edge ? ('));
    expect(edge).toMatch(
      /^\{edge \? \( <View pointerEvents="none" style=\{\[ StyleSheet\.absoluteFill,/,
    );
    expect(edge).toContain(
      "borderRadius: r, borderWidth: edgeWidth, borderColor: edge, backgroundColor: wash ?? 'transparent',",
    );
    // after the Surface, inside the pressable: over the card's box, not in its content view
    expect(component.indexOf('</Surface>')).toBeLessThan(component.indexOf('{edge ? ('));
    expect(component.indexOf('{card}')).toBeLessThan(component.indexOf('{edge ? ('));
    expect(component.indexOf('{edge ? (')).toBeLessThan(component.indexOf('</Pressable>'));
  });

  it('glows as a box shadow, never an elevation, and only where the design draws shadows', () => {
    expect(component).toContain(
      "moduleCardPaint(t.color, on, t.theme, t.skinTokens.surface.shadow !== 'none')",
    );
    expect(component).toContain('boxShadow: [');
    expect(component).not.toContain('elevation');
  });

  it('never cuts a name short, and spans its row when it is alone on it', () => {
    expect(component).toContain('<BodyStrong>{title}</BodyStrong>');
    expect(component).not.toContain('numberOfLines');
    expect(component).toContain(
      '<ModuleCard {...card} wide={row.length === 1} compact={compact} />',
    );
    expect(component).toContain(
      'const columns = moduleCardColumns( gridWidth, t.fontScale.body, fitTitles ?? cards.map(c => c.title), compact, );',
    );
  });

  it('paints nothing of its own: every color is a role the theme already has', () => {
    for (const f of ['ModuleCard.tsx', 'moduleCard.ts'])
      expect(code(f), f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});
