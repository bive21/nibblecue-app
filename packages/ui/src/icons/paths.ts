/**
 * Icon path data: the app's built-in glyph set. One stroke set, 1.7px, round caps, 24px grid
 * (docs/DESIGN_SYSTEM.md §5 "Icons"); rendered at an explicit size, always. It was extracted
 * from prototype/ui-prototype.html's SVG sprite once, for WP3 (docs/reports/WP3.md §1.1), and has
 * been maintained BY HAND here since — glyphs added, redrawn and removed in this file; no
 * generator writes it. The owner's own drawings replace a glyph by name through `paths.custom.ts`
 * (`tools/ui/import-icons.mjs`), which also reads the `IconName` union below into the kit's
 * README: run it after adding or removing a name, or `pnpm check:icons` fails.
 * `tummy` draws the sprite's `tummy-b` (a baby on a mat): UX_AUDIT §4.29 asked for the posture
 * rather than the profile glyph every app uses, and of the four the sprite offers, only `-b`
 * still reads as a posture at the 18px it is reviewed at. The four alternates were kept here for
 * that comparison until 2026-09-23, when they went with every other glyph nothing drew (the
 * owner: "you can remove the icons that are not used") — the owner has drawn tummy time twice
 * since, as `08-icons/tummy.svg` and as the picture, so the comparison is over; the prototype's
 * sprite still has all four. `sun` and `moon` are the two glyphs the appearance controls named
 * that the sprite never drew (the preview's top bar, who's on, the rhythm form and the site's
 * coin shop draw them now).
 */
export type IconName =
  | 'apple'
  | 'carrot'
  | 'spoon'
  | 'broccoli'
  | 'bottle'
  | 'breast'
  | 'pump'
  | 'diaper'
  | 'sleep'
  | 'solids'
  | 'med'
  | 'water'
  | 'growth'
  | 'temp'
  | 'bath'
  | 'tummy'
  | 'star'
  | 'note'
  | 'info'
  | 'plus'
  | 'minus'
  | 'home'
  | 'cal'
  | 'chart'
  | 'chat'
  | 'more'
  | 'chev'
  | 'search'
  | 'back'
  | 'up'
  | 'down'
  | 'clock'
  | 'check'
  | 'x'
  | 'snow'
  | 'box'
  | 'bell'
  | 'bellOff'
  // Reminders' own door (2026-09-30): the bell is What's new in the top bar
  | 'alarm'
  | 'vibrate'
  | 'users'
  | 'flag'
  | 'bookmark'
  // Community's heart, given and not (2026-09-29), and a pinned discussion's pin
  | 'heart'
  | 'heart-solid'
  | 'pin'
  | 'undo'
  | 'shield'
  | 'export'
  | 'share'
  | 'lock'
  | 'card'
  | 'grid'
  | 'sliders'
  | 'trash'
  | 'edit'
  | 'move'
  | 'cart'
  | 'copy'
  | 'link'
  | 'tag'
  | 'play'
  | 'timer'
  | 'stop'
  | 'babyface'
  | 'sun'
  | 'moon'
  | 'pause'
  | 'arrowUp'
  | 'arrowDown'
  | 'supply-wipes'
  | 'supply-formula'
  | 'supply-nipples'
  | 'supply-pacifiers'
  | 'supply-cream'
  | 'supply-laundry'
  | 'supply-clothing'
  | 'supply-milk-storage'
  | 'supply-other'
  // where a thermometer goes: the temperature sheet's four methods (TEMP_METHOD_GLYPHS, below)
  | 'temp-armpit'
  | 'temp-forehead'
  | 'temp-ear'
  | 'temp-rectal'
  // what a diaper held: wet is the drop, dirty the pile (DIAPER_KIND_GLYPHS), outlined
  | 'drop'
  | 'poo'
  // the same two, solid, on Today's report (DIAPER_KIND_SOLID_GLYPHS)
  | 'drop-solid'
  | 'poo-solid'
  // what a care item is, beside the medicine and the cream jar (the app's CARE_KIND_ICON)
  | 'care-vitamin'
  | 'care-other'
  // who you are at home, the two answers on setup's first page (drawn below)
  | 'parent'
  | 'caregiver'
  // the tab bar's own glyphs, regular and active (TabIconName, below, says why)
  | 'tab-home-regular'
  | 'tab-home-active'
  | 'tab-schedule-regular'
  | 'tab-schedule-active'
  | 'tab-stash-regular'
  | 'tab-stash-active'
  | 'tab-shopping-regular'
  | 'tab-shopping-active'
  | 'tab-more-regular'
  | 'tab-more-active';

/**
 * THE TAB BAR'S OWN GLYPHS (the owner, 2026-09-23: "replace the tab bar icons with attached
 * icons"), a regular and an active drawing per destination. The active one carries a light fill
 * of its own ink, which `import-icons.mjs` draws as a tint under the outline.
 *
 * Names of their own rather than new drawings for `home`, `cal`, `box`, `cart` and `more`,
 * because those five are drawn all over the app (a date control, a stash container, a shopping
 * row, a row's menu) and the owner's set is for the bar: a milk bag is the stash tab, not every
 * box. The drawings are the owner's SVGs in `assets/brand/kit/08-icons`, named exactly as
 * delivered. The built-in entry each name falls back to is the glyph the bar drew before
 * (`ICON_PATHS` below), so deleting a file puts the old tab back.
 *
 * The names are spelled out in the union above rather than declared here, because the importer
 * reads that union as TEXT, up to its first semicolon — which is also why the comment inside it
 * is one short line.
 */
export type TabIconName = Extract<IconName, `tab-${string}`>;

/**
 * WHAT A DIAPER HELD, AS PICTURES (the owner, 2026-09-26, of Today's report: *"for diapers, just
 * make it into an icon for wet, dirty, and mixed. so example: 1 (wet- waterdrop icon) 2 (poo
 * icon), and 3 (poo icon, and water drop icon)"*). Two glyphs drawn to this set's rules — 24 box,
 * 1.7 stroke, round caps and joins, `currentColor`, no fill — so the report can paint them in any
 * ink it likes.
 *
 *   `drop` — a plain water drop. The sprite's own drop, which drew `water` until the owner's water
 *     bottle took that name (`paths.custom.ts`), so it is the set's drop and not a new drawing.
 *   `poo`  — a friendly pile: three soft tiers, the top one ending in a little curl, the tiers
 *     marked by two gentle curves. No face, no stink lines: it says "dirty" the way everybody's
 *     phone keyboard does, and nothing about what was in it.
 *
 * THE DROP IS BLUE AND THE PILE IS BROWN (the owner, 2026-09-26: *"the iccon in diapers need to be
 * colored, blue for water drop, brown for the poo"*) — the water's own blue and the brown a parent
 * would name, the same whatever was logged (`theme/diaperKinds.ts` has the inks and the Night's).
 * A picture's color, like the milk's or the bath's, and never a status: nothing about any entry
 * moves it.
 *
 * A MIXED DIAPER IS BOTH, pile then drop, in the order the owner wrote them — never a third
 * drawing a parent would have to learn. They record the kind a parent tapped and nothing more:
 * no color that says anything about what was in it, no mark for any count (CLAUDE.md §2 rules 1
 * and 3).
 *
 * THESE OUTLINES ARE REPORTS' since 2026-09-27: the day strip marks a change with them, in the
 * diaper hue. Today's report draws the same two SOLID (`DIAPER_KIND_SOLID_GLYPHS`, below).
 */
export const DIAPER_KIND_GLYPHS = {
  wet: ['drop'],
  dirty: ['poo'],
  both: ['poo', 'drop'],
} as const satisfies Readonly<Record<'wet' | 'dirty' | 'both', readonly IconName[]>>;

/**
 * THE SAME TWO, SOLID, ON TODAY'S REPORT (the owner, 2026-09-27: *"the diapers on it, make the icon
 * solid with color instead, it looks too similar, and for both (wet + dirty) icons, theere is spacing
 * between the poo icon and water icon, remove the sapcing, theyre supposed to be together to better
 * indicate what that means"*). Two outlines of one weight, a drop and a pile, read alike at 13 pt;
 * filled with their own blue and brown they are two masses of two colors.
 *
 *   `drop-solid` — the drop's own path, filled as well as stroked in the one ink, so it has the
 *     outline's shape and its bounds exactly (the stroke is what reaches the edge of either).
 *   `poo-solid`  — the pile's own outline, filled and stroked the same way, with its two tier curves
 *     KNOCKED OUT: each is a groove about 1.3 of the 24 units wide, open to the card beneath it and
 *     stopping short of the sides, so the pile stays one piece and still reads as three tiers — the
 *     curves the outline drew in ink are the gaps in the solid one. The grooves are subpaths wound
 *     against the outline, which the nonzero rule leaves open (`import-icons.mjs` explains the same
 *     for a file of the owner's), and no color is added: a groove is whatever the card is.
 *
 * A MIXED DIAPER IS THE PAIR TOUCHING, as one mark — the table pulls the drop's box over the
 * pile's until the two meet (`STAT_PAIR_GAP` in `components/statTable.ts`, measured from these
 * paths). The kinds and the colors are the outlines' own; only the fill and the touch are new.
 */
export const DIAPER_KIND_SOLID_GLYPHS = {
  wet: ['drop-solid'],
  dirty: ['poo-solid'],
  both: ['poo-solid', 'drop-solid'],
} as const satisfies Readonly<Record<'wet' | 'dirty' | 'both', readonly IconName[]>>;

/**
 * A SECOND TONE (the owner, 2026-09-19: "I want to have a two tone color for each module icon").
 * An element marked `tone: 'secondary'` is stroked in the icon's secondary ink — the primary at
 * half strength unless a caller passes one — and a fill of `'secondaryColor'` is filled in it.
 * Everything unmarked is the primary, exactly as before, so the built-in set is untouched and a
 * one-color file from the owner still imports as one color.
 */
export type IconTone = 'secondary';

export type IconElement =
  | { type: 'path'; d: string; fill?: string; opacity?: number; tone?: IconTone }
  | { type: 'circle'; cx: number; cy: number; r: number; fill?: string; tone?: IconTone }
  | {
      type: 'rect';
      x: number;
      y: number;
      width: number;
      height: number;
      rx?: number;
      fill?: string;
      tone?: IconTone;
    }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; tone?: IconTone };

export interface IconDef {
  viewBox: string;
  /** 'none' = stroke icon in currentColor; 'currentColor' = filled glyph. */
  fill: string;
  strokeWidth?: number;
  alias?: string;
  elements: IconElement[];
}

/**
 * THE SUPPLY CATEGORIES (the owner's pack, 2026-09-19). One glyph per category in `core`'s
 * `SUPPLY_CATEGORIES`, in its order, drawn to this set's own rules — 24 box, 1.8 stroke, no
 * fill, `currentColor` — so each takes the household's accent on a catalog row and the same ink
 * on a list row, with no second table of colors to keep in step. NINE since 2026-09-23: the
 * pack drew fifteen, but diapers, bottles, bath, pump parts, nursing and vitamins borrow the log's
 * own module glyphs (`SUPPLY_ICON` in core has the owner's words), so their six drawings were
 * never drawn and went with the other unused glyphs.
 *
 * THEY ARE `supply-` PREFIXED because a category and a MODULE are different things that share
 * words. `diaper` is the module a parent logs a change with and it belongs to the log's own
 * hue; `supply-diapers` is the shelf the household buys from. One name for both would have
 * meant the Supplies screen silently repainting Today's glyph the day either drawing changed.
 */
const SPRITE: Record<Exclude<IconName, TabIconName>, IconDef> = {
  'supply-wipes': {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.8,
    elements: [
      { type: 'rect', x: 5, y: 4, width: 14, height: 16, rx: 3 },
      { type: 'path', d: 'M9 4V3h6v1' },
      { type: 'path', d: 'M9 12h6' },
      { type: 'path', d: 'M9 12c1.5-1 3-1 6 0' },
    ],
  },
  'supply-formula': {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.8,
    elements: [
      { type: 'path', d: 'M7 9h10v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z' },
      { type: 'path', d: 'M8 9V6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v3' },
      { type: 'path', d: 'M7 14h10' },
    ],
  },
  'supply-nipples': {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.8,
    elements: [
      { type: 'path', d: 'M12 3c2.5 0 4 2 4 4.5V10H8V7.5C8 5 9.5 3 12 3z' },
      { type: 'path', d: 'M6 10h12v2a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z' },
      { type: 'path', d: 'M9 14v3a3 3 0 0 0 6 0v-3' },
    ],
  },
  'supply-pacifiers': {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.8,
    elements: [
      { type: 'circle', cx: 12, cy: 9, r: 3 },
      {
        type: 'path',
        d: 'M5 14h14a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1z',
      },
      { type: 'path', d: 'M8 17a4 4 0 0 0 8 0' },
      { type: 'path', d: 'M10 14v-2.5' },
      { type: 'path', d: 'M14 14v-2.5' },
    ],
  },
  'supply-cream': {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.8,
    elements: [
      { type: 'path', d: 'M7 8h10l1 12H6z' },
      { type: 'path', d: 'M8 8V6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2' },
      { type: 'path', d: 'M9 13h6' },
    ],
  },
  'supply-laundry': {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.8,
    elements: [
      { type: 'rect', x: 4, y: 3, width: 16, height: 18, rx: 2 },
      { type: 'circle', cx: 12, cy: 13, r: 4 },
      { type: 'path', d: 'M4 7h16' },
      { type: 'path', d: 'M7 5h1' },
      { type: 'path', d: 'M10 5h1' },
      { type: 'path', d: 'M9.5 13.5c1.5 1.2 3.5 1.2 5 0' },
    ],
  },
  'supply-clothing': {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.8,
    elements: [
      { type: 'path', d: 'M8 4h8l3 4-3 1v11H8V9L5 8z' },
      { type: 'path', d: 'M10 4a2 2 0 0 0 4 0' },
      { type: 'path', d: 'M9 14h6' },
    ],
  },
  'supply-milk-storage': {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.8,
    elements: [
      { type: 'path', d: 'M6 8h12v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1z' },
      { type: 'path', d: 'M6 8l1-4h10l1 4' },
      { type: 'path', d: 'M12 2v2' },
      { type: 'path', d: 'M9 15h6' },
    ],
  },
  'supply-other': {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.8,
    elements: [
      { type: 'path', d: 'M3 4h2l2.4 12h11.2L21 8H6' },
      { type: 'circle', cx: 9, cy: 20, r: 1.5 },
      { type: 'circle', cx: 17, cy: 20, r: 1.5 },
    ],
  },
  bottle: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M11 1.7c-.9 0-1.5.7-1.5 1.6 0 .6.3 1.2.7 1.5h3.6c.4-.3.7-.9.7-1.5 0-.9-.6-1.6-1.5-1.6',
      },
      {
        type: 'rect',
        x: 8.3,
        y: 4.8,
        width: 7.4,
        height: 2.7,
        rx: 1,
      },
      {
        type: 'path',
        d: 'M9.7 7.5c-.8 1-1.2 2.2-1.2 3.4V19a3 3 0 0 0 3 3h1a3 3 0 0 0 3-3v-8.1c0-1.2-.4-2.4-1.2-3.4',
      },
      {
        type: 'path',
        d: 'M10.3 11.7h2.2M10.3 14.5h2.2M10.3 17.3h2.2',
      },
    ],
  },
  breast: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M12 20.2S4.8 15.8 4.8 10.7A3.9 3.9 0 0 1 12 8.4a3.9 3.9 0 0 1 7.2 2.3c0 5.1-7.2 9.5-7.2 9.5z',
      },
    ],
  },
  pump: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M12 3.2s5 5.7 5 9.1a5 5 0 0 1-10 0c0-3.4 5-9.1 5-9.1z',
      },
      {
        type: 'path',
        d: 'M9.6 13.6a2.4 2.4 0 0 0 2.4 2.4',
      },
    ],
  },
  diaper: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M4 5.5h16v3.8a9 9 0 0 1-8 8.9 9 9 0 0 1-8-8.9V5.5z',
      },
      {
        type: 'path',
        d: 'M9 17.6c.9-1.7 5.1-1.7 6 0',
      },
    ],
  },
  sleep: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M20 14.6A8.6 8.6 0 1 1 9.4 4.1a7 7 0 0 0 10.6 10.5z',
      },
    ],
  },
  // NibbleCue's food glyphs (2026-10-08): line drawings in the set's own stroke, for the ground's
  // pattern and the food pages; placeholders the owner's designer may redraw
  apple: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M12 7.6c-1.9-1.4-6.7-1.1-7.3 3.6-.6 4.4 2.4 9.6 5.1 9.6 1 0 1.3-.5 2.2-.5s1.2.5 2.2.5c2.7 0 5.7-5.2 5.1-9.6-.6-4.7-5.4-5-7.3-3.6z',
      },
      {
        type: 'path',
        d: 'M12 7.6c0-1.7.5-3.2 1.8-4.2',
      },
      {
        type: 'path',
        d: 'M13 5.6c1.1-1.3 2.9-1.8 4.4-1.3-.5 1.5-1.9 2.6-3.8 2.5',
      },
    ],
  },
  carrot: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M15.2 8.8c-1.4-1.4-3.6-1.4-5 0L4.6 18.5c-.5.8.3 1.6 1.1 1.1l9.5-5.8c1.4-1.4 1.4-3.6 0-5z',
      },
      {
        type: 'path',
        d: 'M15.6 8.4 19.4 4.6',
      },
      {
        type: 'path',
        d: 'M16.6 10 20.6 8.8',
      },
      {
        type: 'path',
        d: 'M14 7.4 15.2 3.4',
      },
      {
        type: 'path',
        d: 'M8.8 13.8l1.4 1.4',
      },
      {
        type: 'path',
        d: 'M11.2 11.4l1.2 1.2',
      },
    ],
  },
  spoon: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M12 3c2.3 0 3.8 2.1 3.8 4.6S14.3 12 12 12 8.2 10.1 8.2 7.6 9.7 3 12 3z',
      },
      {
        type: 'path',
        d: 'M12 12v9',
      },
    ],
  },
  broccoli: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M7.6 12.4a3 3 0 0 1 .2-5.9 3.7 3.7 0 0 1 7-1.4 3 3 0 0 1 1.6 5.7 3 3 0 0 1-2.8 1.6z',
      },
      {
        type: 'path',
        d: 'M10.2 12.4 9.4 20.6h5.2l-.8-8.2',
      },
      {
        type: 'path',
        d: 'M12 12.4v-2.2',
      },
    ],
  },
  solids: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M4 11h16a8 8 0 0 1-16 0z',
      },
      {
        type: 'path',
        d: 'M3 20.5h18',
      },
      {
        type: 'path',
        d: 'M12 4v4',
      },
    ],
  },
  med: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M9.2 14.8 14.8 9.2a3.6 3.6 0 1 1 5 5l-5.6 5.6a3.6 3.6 0 1 1-5-5z',
      },
      {
        type: 'path',
        d: 'm12 12 5 5',
      },
    ],
  },
  water: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M12 21a6.2 6.2 0 0 0 6.2-6.2C18.2 10.6 12 3.2 12 3.2S5.8 10.6 5.8 14.8A6.2 6.2 0 0 0 12 21z',
      },
    ],
  },
  growth: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M4.5 19.5V4.5',
      },
      {
        type: 'path',
        d: 'M4.5 19.5h15',
      },
      {
        type: 'path',
        d: 'm7.5 15.5 3.5-4.5 3 3 4.5-6.5',
      },
    ],
  },
  temp: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M14 14.6V5.2a2 2 0 1 0-4 0v9.4a4 4 0 1 0 4 0z',
      },
      {
        type: 'path',
        d: 'M12 11v5.2',
      },
    ],
  },
  bath: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M3 12.2h18v2.6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4v-2.6z',
      },
      {
        type: 'path',
        d: 'M7.2 12.2V6.6a2.2 2.2 0 0 1 4.4 0',
      },
      {
        type: 'path',
        d: 'M6 19v2M18 19v2',
      },
    ],
  },
  tummy: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'rect',
        x: 2.6,
        y: 13,
        width: 18.8,
        height: 6.6,
        rx: 2.2,
      },
      {
        type: 'circle',
        cx: 8.4,
        cy: 8.6,
        r: 2.5,
      },
      {
        type: 'path',
        d: 'M10.8 10.2c1.9 1.6 4.2 2.5 6.6 2.7',
      },
      {
        type: 'path',
        d: 'M10.2 11.4c-.5 1-.4 1.9.2 2.6',
      },
    ],
  },
  star: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'm12 3.8 2.5 5.1 5.6.8-4 4 .9 5.5-5-2.7-5 2.7.9-5.5-4-4 5.6-.8z',
      },
    ],
  },
  note: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M6 3h8l4 4v14H6z',
      },
      {
        type: 'path',
        d: 'M14 3v4h4',
      },
      {
        type: 'path',
        d: 'M9 12.5h6M9 16.5h4',
      },
    ],
  },
  /**
   * A circled i. The shopping list's quiet line opens its footnote with it. A document (`note`)
   * reads as something to write; this is information. One circle, a stem and a dot, the set's
   * own stroke.
   */
  info: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      { type: 'circle', cx: 12, cy: 12, r: 8.5 },
      { type: 'path', d: 'M12 11v5' },
      { type: 'path', d: 'M12 8h.01' },
    ],
  },
  /**
   * MINUS. It had no glyph, so a quantity stepper borrowed `x` for its down button — which on a
   * shopping list reads as "remove this", not "one fewer" (the owner, 2026-09-19: "the button to
   * reduce the qty is marked with 'x', but it should be '-'"). One stroke, the set's own weight,
   * the same length as the plus's bar so the pair is symmetrical.
   */
  minus: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.8,
    elements: [{ type: 'path', d: 'M5.5 12h13' }],
  },

  plus: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 2,
    elements: [
      {
        type: 'path',
        d: 'M12 5.5v13M5.5 12h13',
      },
    ],
  },
  home: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M4 11.2 12 4.4l8 6.8',
      },
      {
        type: 'path',
        d: 'M6.2 10v10h11.6V10',
      },
    ],
  },
  cal: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'rect',
        x: 4,
        y: 5.2,
        width: 16,
        height: 15.3,
        rx: 3,
      },
      {
        type: 'path',
        d: 'M4 10h16M9 3.2v3.6M15 3.2v3.6',
      },
    ],
  },
  chart: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M4 20.3h16',
      },
      {
        type: 'path',
        d: 'M7 17V11M12 17V5M17 17v-4',
      },
    ],
  },
  chat: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M20.8 12a8.3 8.3 0 0 1-11.9 7.5L4 21l1.6-5A8.3 8.3 0 1 1 20.8 12z',
      },
    ],
  },
  more: {
    viewBox: '0 0 24 24',
    fill: 'currentColor',
    elements: [
      {
        type: 'circle',
        cx: 6,
        cy: 12,
        r: 1.4,
      },
      {
        type: 'circle',
        cx: 12,
        cy: 12,
        r: 1.4,
      },
      {
        type: 'circle',
        cx: 18,
        cy: 12,
        r: 1.4,
      },
    ],
  },
  /** The magnifier on a search field. One circle and one handle, at the set's own 1.8 stroke. */
  search: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.8,
    elements: [
      { type: 'circle', cx: 11, cy: 11, r: 6.25 },
      { type: 'path', d: 'm15.6 15.6 4.15 4.15' },
    ],
  },
  chev: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.8,
    elements: [
      {
        type: 'path',
        d: 'm9.5 5.5 6.5 6.5-6.5 6.5',
      },
    ],
  },
  back: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.8,
    elements: [
      {
        type: 'path',
        d: 'M14.5 5.5 8 12l6.5 6.5',
      },
    ],
  },
  /** The chevron turned a quarter, for reordering a list. */
  up: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.8,
    elements: [
      {
        type: 'path',
        d: 'm5.5 14.5 6.5-6.5 6.5 6.5',
      },
    ],
  },
  down: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.8,
    elements: [
      {
        type: 'path',
        d: 'm5.5 9.5 6.5 6.5 6.5-6.5',
      },
    ],
  },
  clock: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'circle',
        cx: 12,
        cy: 12,
        r: 8.4,
      },
      {
        type: 'path',
        d: 'M12 7.4V12l3.2 2',
      },
    ],
  },
  check: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 2,
    elements: [
      {
        type: 'path',
        d: 'm5 12.8 4.6 4.6L19 7',
      },
    ],
  },
  x: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.8,
    elements: [
      {
        type: 'path',
        d: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
      },
    ],
  },
  snow: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9',
      },
    ],
  },
  box: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M3.6 8 12 4l8.4 4v8L12 20l-8.4-4z',
      },
      {
        type: 'path',
        d: 'M3.6 8 12 12l8.4-4M12 12v8',
      },
    ],
  },
  bell: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M18 15.2V10a6 6 0 1 0-12 0v5.2L4.4 18.4h15.2z',
      },
      {
        type: 'path',
        d: 'M10 21h4',
      },
    ],
  },
  /**
   * AN ALARM CLOCK, FOR REMINDERS (the owner, 2026-09-30: "top right, there are 2 of the same bell
   * icons"). The top bar's bell is What's new; the Schedule's and Routine's door to who gets the
   * reminders was a second bell beside it. A clock face with its hands at a set time, two bells
   * on its shoulders and two feet: the one glyph everybody reads as "it will ring then".
   */
  alarm: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'circle',
        cx: 12,
        cy: 13,
        r: 7.2,
      },
      {
        type: 'path',
        d: 'M12 9.4V13l2.4 1.6',
      },
      {
        type: 'path',
        d: 'M3.4 7.4a3.6 3.6 0 0 1 4.2-4',
      },
      {
        type: 'path',
        d: 'M20.6 7.4a3.6 3.6 0 0 0-4.2-4',
      },
      {
        type: 'path',
        d: 'M7.1 18.3 5.6 20.4',
      },
      {
        type: 'path',
        d: 'M16.9 18.3l1.5 2.1',
      },
    ],
  },
  /**
   * THE SAME BELL WITH A LINE THROUGH IT — "it arrives, it makes no noise". Drawn here rather
   * than imported, like `sun` and `moon`: the sprite this file came from has no glyph for a
   * notification level, and the Reminders picker names four of them (2026-09-20).
   *
   * The slash runs corner to corner at the set's own 1.7 and is a SECOND path, so a renderer
   * that ever wanted the bell alone still has it.
   */
  bellOff: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M18 15.2V10a6 6 0 1 0-12 0v5.2L4.4 18.4h15.2z',
      },
      {
        type: 'path',
        d: 'M10 21h4',
      },
      {
        type: 'path',
        d: 'M4 4l16 16',
      },
    ],
  },
  /**
   * A PHONE WITH A LINE EITHER SIDE OF IT, which is what every platform draws for "vibrate".
   * The two dashes are the motion; the phone is a rounded 7×15 box on the 24 grid, and the
   * home line inside it is what stops it reading as a plain rectangle at 16 pt.
   */
  vibrate: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M9.2 4.5h5.6a1.6 1.6 0 0 1 1.6 1.6v11.8a1.6 1.6 0 0 1-1.6 1.6H9.2a1.6 1.6 0 0 1-1.6-1.6V6.1a1.6 1.6 0 0 1 1.6-1.6Z',
      },
      {
        type: 'path',
        d: 'M10.9 16.8h2.2',
      },
      {
        type: 'path',
        d: 'M4.6 9.4v5.2M20 9.4v5.2M2 10.8v2.4M22.6 10.8v2.4',
      },
    ],
  },
  users: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'circle',
        cx: 9.2,
        cy: 8,
        r: 3.1,
      },
      {
        type: 'path',
        d: 'M3.4 20c0-3.3 2.6-5.2 5.8-5.2s5.8 1.9 5.8 5.2',
      },
      {
        type: 'path',
        d: 'M16.2 6.6a3 3 0 0 1 0 5.6M17.4 15.2c2.2.7 3.4 2.2 3.4 4.8',
      },
    ],
  },
  flag: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M6 21V4h12l-2.6 4.6L18 13.2H6',
      },
    ],
  },
  bookmark: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M6.5 4h11v17l-5.5-4-5.5 4z',
      },
    ],
  },
  /**
   * COMMUNITY'S HEART (2026-09-29): the prototype's own drawing (`#i-heart`), an outline where a
   * heart has not been given and the same shape filled where it has (`heart-solid`, drawn the way
   * `drop-solid` is). The count beside it and the control's pressed state say the same thing in
   * words, so the fill is never the only sign.
   */
  heart: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M12 20.2S4.8 15.8 4.8 10.7A3.9 3.9 0 0 1 12 8.4a3.9 3.9 0 0 1 7.2 2.3c0 5.1-7.2 9.5-7.2 9.5z',
      },
    ],
  },
  'heart-solid': {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M12 20.2S4.8 15.8 4.8 10.7A3.9 3.9 0 0 1 12 8.4a3.9 3.9 0 0 1 7.2 2.3c0 5.1-7.2 9.5-7.2 9.5z',
        fill: 'currentColor',
      },
    ],
  },
  /** A pushpin: a discussion a moderator pinned to the top of the list. */
  pin: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      { type: 'path', d: 'M9 3.8h6l-1 5.2 3.2 3.2v1.9H6.8v-1.9L10 9z' },
      { type: 'path', d: 'M12 14.1v6.1' },
    ],
  },
  undo: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M4.5 9.5h9.5a5 5 0 1 1 0 10H8.5',
      },
      {
        type: 'path',
        d: 'm7.8 5.5-3.3 4 3.3 4',
      },
    ],
  },
  shield: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M12 3.3 5.2 6v6c0 4.4 2.9 7.5 6.8 9 3.9-1.5 6.8-4.6 6.8-9V6z',
      },
      {
        type: 'path',
        d: 'm9.4 12 1.9 2 3.3-3.6',
      },
    ],
  },
  /**
   * SHARE, which is not `export`. `export` is an arrow INTO a tray — the download shape, and
   * right for "get a copy of your data onto this phone". Sending a shopping list to somebody is
   * the opposite direction, and the owner read the download arrow as exactly the wrong thing
   * (2026-09-19: "fix the icon for the share button, this is wrong icon, it should be to share").
   *
   * The tray with an arrow leaving the TOP of it is the one shape both platforms read as share
   * without belonging to either: iOS draws it, and Android's own three-node glyph means nothing
   * to an iPhone. The tray is the same tray `export` draws, so the pair reads as a set.
   */
  share: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      { type: 'path', d: 'M12 15V3.6' },
      { type: 'path', d: 'm8.2 7.4 3.8-3.8 3.8 3.8' },
      { type: 'path', d: 'M5 12.5v6.2a1.3 1.3 0 0 0 1.3 1.3h11.4a1.3 1.3 0 0 0 1.3-1.3v-6.2' },
    ],
  },

  export: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M12 4v11',
      },
      {
        type: 'path',
        d: 'm8 11 4 4 4-4',
      },
      {
        type: 'path',
        d: 'M5 19.5h14',
      },
    ],
  },
  lock: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'rect',
        x: 5,
        y: 10.6,
        width: 14,
        height: 9.4,
        rx: 2.6,
      },
      {
        type: 'path',
        d: 'M8.4 10.6V8a3.6 3.6 0 1 1 7.2 0v2.6',
      },
    ],
  },
  card: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'rect',
        x: 3.2,
        y: 5.5,
        width: 17.6,
        height: 13,
        rx: 3,
      },
      {
        type: 'path',
        d: 'M3.2 10h17.6M7 14.5h3',
      },
    ],
  },
  grid: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'rect',
        x: 4,
        y: 4,
        width: 7,
        height: 7,
        rx: 2,
      },
      {
        type: 'rect',
        x: 13,
        y: 4,
        width: 7,
        height: 7,
        rx: 2,
      },
      {
        type: 'rect',
        x: 4,
        y: 13,
        width: 7,
        height: 7,
        rx: 2,
      },
      {
        type: 'rect',
        x: 13,
        y: 13,
        width: 7,
        height: 7,
        rx: 2,
      },
    ],
  },
  sliders: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M5 7h14M5 12h14M5 17h14',
      },
      {
        type: 'circle',
        cx: 9,
        cy: 7,
        r: 2,
      },
      {
        type: 'circle',
        cx: 15,
        cy: 12,
        r: 2,
      },
      {
        type: 'circle',
        cx: 8,
        cy: 17,
        r: 2,
      },
    ],
  },
  trash: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M5 7.5h14M9.5 7.5V5h5v2.5',
      },
      {
        type: 'path',
        d: 'M6.8 7.5 7.6 20h8.8l.8-12.5',
      },
    ],
  },
  edit: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M4.5 19.5h4L20 8a2.4 2.4 0 0 0-3.4-3.4L5 16.2z',
      },
    ],
  },
  move: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M4 9h12l-3-3M20 15H8l3 3',
      },
    ],
  },
  cart: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M3 4.5h2.2l2.3 10.2h9.9l2.1-7.4H6.4',
      },
      {
        type: 'circle',
        cx: 9.5,
        cy: 19,
        r: 1.4,
      },
      {
        type: 'circle',
        cx: 16.5,
        cy: 19,
        r: 1.4,
      },
    ],
  },
  copy: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'rect',
        x: 8.5,
        y: 8.5,
        width: 11,
        height: 11,
        rx: 2.5,
      },
      {
        type: 'path',
        d: 'M15.5 5.5h-8a2 2 0 0 0-2 2v8',
      },
    ],
  },
  /**
   * The NFC sticker (docs/NFC_TAGS.md): a luggage-tag body with its hole. Drawn to this set's
   * rules — 24 box, 1.7 stroke, no fill, one ink — so it takes the household's color on a More
   * row like every other utility glyph. Two tones belong to the imported module icons
   * (`paths.custom.ts`), not here.
   */
  tag: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M11.2 3.2H5.4a2.2 2.2 0 0 0-2.2 2.2v5.8c0 .6.2 1.1.6 1.6l6.8 6.8a2.2 2.2 0 0 0 3.1 0l5.8-5.8a2.2 2.2 0 0 0 0-3.1l-6.8-6.8a2.2 2.2 0 0 0-1.5-.7z',
      },
      { type: 'circle', cx: 7.6, cy: 7.6, r: 1.3 },
    ],
  },
  link: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M10.5 13.5a4 4 0 0 0 5.7 0l2.4-2.4a4 4 0 1 0-5.7-5.7l-1 1',
      },
      {
        type: 'path',
        d: 'M13.5 10.5a4 4 0 0 0-5.7 0l-2.4 2.4a4 4 0 1 0 5.7 5.7l1-1',
      },
    ],
  },
  play: {
    viewBox: '0 0 24 24',
    fill: 'currentColor',
    elements: [
      {
        type: 'path',
        d: 'M8.4 5.6a1 1 0 0 1 1.53-.85l8 6.4a1 1 0 0 1 0 1.7l-8 6.4A1 1 0 0 1 8.4 18.4z',
      },
    ],
  },
  timer: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'circle',
        cx: 12,
        cy: 13.6,
        r: 7.6,
      },
      {
        type: 'path',
        d: 'M12 9.8v3.8l2.4 1.6M9.4 2.6h5.2',
      },
    ],
  },
  /*
    STOP: THE ONE MARK ON EVERY TIMER'S STOP BUTTON (the owner, 2026-09-27: "in the pumping, tummy
    time, sleeping timer, create a universal stop icon, instead of using whatever that is. make sure
    stop has same icons"). The universal stop symbol, a filled square with soft corners: the shape
    every platform and every player draws for "stop", so nobody has to learn it.

    12 of the 24 units a side, centered. The running card's pill draws it at 20 pt, where the
    10-unit square it replaces came out 8 pt across and read as a dot beside the caption; at 12 it
    is 10 pt, and plainly a square. The corners are a quarter of the side, 3 units: round enough to
    sit with the set's round caps and joins, square enough never to read as a circle. Filled, like
    `play` and `pause`, which sit beside it on the sticky bar. `StopButton.tsx` says why it is one
    mark for every timer.
  */
  stop: {
    viewBox: '0 0 24 24',
    fill: 'currentColor',
    elements: [{ type: 'rect', x: 6, y: 6, width: 12, height: 12, rx: 3 }],
  },
  babyface: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M12 3.6c-.9-1-2.6-.8-2.9.5',
      },
      {
        type: 'path',
        d: 'M4.6 12.6a7.4 7.4 0 1 1 14.8 0 7.4 7.4 0 0 1-14.8 0Z',
      },
      {
        type: 'path',
        d: 'M4.7 11.4c-.9.2-1.5 1-1.4 1.9.1.9.9 1.5 1.8 1.4',
      },
      {
        type: 'path',
        d: 'M19.3 11.4c.9.2 1.5 1 1.4 1.9-.1.9-.9 1.5-1.8 1.4',
      },
      {
        type: 'path',
        d: 'M9.4 11.9h.02M14.6 11.9h.02',
      },
      {
        type: 'path',
        d: 'M9.9 15.1c1.2 1.1 3 1.1 4.2 0',
      },
    ],
  },
  sun: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'circle',
        cx: 12,
        cy: 12,
        r: 4,
      },
      {
        type: 'path',
        d: 'M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7',
      },
    ],
  },
  moon: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M19.5 14.2A7.8 7.8 0 1 1 9.8 4.5a6.3 6.3 0 0 0 9.7 9.7z',
      },
    ],
  },
  // HAND-DRAWN, like sun and moon: the sprite never had an eye. A crossed-out eye is the one
  // glyph every platform reads as "hide" without a word beside it; the open eye is not needed
  // because the way back is a labelled row, not a second glyph (docs/TOUR.md §5).
  // HAND-DRAWN, 2026-09-19. `pause` pairs with `play` and `stop` (filled, like them) for the
  // sticky timer bar, where a breastfeed's Pause has no room for a word (the owner: "the 'pause'
  // button should just show the logo pause, to save space"). The two arrows are the trend beside a
  // total ("3 oz more than yesterday"): a stem and a head, where `up` and `down` are the bare
  // chevrons a row uses to fold. (Four line glyphs for the stash's kinds of place — counter,
  // fridge, freezer, chest freezer — were drawn here too; the owner's storage pictures replaced
  // them on 2026-09-19, and they went, with `keyb` and `awake`, on 2026-09-26.)
  pause: {
    viewBox: '0 0 24 24',
    fill: 'currentColor',
    elements: [
      { type: 'rect', x: 6.5, y: 5.5, width: 4, height: 13, rx: 1.4 },
      { type: 'rect', x: 13.5, y: 5.5, width: 4, height: 13, rx: 1.4 },
    ],
  },
  /*
    WHERE THE THERMOMETER GOES (the owner, 2026-09-26: "add icons on axillary forehead ear rectal
    perhaps. because some user (me included) dont know without googling what axillary is or
    rectal"). Four small pictures for the temperature sheet's method row (`TempSheet` names them),
    drawn to this set's rules — 24 box, 1.7 stroke, round caps, `currentColor` — so the row paints
    them in its own inks.

    ONE RULE MAKES THEM A SET: a filled dot marks the spot. A figure with one arm raised and the dot
    in the armpit; a baby's face, with eyes and a curl, and the dot on the forehead; an ear with
    the dot at the canal. The fourth
    is a diaper and nothing else — a dot on a diaper reads as a stain, and the diaper already says
    where. They show WHERE a reading is taken and nothing more: no reading, no degree, no color that
    means warm (CLAUDE.md §2 rules 1 and 3).
  */
  'temp-armpit': {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      { type: 'circle', cx: 8.6, cy: 4.9, r: 2.5 },
      {
        type: 'path',
        d: 'M4.8 21v-7.6a3.4 3.4 0 0 1 3.4-3.4h2.7l6.4-6.1a1.25 1.25 0 0 1 1.75 1.8L13.4 11.9V21',
      },
      { type: 'circle', cx: 15.3, cy: 13, r: 1.5, fill: 'currentColor' },
    ],
  },
  'temp-forehead': {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      // a round head, a curl, open eyes and a smile: the old mark was a blank oval and read as a mask
      { type: 'circle', cx: 12, cy: 13.2, r: 7.2 },
      { type: 'path', d: 'M8.4 7.6c.7-1.9 2.8-2.1 3.5-.6' },
      { type: 'circle', cx: 9.4, cy: 12.5, r: 1.2 },
      { type: 'circle', cx: 9.55, cy: 12.55, r: 0.48, fill: 'currentColor' },
      { type: 'circle', cx: 14.6, cy: 12.5, r: 1.2 },
      { type: 'circle', cx: 14.75, cy: 12.55, r: 0.48, fill: 'currentColor' },
      { type: 'path', d: 'M9.8 15.8c.8.85 3.6.85 4.4 0' },
      { type: 'circle', cx: 12, cy: 8.7, r: 1.05, fill: 'currentColor' },
    ],
  },
  'temp-ear': {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M7.4 9.6a5.1 5.1 0 0 1 10.2 0c0 3-1.8 4.2-3 5.2-1 .9-1.3 1.7-1.3 3a3 3 0 0 1-5.7 1.2',
      },
      { type: 'path', d: 'M10.2 9.8a2.3 2.3 0 0 1 4.6 0c0 1.2-.7 1.8-1.5 2.3' },
      { type: 'circle', cx: 11.4, cy: 13.4, r: 1.3, fill: 'currentColor' },
    ],
  },
  'temp-rectal': {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      { type: 'path', d: 'M3.6 7.4h16.8v4c0 5.4-3.6 9-8.4 9s-8.4-3.6-8.4-9z' },
      { type: 'path', d: 'M3.7 10.1h16.6' },
      { type: 'path', d: 'M7.3 12.4c1.5 1 2.3 2.8 2.4 5M16.7 12.4c-1.5 1-2.3 2.8-2.4 5' },
    ],
  },
  drop: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M12 21a6.2 6.2 0 0 0 6.2-6.2C18.2 10.6 12 3.2 12 3.2S5.8 10.6 5.8 14.8A6.2 6.2 0 0 0 12 21z',
      },
    ],
  },
  poo: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M13.9 3C15.1 4.1 15.7 5.5 15.1 6.9C16.5 7.4 16.9 9.3 15.8 10.2C18.1 10.6 19.4 12.6 18.3 14.5C20.4 15.1 21.6 18 19.6 19.8C19 20.3 18.2 20.5 17.3 20.5H6.7C5.8 20.5 5 20.3 4.4 19.8C2.4 18 3.6 15.1 5.7 14.5C4.6 12.6 5.9 10.6 8.2 10.2C7.1 9.3 7.5 7.4 8.9 6.9C9.5 5.2 11 4.3 12.4 4.1C13 4 13.5 3.6 13.9 3Z',
      },
      { type: 'path', d: 'M5.7 14.5C9.2 15.6 14.8 15.6 18.3 14.5' },
      { type: 'path', d: 'M8.2 10.2C10.6 11.1 13.4 11.1 15.8 10.2' },
    ],
  },
  /*
    THE SAME TWO, SOLID (2026-09-27; `DIAPER_KIND_SOLID_GLYPHS` above has the owner's words). A stroke
    icon whose one shape is also FILLED in its ink — the way the thermometer glyphs fill their dots —
    so the stroke still sets the edge and the solid glyph covers exactly the outline's box. The pile's
    two grooves follow its tier curves between 24% and 76% of the upper one and 16% and 84% of the
    lower, 3 units across as drawn: the stroke round them takes 0.85 from either side, and 1.3 stays
    open. Each stays a third of a unit or more inside the outline, so two units of brown hold the
    tiers together at the sides (`statTable.test.ts` measures both, and that each groove winds
    against the outline).
  */
  'drop-solid': {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M12 21a6.2 6.2 0 0 0 6.2-6.2C18.2 10.6 12 3.2 12 3.2S5.8 10.6 5.8 14.8A6.2 6.2 0 0 0 12 21z',
        fill: 'currentColor',
      },
    ],
  },
  'poo-solid': {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M13.9 3C15.1 4.1 15.7 5.5 15.1 6.9C16.5 7.4 16.9 9.3 15.8 10.2C18.1 10.6 19.4 12.6 18.3 14.5C20.4 15.1 21.6 18 19.6 19.8C19 20.3 18.2 20.5 17.3 20.5H6.7C5.8 20.5 5 20.3 4.4 19.8C2.4 18 3.6 15.1 5.7 14.5C4.6 12.6 5.9 10.6 8.2 10.2C7.1 9.3 7.5 7.4 8.9 6.9C9.5 5.2 11 4.3 12.4 4.1C13 4 13.5 3.6 13.9 3ZM9.715 12.168C11.173 12.436 12.827 12.436 14.285 12.168A1.5 1.5 0 0 0 13.743 9.217C12.553 9.436 11.447 9.436 10.257 9.217A1.5 1.5 0 0 0 9.715 12.168ZM7.253 16.419C10.151 16.952 13.849 16.952 16.747 16.419A1.5 1.5 0 0 0 16.204 13.468C13.575 13.952 10.425 13.952 7.796 13.468A1.5 1.5 0 0 0 7.253 16.419Z',
        fill: 'currentColor',
      },
    ],
  },
  /*
    WHAT A CARE ITEM IS, below the picture size (2026-09-26). Above 16 pt these two are pictures
    (`illustrated.ts`: two softgels, and a heart); these are the same subjects as line glyphs, for
    the one case a caller draws them small. A softgel on the diagonal with its shine, and a heart.
  */
  'care-vitamin': {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M10.97 18.97l8-8a4.2 4.2 0 0 0-5.94-5.94l-8 8a4.2 4.2 0 0 0 5.94 5.94z',
      },
      { type: 'path', d: 'M8.3 13.1l2-2' },
    ],
  },
  'care-other': {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      {
        type: 'path',
        d: 'M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z',
      },
    ],
  },
  /*
    WHO YOU ARE AT HOME (the owner, 2026-09-27: "at onboarding question: your role at home, create
    icons for parent and caregiver."). The two answers on setup's first page, each drawn over its
    word on a tile (the app's `screens/onboarding/RolePicker.tsx`), at 32 pt. Drawn here to this
    set's rules — 24 box, 1.7 stroke, round caps and joins, `currentColor` — and in two tones the way
    the owner's module glyphs are (`paths.custom.ts`): a detail in the second tone, never a fact.

    ONE ADULT, DRAWN ALIKE IN BOTH — the same head, the same curve of a shoulder, in the same corner
    — so the pair reads as a set, and what the adult is DOING is the answer:

      `parent`    — holding a baby close. The baby's head rests against the shoulder, the forearm
                    curves under the bundle and round the head, and the blanket's edge runs from the
                    baby's chin to the crook of the arm, in the second tone.
      `caregiver` — standing beside a small child, a heart between them: the heart's outline in the
                    ink and its fill in the second tone, the owner's bath-bubble way.

    Not `users` (two adults, the second behind the first) and not `babyface` (a face): both were
    reviewed beside these at 24, 28 and 32 px so neither reads as either. They show who somebody is
    to the baby and nothing more — no sex, no age past "a small child" — and the words under them
    carry the answer; the pictures only help it be found.
  */
  parent: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      { type: 'circle', cx: 8.2, cy: 4.8, r: 2.7 },
      { type: 'path', d: 'M2.6 21v-3.9c0-3.7 2.5-6.7 5.6-6.7 1.2 0 2.3.3 3.2.9' },
      { type: 'circle', cx: 16.4, cy: 11.8, r: 2.4 },
      { type: 'path', d: 'M5.8 16.4c2.6 2.8 7 3.8 11 2.6 2.3-.7 3.9-2.3 4.5-4.4' },
      { type: 'path', d: 'M14.1 13.5c-2.2 1.7-5 2.7-8.3 2.9', tone: 'secondary' },
    ],
  },
  caregiver: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.7,
    elements: [
      { type: 'circle', cx: 7.6, cy: 4.8, r: 2.7 },
      { type: 'path', d: 'M2 21v-3.9c0-3.7 2.5-6.7 5.6-6.7s5.6 3 5.6 6.7V21' },
      { type: 'circle', cx: 18.4, cy: 12.6, r: 1.9 },
      { type: 'path', d: 'M15.6 21v-1.4a2.8 2.8 0 0 1 5.6 0V21' },
      {
        type: 'path',
        d: 'M16.4 8.4s-2.6-1.5-2.6-3.4a1.4 1.4 0 0 1 2.6-.8 1.4 1.4 0 0 1 2.6.8c0 1.9-2.6 3.4-2.6 3.4Z',
        fill: 'secondaryColor',
      },
    ],
  },
  arrowUp: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.9,
    elements: [{ type: 'path', d: 'M12 19V5M6.2 10.8 12 5l5.8 5.8' }],
  },
  arrowDown: {
    viewBox: '0 0 24 24',
    fill: 'none',
    strokeWidth: 1.9,
    elements: [{ type: 'path', d: 'M12 5v14M6.2 13.2 12 19l5.8-5.8' }],
  },
};

export const ICON_PATHS: Record<IconName, IconDef> = {
  ...SPRITE,
  // the bar's glyphs before the owner's set, so a tab with no file keeps its old drawing
  'tab-home-regular': SPRITE.home,
  'tab-home-active': SPRITE.home,
  'tab-schedule-regular': SPRITE.cal,
  'tab-schedule-active': SPRITE.cal,
  'tab-stash-regular': SPRITE.box,
  'tab-stash-active': SPRITE.box,
  'tab-shopping-regular': SPRITE.cart,
  'tab-shopping-active': SPRITE.cart,
  'tab-more-regular': SPRITE.more,
  'tab-more-active': SPRITE.more,
};

export const ICON_NAMES = Object.keys(ICON_PATHS) as IconName[];
