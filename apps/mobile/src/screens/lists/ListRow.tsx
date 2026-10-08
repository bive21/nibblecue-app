/**
 * One line on the shopping list (the shopping brief §5; replaces `ShopLine.tsx`).
 *
 * THE ROW IS ONE LINE HIGH NOW. The old one was three: the name and a ✕, then the size, then a
 * control strip carrying the quantity, a link pill and a Details pill. Six things on a list ran
 * to a screen and a half, and three of those controls were the same errand — "this line is
 * wrong, open it" — spelled three ways. So: a tick at the head, the name and its caption in the
 * middle, the quantity on the right, and everything else behind a tap on the text or a swipe.
 *
 * WHAT MOVED, AND WHERE IT WENT:
 *  - `Details` → tapping the name's block opens the supply. One target, the obvious one.
 *  - the `✕` → a swipe (a list you are working through should not carry a delete under every
 *    thumb), and the stepper's last −, which becomes an ✕ at quantity one and removes the line.
 *    A one-off gets the same stepper as a supply: two bananas is a thing a shared list has to
 *    carry (the owner, 2026-10-03), and without a supply sheet the stepper is also how it leaves.
 *  - the link pill → the supply sheet, where the URL is a field you can also correct.
 *  - the trailing three-dot menu → gone (2026-10-05). Removal is the swipe and the stepper's ✕;
 *    editing a supply stays on the name tap that already opens it.
 *
 * TAPPING THE TICK IS THE ACT, and the tick is what the name is NOT. On the catalog the name
 * opens the product because adding is the errand there; here ticking is the errand, and it has
 * its own circle with a 44-point reach so a thumb in a shop does not have to aim.
 *
 * THE DOWN BUTTON IS A MINUS UNTIL THERE IS ONE LEFT, THEN IT IS AN ✕ (the owner, 2026-09-19:
 * "the button to reduce the qty is marked with 'x', but it should be '-'. only when current qty
 * is one, the button becomes 'x' and it removes it from the list"). Restored 2026-10-05 over the
 * UI 10-4 trial that kept a disabled minus at one and put Remove in an overflow menu.
 *
 * It was an `x` at every quantity, because the icon set had no minus — so the control that means
 * "one fewer" wore the glyph that means "remove", four times over on a list of four. The set has
 * a `minus` now, and the shape of the button says which of the two things this tap will do.
 *
 * That also replaces the muted-at-one rule. The worry was a mis-tap destroying a line before the
 * parent saw which one — but a control whose glyph CHANGES at the last step is not the same tap
 * twice, and the toast carries an undo either way. A dead button with no way out of it was the
 * worse answer: a supply-backed line could then only be removed from a sheet two taps away.
 *
 * THE TICK DRAWS ITSELF (the owner, 2026-09-25, of the "that's cool" list). `TickMark` is the same
 * check the row always drew, and when the line is ticked its stroke runs from start to tip; the
 * tick that finishes the list gets a small sparkle round it (`burst`, decided by the screen). For
 * the draw to be SEEN, two things hold: the screen keeps a line ticked here in its place for a
 * moment before it moves to the basket (`listMotion.ts`), and this row keeps its tick MOUNTED
 * across the change — one tree for both states below, the tick first in it, so the mark that
 * watched the line go from open to ticked is the one on screen when it happens.
 *
 * AND THE REST OF THE TICK IS SEEN TOO (the owner, 2026-09-26: *"add animation in shopping list to
 * make it more fun"*). The circle FILLS — the accent grows out of the middle of the ring rather than
 * switching on — five dots in the thing's own color are thrown out round it (`dots`, decided by the
 * screen; the tick that finishes the list keeps its rays instead), and the line through the words
 * is DRAWN across them, left to right (`StrikeText`). An untick runs it all back without the dots:
 * the stroke lifts off, the circle clears once it has, and the line is taken back. Under reduce
 * motion and in the amber Night each is simply there or not (`motionStill`).
 *
 * AND A SWIPE TAKES IT OFF THE LIST (2026-09-26, S5). Past half the row's width, or on a flick once
 * Remove is showing, letting go is the same as tapping Remove: one `tap` is felt, and the screen
 * takes the line off with the same write and the same Undo (`onRemove`) — and draws it carrying on
 * off the edge from where the finger left it while its gap closes (`RowMotion`'s `away`). A shorter
 * swipe still stops with Remove showing. A screen reader never needs the gesture: the Remove behind
 * the row is a button it reaches as it always did, and so are the ✕ and the stepper's last −.
 *
 * THE SWIPE IS THE APP'S ONE SWIPE NOW (2026-09-29, packages/ui `SwipeRow`). It was written here,
 * and the log's rows needed the same thing when the owner asked for Delete behind them; a second
 * copy would have been a second feel. What it keeps of this row is exactly what it did: a swipe
 * that takes the line off (`removes`), Remove always behind the row for a screen reader
 * (`backing="always"`), and the row's own layout on the layer that slides. What it adds is one row
 * out at a time, a tap elsewhere sending it home, and the size held still while it moves; and the
 * word Remove is white on the danger fill in every theme now (it was the accent's ink, which is
 * white only in light, and all but vanished on the dark red in dark and Night).
 */
import { SHOPPING_QTY_MAX, type ShoppingLine, type SupplyItem } from '@nibblecue/core';
import {
  AppText,
  BodySm,
  Icon,
  Meta,
  StrikeText,
  SwipeRow,
  TickMark,
  useAccent,
  useCategory,
  useTheme,
} from '@nibblecue/ui';
import { motionStill } from '@nibblecue/ui/layout';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { SHOPPING } from '../../lists/copy';
import { TICK_FILL, tickFillFrames } from './listMotion';
import { CategorySquare, categoryModule, productCaption } from './parts';
import { shoppingRowTitle } from './rowTitle';

const TICK = 24;
const STEP = 34;
/** Matches `CategorySquare`'s default, so a one-off's blank keeps the names in one column. */
const DISC = 40;

export interface ListRowProps {
  line: ShoppingLine;
  /** The catalog item behind the line, where there is one; null for a one-off. */
  item: SupplyItem | null;
  onTick: (next: boolean) => void;
  onQty: (next: number) => void;
  onRemove: () => void;
  /** Open the supply behind it. Absent for a one-off, which has no catalog entry. */
  onOpen?: (() => void) | undefined;
  /** This tick finishes the list: the sparkle plays round it as it draws (the screen decides). */
  burst?: boolean;
  /** This tick throws its dots, in the thing's own color (the screen decides). */
  dots?: boolean;
  /**
   * The view a tick throws the thing's picture into the basket from (2026-09-26, S2): its category
   * square while it is to buy, or its tick for a one-off, which has no picture. Handed the view as
   * it mounts and null as it goes.
   */
  iconRef?: (node: View | null) => void;
  /**
   * A LINE TO READ: ticked or not, how many, and the supply behind it, with no tick to press, no
   * stepper and no swipe to Remove. For somebody who may not change the list (a view only member;
   * `useCanLog`): the server refuses every write of theirs (`app.can_write`).
   */
  readOnly?: boolean;
  testID: string;
}

/** The ring round an open tick. */
const RING = 2;
/** The circle's fill reaches half a point past the ring, so no sliver of the ring shows round it. */
const FILL_SEAM = 0.5;
/** And is laid from inside the ring (where a child starts) out past it: this far each side. */
const FILL_OVER = RING + FILL_SEAM;

export function ListRow({
  line,
  item,
  onTick,
  onQty,
  onRemove,
  onOpen,
  burst = false,
  dots = false,
  iconRef,
  readOnly = false,
  testID,
}: ListRowProps) {
  const t = useTheme();
  const a = useAccent();
  const checked = line.checkedAt !== null;
  const oneOff = item === null;
  const still = motionStill(t.reduceMotion, t.theme);
  /** The name opens the supply behind it: only a supply's, and only while it is to buy. */
  const opens = !checked && !oneOff && onOpen !== undefined;
  /*
    THE DOTS ARE THE THING'S OWN COLOR: the category's ink, which the square beside the name is
    drawn in and every tile of that kind is — diapers brown, wipes blue. A one-off has no category,
    so it throws the accent. Every module's ink and the accent are measured at 3:1 on the grounds a
    line is ticked on — the list's card and the basket's paper — in packages/ui's `tickDraw.test.ts`.
  */
  const cat = useCategory(categoryModule(item?.category ?? ''));
  const dotInk = oneOff ? a.accent : cat.fg;

  /*
    THE CIRCLE FILLS AND CLEARS (`TICK_FILL`). It used to switch its background on with the tick,
    and that is fine for a tick — but an untick that runs its stroke back needs the fill still
    under the stroke while it goes, or the stroke is white on the white card. So the fill is its own
    layer over the ring: it grows out of the middle on a tick, and on an untick it waits for the
    stroke to start lifting, swells a little and is gone. A layout effect, so the frame that shows
    the change already has the fill where its move starts; anything but a change this row saw — the
    first frame, reduce motion, Night — is set where it rests.
  */
  const fill = useRef(new Animated.Value(checked ? 1 : 0)).current;
  const filled = useRef(checked);
  useLayoutEffect(() => {
    const changed = filled.current !== checked;
    filled.current = checked;
    if (!changed || still) {
      fill.setValue(checked ? 1 : 0);
      return undefined;
    }
    const run = Animated.timing(fill, {
      toValue: checked ? 1 : 0,
      duration: checked ? TICK_FILL.inMs : TICK_FILL.outMs,
      delay: checked ? 0 : TICK_FILL.outDelay,
      easing: checked ? Easing.out(Easing.quad) : Easing.in(Easing.quad),
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [checked, still, fill]);
  const fillMotion = useMemo(() => {
    const f = tickFillFrames();
    return {
      opacity: fill.interpolate({ ...f.opacity, extrapolate: 'clamp' }),
      transform: [{ scale: fill.interpolate({ ...f.scale, extrapolate: 'clamp' }) }],
    };
  }, [fill]);
  /*
    The name is what was entered (`Advent`, `Banana`). The category and the size sit under it
    (`Bottles · 4 oz`, or `One-off`). Share still says `Diapers: Pampers` through `lineTitle`.
    The shop is the band this row already sits under, so it is not repeated here.
  */
  const name = shoppingRowTitle(line);
  const caption = oneOff
    ? SHOPPING.oneOff
    : productCaption(item, line.categoryLabel ?? undefined, false);

  /** Down at one takes the line off the list; above one it is one fewer (see the header). */
  const last = line.qty <= 1;
  /**
   * One −/+ : 34 drawn, 44 through hitSlop. The two ends do not share a pixel: minus grows
   * left, plus grows into the numeral. At quantity 1 the left end is an ✕ that removes the line
   * (never a disabled minus). Plus stops at the catalog maximum. Control size stays put when the
   * glyph switches between − and ✕.
   */
  const step = (dir: -1 | 1, label: string, disabled: boolean) => {
    const removes = dir < 0 && last;
    const slop =
      dir < 0
        ? { top: 5, bottom: 5, left: 5, right: 5 }
        : { top: 5, bottom: 5, left: 10, right: 0 };
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={removes ? SHOPPING.removeLine(name) : `${label}: ${name}, ${line.qty}`}
        accessibilityState={{ disabled }}
        disabled={disabled}
        hitSlop={slop}
        onPress={() => (removes ? onRemove() : onQty(line.qty + dir))}
        style={({ pressed }) => [
          styles.center,
          {
            width: STEP,
            height: STEP,
            opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
          },
        ]}
        testID={`${testID}.qty.${dir > 0 ? 'up' : removes ? 'remove' : 'down'}`}
      >
        <Icon
          name={dir > 0 ? 'plus' : removes ? 'x' : 'minus'}
          size={dir > 0 ? 15 : removes ? 13 : 15}
          color={removes ? t.color.crit : disabled ? t.color.text3 : t.color.text2}
        />
      </Pressable>
    );
  };

  const tick = (
    <Pressable
      // a one-off has no picture: what goes into the basket leaves from its tick
      ref={oneOff ? iconRef : undefined}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={SHOPPING.tick(name)}
      // 24 drawn, 44 to the touch. The extra reach stays off the name.
      hitSlop={{ top: 10, bottom: 10, left: 12, right: 8 }}
      // read only, the circle still says whether it is in the basket, and takes no touch
      disabled={readOnly}
      onPress={() => onTick(!checked)}
      style={({ pressed }) => [
        styles.center,
        {
          width: TICK,
          height: TICK,
          borderRadius: TICK / 2,
          borderWidth: RING,
          // the ring stays drawn: ticked, the fill covers it; filling or clearing, it is seen round it
          borderColor: t.color.line2,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
      testID={`${testID}.tick`}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.fill,
          { borderRadius: TICK / 2 + FILL_SEAM, backgroundColor: a.accent },
          fillMotion,
        ]}
      />
      <TickMark
        checked={checked}
        size={15}
        color={a.onAccent}
        ring={TICK / 2}
        burst={burst}
        burstColor={a.accent}
        dots={dots}
        dotColor={dotInk}
        undraw
      />
    </Pressable>
  );

  const body = (
    <View style={[styles.grow, { gap: 2 }]}>
      {/* struck through once ticked, and the line DRAWN across the words as it is (`StrikeText`) */}
      <StrikeText
        variant="bodyStrong"
        ink={checked ? 'text2' : 'text'}
        numberOfLines={2}
        struck={checked}
      >
        {name}
      </StrikeText>
      {/* THE BASKET'S CAPTION STAYS AT `text2`, and this is the one place the brief is
          overruled. §5 asks for ink-3 on a ticked row; `text3` is a NON-TEXT ink in this app —
          dividers, a disabled glyph, the inactive tab — because at the grounds this app draws it
          does not clear 4.5:1 as a word (CONTRAST_FINDINGS §4, and `tertiaryInk.test.ts` holds
          every file to it). A line already in the basket is still a line a parent reads when
          they are checking what they picked up. The strike-through and the muted name carry
          "done" without asking the caption to be unreadable. AND AT THE SAME SIZE (2026-09-30,
          docs/DESIGN_SYSTEM.md §4.1): a ticked row's caption was `Meta`, a point under the open
          rows' beside it, so one list set one kind of line two ways. */}
      {caption === '' ? null : (
        <BodySm ink="text2" numberOfLines={1}>
          {caption}
        </BodySm>
      )}
    </View>
  );

  /*
    IN THE BASKET IS A DIFFERENT ROW, not this one greyed out: no stepper, no swipe, and the
    quantity as a plain `×2` — everything it could still do would be a change to a decision the
    parent has already made. Tapping the tick puts it back.

    DIFFERENT CONTENTS, ONE TREE (2026-09-25). It used to be a separate early return, and React
    read the two shapes as two rows: ticking one threw its tick away and mounted a new one already
    ticked, which has nothing to draw. The shape is the same now — the swipe's backing (only while
    it is to buy), then the row, then the TICK FIRST in it — and only what follows the tick changes
    with the state, so the tick that saw the line open is the one that draws it ticked. `SwipeRow`
    keeps that shape for either state (`enabled`), so the tick stays mounted across it.
  */
  return (
    <SwipeRow
      // to buy, it slides and it covers the Remove behind it; in the basket it does neither, and
      // read only it never does: nothing is behind it (`SwipeRow` draws no backing when off)
      enabled={!checked && !readOnly}
      // the swipe let go far enough takes the line off, felt once (S5)
      removes
      // Remove is always behind the row, a button of its own to a screen reader, as it always was
      backing="always"
      label={SHOPPING.remove}
      accessibilityLabel={SHOPPING.removeLine(name)}
      // the row is left where it is: the screen draws it carrying on off the edge from there
      onAction={() => onRemove()}
      style={[
        styles.row,
        {
          paddingHorizontal: t.space.lg,
          paddingVertical: t.space.md,
          gap: t.space.md,
          flexWrap: t.fontScale.body >= 1.3 ? 'wrap' : 'nowrap',
        },
      ]}
      testID={testID}
      actionTestID={`${testID}.remove`}
    >
      {tick}
      {/*
        THE NAME KEEPS ITS PLACE IN THE TREE TOO (2026-09-26). To buy, a supply's name opens it
        and has its square beside it; in the basket, and on a one-off, it opens nothing. It used
        to be the bare words in one state and the words inside a button in the other — two places
        in the tree, so ticking a line rebuilt its words, and the line through them could only
        ever appear, never be drawn across. Now the square comes and goes in a slot of its own
        and the words are always inside the one Pressable, which is only a button while it opens
        something: otherwise it takes no touch and is no element of its own to a screen reader,
        so the words are read as they always were.
      */}
      {item !== null ? (
        // measured by the throw into the basket as the tick lands (S2): the square, not the row
        <View ref={iconRef} collapsable={false}>
          <CategorySquare category={item.category} />
        </View>
      ) : (
        <View style={styles.iconGap} />
      )}
      <Pressable
        accessible={opens}
        {...(opens
          ? {
              accessibilityRole: 'button' as const,
              accessibilityLabel: SHOPPING.openLine(name),
              onPress: onOpen,
              testID: `${testID}.open`,
            }
          : { disabled: true })}
        style={({ pressed }) => [styles.grow, { opacity: opens && pressed ? 0.6 : 1 }]}
      >
        {body}
      </Pressable>

      {/*
        EVERY LINE GETS THE STEPPER, one-offs included (the owner, 2026-10-03: one-offs need a
        quantity, and the shared list has to show it). The prototype's `shopLineHTML` always did.
        Share reads the same `qty` the stepper writes (`lineLabel` in core). At one, the − is an ✕
        that removes the line — a one-off has no supply sheet to be taken off from, so that last
        step is how it leaves, same as a supply. No trailing menu: the name opens the supply.
      */}
      {checked || readOnly ? (
        line.qty > 1 ? (
          <Meta>{SHOPPING.times(line.qty)}</Meta>
        ) : null
      ) : (
        <View
          style={[
            styles.qty,
            {
              minWidth: 96,
              height: STEP,
              borderRadius: t.radius.pill,
              borderWidth: 1,
              borderColor: t.color.line,
              backgroundColor: t.color.accentSoft,
            },
          ]}
        >
          {step(-1, SHOPPING.qtyDown, false)}
          <AppText variant="bodySm" numeric align="center" style={styles.qtyValue}>
            {String(line.qty)}
          </AppText>
          {step(1, SHOPPING.qtyUp, line.qty >= SHOPPING_QTY_MAX)}
        </View>
      )}
    </SwipeRow>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  // over the ring and a little past it, so a ticked circle is one disc of the accent
  fill: {
    position: 'absolute',
    top: -FILL_OVER,
    left: -FILL_OVER,
    right: -FILL_OVER,
    bottom: -FILL_OVER,
  },
  grow: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  iconGap: { width: DISC, flexShrink: 0 },
  qty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  qtyValue: { minWidth: 18 },
});
