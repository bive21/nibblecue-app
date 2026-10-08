/**
 * The pieces Supplies, the shopping list and their two sheets all draw (the shopping brief,
 * 2026-09-19 §1). Built once here because the brief's own reason for listing them is the bug
 * they prevent: a product read one way on the catalog and another way in the picker is two
 * designs for one thing, and the household has to learn both.
 *
 * WHAT THEY HAVE IN COMMON IS THE ACCENT. Every colored thing on these four screens — the icon
 * square behind a category, the ring round a plus, the fill of an "on list" pill, the wash under
 * a row that is already on it — is one hue the household picked in Settings, taken to a tint, a
 * soft tint or a press by `deriveAccent`. Nothing here holds a color of its own, so the six
 * schemes, dark and night all follow without a single value being re-measured (`theme/accent.ts`
 * carries the arithmetic and the one rule that is a measurement rather than a taste).
 *
 * AND THE GROUND IS NOT THE ACCENT'S. These screens sit on `paper` — the warm neutral no scheme
 * overlays — so the accent is the ONLY thing on a page of white cards carrying the household's
 * color. That is the whole of the brief's "never use it for large fills".
 */
import {
  MODULE_BY_ID,
  SUPPLY_CATEGORIES,
  supplyCategory,
  supplyIcon,
  supplyLabel,
  type ModuleId,
  type SupplyItem,
} from '@nibblecue/core';
import {
  AppText,
  BodySm,
  CountRoll,
  Divider,
  Icon,
  useAccent,
  useCategory,
  useTheme,
  type IconName,
} from '@nibblecue/ui';
import { CART_CHIP } from '@nibblecue/ui/layout';
import { isValidElement, type ReactNode, type Ref } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

/* ------------------------------------------------------------------ a section's caption */

/**
 * `YOUR SUPPLIES · 12` over its card, with an optional control on the right (§1c).
 *
 * The UI face and not the mono one (§FONTS: the one substitution the brief allowed). These pages
 * carry a caption every sixty points — fifteen shelves, one per shop — and a monospaced all-caps
 * line repeated that often is what makes a screen look generated rather than designed. The
 * letter-spacing is what keeps it a caption; without it, it is just small bold prose.
 */
export function SectionCaption({
  label,
  lede,
  right,
  icon,
  count,
  style,
}: {
  label: string;
  /** A sentence under the caption, where the section needs one ("Pick a category to add…"). */
  lede?: string;
  /** The control on the right — a sort picker, a Clear, a count. */
  right?: ReactNode;
  /**
   * A glyph before the words — the basket's cart, which the shopping list drops a ticked thing
   * into (2026-09-26, S2). Drawn by the caller, so it can be measured and bounced.
   */
  icon?: ReactNode;
  /**
   * The number the words are about, when they are about one — "To buy · 3" — and the `bump` that
   * rolls it (`CountRoll`, 2026-09-26, S3): a change with a new bump rolls, any other is just set.
   */
  count?: { value: number; bump: number };
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const words =
    count === undefined ? (
      <AppText variant="caption" ink="text2" accessibilityRole="header">
        {label}
      </AppText>
    ) : (
      <CountRoll
        variant="caption"
        ink="text2"
        accessibilityRole="header"
        value={count.value}
        bump={count.bump}
      >
        {label}
      </CountRoll>
    );
  return (
    <View style={[styles.captionRow, { gap: t.space.md }, style]}>
      <View style={styles.grow}>
        {icon === undefined ? (
          words
        ) : (
          <View style={[styles.row, { gap: t.space.sm }]}>
            {icon}
            <View style={styles.grow}>{words}</View>
          </View>
        )}
        {lede === undefined ? null : <BodySm>{lede}</BodySm>}
      </View>
      {right ?? null}
    </View>
  );
}

/** A caption's control on the right: plain accent words, 44 through hitSlop (§7). */
export function CaptionAction({
  label,
  accessibilityLabel,
  onPress,
  testID,
}: {
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
  testID?: string;
}) {
  const t = useTheme();
  const a = useAccent();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={t.space.md}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
      testID={testID}
    >
      <AppText variant="bodySm" style={[styles.semibold, { color: a.accent }]}>
        {label}
      </AppText>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ a category's square */

const SQUARE = 40;
/** The picker row in Edit supply, where the square sits beside a field and not above rows (§6). */
export const SQUARE_SM = 32;
/** A tile in Add supply's "What are you adding?" grid, where the picture IS the choice. */
export const SQUARE_LG = 52;

/**
 * 40×40, the CATEGORY'S OWN HUE as a solid fill, its glyph in the matching ink (§6).
 *
 * IT WAS THE ACCENT AT 14%, AND THAT IS WHY THE PAGE LOOKED GREY (the owner, 2026-09-21: "bring
 * back solid background color in the supplies list… the problem is there is not enough color on
 * the page"). Fifteen shelves wearing one pale wash of one hue is fifteen identical squares: the
 * color was there to say "this is a supply", which the page already says, rather than to say
 * WHICH supply — the one thing a parent scanning the list is actually looking for.
 *
 * So the square takes the module hue the rest of the app already uses for that kind of thing:
 * diapers the diaper brown, bottles the accent, wipes the cyan. Solid `soft` behind the `fg`
 * glyph is the same token pair every tile, row and chip in the app draws with, so it is measured
 * by the contrast gate rather than chosen by eye, and it means the list is colored the same way
 * Today is.
 *
 * ONE GLYPH PER CATEGORY, which is why the PICTURE reads `supplyIcon` and not
 * `SupplyCategory.icon`: the second is a MODULE key and three categories share `bottle`, so a
 * catalog drawn from it has Formula, Bottles and Nipples as the same picture. The COLOR is the
 * module's, because a hue groups and a glyph identifies, and those are two different jobs.
 */
/**
 * The picture's size in a square of `size`, as a fixed share of it. The smallest square drawn
 * (`SQUARE_SM`, 32) still gets 17, over `ILLUSTRATED_MIN_SIZE`, so every square shows the picture.
 */
const squareGlyph = (size: number): number => Math.round(size * 0.53);
/**
 * THE DIAPER PICTURE READS SMALLER THAN ITS BOX (2026-10-05). The PNG's opaque mass is the diaper
 * body with sparkles around it; the body itself sits near the canvas centre, but transparent
 * padding and the sparkles leave it optically underfilled inside the colored disc. Scale the
 * diaper glyph ~20% while the disc stays the same size, and clip to the disc so nothing spills.
 * Other categories keep the shared share.
 */
const DIAPER_GLYPH_SCALE = 1.2;

export function CategorySquare({ category, size = SQUARE }: { category: string; size?: number }) {
  const t = useTheme();
  const cat = useCategory(categoryModule(category));
  const icon = supplyIcon(category) as IconName;
  const glyph = Math.round(squareGlyph(size) * (icon === 'diaper' ? DIAPER_GLYPH_SCALE : 1));
  return (
    <View
      style={[
        styles.center,
        {
          width: size,
          height: size,
          borderRadius: size >= SQUARE ? t.radius.m : t.radius.s,
          backgroundColor: cat.disc ?? cat.soft,
          overflow: 'hidden',
        },
      ]}
    >
      <Icon name={icon} size={glyph} color={cat.fg} />
    </View>
  );
}

/* ------------------------------------------------------------------ the thing, thrown */

/** The ring round a thrown square, in the category's own ink: its edge on any ground it crosses. */
const CHIP_RING = (CART_CHIP - SQUARE_SM) / 2;
/** A one-off's chip: the list's own tick, filled, at the size its row draws it. */
const CHIP_TICK = 28;

/**
 * WHAT FLIES — into the Supplies page's cart from a +, and into the shopping list's basket from a
 * tick (2026-09-26): the thing's own category square, the picture on its row, ringed in its
 * category's ink so its edge holds at 3:1 on the page, the cards and the tinted card it lands in
 * (`listMotion.test.ts` measures it in every scheme, light and dark; nothing flies in Night).
 *
 * A one-off (`category` null) has no picture, so what goes into the basket is its tick: the
 * accent's disc with the check in `onAccent`, the two inks every ticked circle on the list is
 * drawn in and measured at (packages/ui `tickDraw.test.ts`).
 */
export function ThrownChip({ category }: { category: string | null }) {
  const t = useTheme();
  const a = useAccent();
  const cat = useCategory(categoryModule(category ?? ''));
  return (
    <View
      style={[
        styles.chip,
        category === null
          ? null
          : { borderWidth: CHIP_RING, borderColor: cat.fg, borderRadius: t.radius.s + CHIP_RING },
      ]}
    >
      {category === null ? (
        <View
          style={[
            styles.center,
            {
              width: CHIP_TICK,
              height: CHIP_TICK,
              borderRadius: CHIP_TICK / 2,
              backgroundColor: a.accent,
            },
          ]}
        >
          <Icon name="check" size={15} color={a.onAccent} />
        </View>
      ) : (
        <CategorySquare category={category} size={SQUARE_SM} />
      )}
    </View>
  );
}

/**
 * The module a supply category is colored by — the `icon` on its own `SUPPLY_CATEGORIES` row,
 * which is a module key. A category the registry does not know (a future one, a bad id) falls
 * back to the bottle's hue rather than throwing: a list is never worth a crash.
 *
 * Exported for setup's supplies list, which draws the same category in a `Row`'s own 32pt chip
 * rather than in a `CategorySquare` — one rule for which hue a category wears, so the list a
 * parent meets during setup is colored the same way the Supplies catalog they meet later is.
 */
export function categoryModule(category: string): ModuleId {
  const id = SUPPLY_CATEGORIES.find(c => c.id === category)?.icon;
  return id !== undefined && id in MODULE_BY_ID ? (id as ModuleId) : 'bottle';
}

/* ------------------------------------------------------------------ the on-list toggle */

/**
 * The plus that puts a supply on the list, and the pill that says it is already there (§1b).
 *
 * TWO SHAPES, NOT TWO COLORS. Off is a ring with a plus in it; on is a filled pill carrying a
 * check and a word — "On list" in the catalog, the quantity in the picker. A state told by fill
 * alone is a state a color-blind parent reads as "nothing happened" (CLAUDE.md §6), and the
 * shape change is also what makes the tap feel like it landed without a toast.
 *
 * IT IS A PLUS AND NOT A TICK, still: a round tick is how you take something OFF a list you are
 * working through, and the catalog is not that list (the owner, 2026-09-16, and the reason the
 * shopping list's own rows use a circle instead).
 *
 * `onAccent` and not white: a household whose accent is a pale yellow gets ink on the fill
 * instead, decided once in the theme (`accent.ts`) rather than guessed per component.
 */
export function OnListToggle({
  on,
  label,
  accessibilityLabel,
  onPress,
  pressRef,
  testID,
}: {
  on: boolean;
  /** What the filled pill says — `On list`, or the quantity. Ignored when off. */
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  /**
   * The control's own box, for a caller that throws something out of it (the Supplies page's cart,
   * 2026-09-26). On the control itself and not a view round it: a wrapper would cut the 44-point
   * reach its hitSlop gives it, which Android never lets past a parent's edge.
   */
  pressRef?: Ref<View>;
  testID?: string;
}) {
  const t = useTheme();
  const a = useAccent();
  return (
    <Pressable
      ref={pressRef}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      // drawn at 40 and 36; 44 through hitSlop, which is the rule (§7, CLAUDE.md §6)
      hitSlop={t.space.sm}
      style={({ pressed }) => [
        styles.center,
        styles.toggle,
        on
          ? {
              height: 36,
              paddingHorizontal: t.space.md,
              gap: t.space.xs,
              borderRadius: t.radius.pill,
              backgroundColor: a.accent,
            }
          : {
              width: 40,
              height: 40,
              borderRadius: 20,
              borderWidth: 1.5,
              borderColor: a.accent,
            },
        { opacity: pressed ? 0.7 : 1 },
      ]}
      testID={testID}
    >
      {on ? (
        <>
          <Icon name="check" size={13} color={a.onAccent} />
          <AppText variant="bodySm" style={[styles.semibold, { color: a.onAccent }]}>
            {label}
          </AppText>
        </>
      ) : (
        <Icon name="plus" size={17} color={a.accent} />
      )}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ a product's row */

/**
 * One product, wherever it is read (§1a): the square, the name, one caption line, one control.
 *
 * THE CAPTION IS THE AISLE'S SENTENCE — `Diapers · Size 3 · Target` — and it is assembled with
 * the missing parts left out rather than with empty ones printed, so a supply with nothing but a
 * brand shows its category and stops. The old row printed "never recorded bought" here, which
 * told a parent about the app's records instead of about the box they are looking for.
 *
 * TAPPING THE TEXT OPENS THE SUPPLY; the control is the list. That is the opposite of a shopping
 * row, where tapping the name ticks it — because here adding is the errand and it has the plus,
 * and there ticking is the errand and the name is its biggest target.
 */
export function ProductRow({
  item,
  onPress,
  trailing,
  highlight = false,
  withShop = true,
  caption: given,
  testID,
}: {
  item: SupplyItem;
  onPress?: () => void;
  trailing?: ReactNode;
  /** The row is already on the list: the 6% wash, which stays quieter than any chip (§1b). */
  highlight?: boolean;
  /** Off on the shopping list, where the shop is the heading the row sits under (§5). */
  withShop?: boolean;
  /** A caption of the caller's own — a one-off, which has no catalog entry to describe. */
  caption?: string;
  testID?: string;
}) {
  const t = useTheme();
  const a = useAccent();
  const name = supplyLabel(item);
  const caption = given ?? productCaption(item, supplyCategory(item.category).label, withShop);
  const body = (
    <View style={[styles.grow, { gap: 2 }]}>
      <AppText variant="bodyStrong" numberOfLines={2}>
        {name}
      </AppText>
      {caption === '' ? null : (
        <BodySm ink="text2" numberOfLines={2}>
          {caption}
        </BodySm>
      )}
    </View>
  );
  return (
    <View
      style={[
        styles.row,
        {
          paddingHorizontal: t.space.lg,
          paddingVertical: t.space.md,
          gap: t.space.md,
          backgroundColor: highlight ? a.tintSoft : 'transparent',
        },
      ]}
      testID={testID}
    >
      <CategorySquare category={item.category} />
      {onPress === undefined ? (
        body
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={name}
          onPress={onPress}
          style={({ pressed }) => [styles.grow, { opacity: pressed ? 0.6 : 1 }]}
          testID={testID === undefined ? undefined : `${testID}.open`}
        >
          {body}
        </Pressable>
      )}
      {trailing ?? null}
    </View>
  );
}

/**
 * `Diapers · Size 3 (16–28 lb) · Target`, with nothing missing printed and no trailing dots (§1a).
 *
 * IT READS `notes` WHEN THERE IS NO SIZE, and that is a compatibility rule rather than a taste.
 * The sheet has asked for the aisle detail in three different fields over three revisions —
 * `variant` and `pack` when it asked the category's own vocabulary, `notes` after the
 * 2026-09-18 simplification, `variant` again now that the caption has to carry it — and a
 * household's rows are never rewritten to catch up (CLAUDE.md §7). So the caption reads
 * whichever of them a row actually has, and a parent who typed their size two revisions ago
 * still sees it on the row.
 *
 * Pure and exported so the tripwire can hold it: the rule worth a test is that an empty field
 * never becomes an empty segment, which is how a caption ends up reading `Diapers ·  · `.
 */
export function productCaption(
  item: SupplyItem,
  categoryLabel?: string,
  /** Off on the shopping list, where the shop is the heading the row already sits under. */
  withShop = true,
): string {
  const clean = (s: string | null | undefined): string => {
    const v = (s ?? '').trim();
    return v === '—' ? '' : v;
  };
  const size = [clean(item.variant), clean(item.pack)].filter(s => s !== '').join(' · ');
  return [categoryLabel, size === '' ? clean(item.notes) : size, withShop ? clean(item.store) : '']
    .map(s => clean(s))
    .filter(s => s !== '')
    .join(' · ');
}

/* ------------------------------------------------------------------ one card of rows */

/**
 * The card every list on these screens is drawn in (§1d): a white surface, a hairline round it,
 * and a hairline between its children — never a shadow, and never one card per group.
 *
 * ONE CARD AND NOT ONE PER SECTION. The brief says it twice (§2 "ONE card containing only
 * categories that have ≥1 product", §5 "Do NOT render separate cards per shop") and the stash
 * redesign learned the same thing a day earlier: a page of small cards separated by ground is
 * read as several lists, and the ground showing through between two halves of one list is what
 * makes it feel disjointed. The sub-headings go INSIDE.
 */
export function ListCard({ children, testID }: { children: ReactNode; testID?: string }) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="list"
      style={[
        styles.card,
        {
          borderRadius: t.radius.l,
          borderColor: t.color.line,
          backgroundColor: t.color.surfaceSolid,
        },
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
}

/** A sub-heading inside the card — a category on Supplies, a shop on the list (§1d, §5). */
export function CardSection({
  label,
  icon,
  right,
  first = false,
  band = false,
  children,
}: {
  label: string;
  /** A shop's icon, drawn beside its name; categories carry theirs on every row instead. */
  icon?: IconName;
  right?: ReactNode;
  /** The first section inside a card draws no rule above it — nothing to divide it from. */
  first?: boolean;
  /**
   * A shop band inside the one shopping card: a soft fill, no rule of its own. The fill is the
   * separation, so a hairline above it would be a second line.
   */
  band?: boolean;
  children: ReactNode;
}) {
  const t = useTheme();
  return (
    <View>
      {first || band ? null : <Divider />}
      <View
        style={[
          styles.captionRow,
          band
            ? {
                minHeight: 34,
                paddingHorizontal: t.space.lg,
                paddingVertical: t.space.sm,
                gap: t.space.sm,
                backgroundColor: t.color.accentSoft,
              }
            : {
                paddingHorizontal: t.space.lg,
                paddingTop: first ? t.space.lg : t.space.md,
                paddingBottom: t.space.xs,
                gap: t.space.sm,
              },
        ]}
      >
        {icon === undefined ? null : (
          <Icon name={icon} size={15} color={band ? t.color.accent : t.color.text2} />
        )}
        <View style={styles.grow}>
          <AppText variant="caption" ink="text2" accessibilityRole="header">
            {label}
          </AppText>
        </View>
        {right ?? null}
      </View>
      {children}
    </View>
  );
}

/**
 * Rows inside a section, hairlined between and never above the first.
 *
 * The rule starts where the NAME does, past the icon square, so a column of squares reads as one
 * column rather than as a stack of boxed cells. `ROW_INSET` is that measurement in one place:
 * the row's own left padding, the square, and the gap after it.
 */
const ROW_INSET = 11 + SQUARE + 8;

export function SectionRows({ children }: { children: readonly ReactNode[] }) {
  return (
    <View>
      {children.map((child, i) => (
        /*
          THE WRAPPER TAKES ITS ROW'S OWN KEY (2026-09-26). It was keyed by its index, on the view
          that React reads a child's key through its wrapper — it does not: keys are compared only
          between siblings, so with index keys a line put at the top of a group handed every row
          under it a wrapper that had held the row above, and React rebuilt each of them. A row
          rebuilt forgets what it was doing — a tick mid-draw, a swipe half open, the shopping
          list's glide to the basket — so the wrapper is now the row's, and a row keeps itself
          wherever the list moves it. The index is the fallback for a child with no key.
        */
        <View key={isValidElement(child) && child.key !== null ? child.key : `row-${i}`}>
          {i > 0 ? <Divider inset={ROW_INSET} /> : null}
          {child}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  captionRow: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1, minWidth: 0 },
  center: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  row: { flexDirection: 'row', alignItems: 'center' },
  toggle: { flexDirection: 'row' },
  card: { borderWidth: 1, overflow: 'hidden' },
  semibold: { fontWeight: '600' },
  chip: {
    width: CART_CHIP,
    height: CART_CHIP,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
