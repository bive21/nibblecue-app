/**
 * NumberRuler — an amount or a length as a RULER the parent drags (docs/DESIGN_SYSTEM.md §5; the
 * owner, 2026-09-26: *"the interface for when user needs to enter oz, or minute, feel very
 * repetitive… think about this and come up with a solution"*, and *"users must be able to enter
 * only numerical value … instead of 5.5oz, user can type 5.25oz when they click the number"*).
 *
 * `NumberStepper`'s `ruler` layout: NumberStepper keeps everything a step is — the hold, the tick,
 * the bounds, `useStepFire` — and hands this file its − and + already built. What this file adds:
 *
 *   THE HEADER ROW: the caption on the left and the number on the right, in the mono face, in the
 *   typed box — one row, the way the bottle's "Left in the bottle" row reads, where the number had a
 *   row of its own until 2026-09-26 (the owner: *"in the bottle oz indicator does not need a whole row
 *   for itself too, it can follow the design in left in bottle — make the number bigger and in a box
 *   perhaps, to differentiate with left oz"*). Bigger than the compact row's number (`RULER.value`),
 *   and no card round the whole: the strip is its own track and the box frames the number, so a
 *   card only added a margin. Too narrow for both (a small phone at a large text size), the box goes
 *   under the caption (`rulerHeaderFits`). A length of an hour and more reads "1h 20m" there, and
 *   the ruler's own labels read hours (`rulerMarksFor`, `rulerLabelFor`).
 *
 *   A TAP TYPES THE NUMBER, in place, in its box: the number
 *   becomes a field on the numeric pad, its text selected so the first digit replaces it; only
 *   digits and one point are ever kept (`sanitizeTyped`), a quarter ounce is two places, milliliters
 *   and minutes are whole; Return, Done, or tapping away commits, clamped to the range and put on
 *   the grid (`typedValue`), and the field shows what was committed; Escape puts the old number back.
 *   WHILE IT IS TYPED THE SHEET ALREADY HAS IT — each change that reads as a number is handed on at
 *   once — so a Save tapped with the pad still up saves the number on the screen, which is the
 *   failure that kept typing in a dialog until now (`StepperEntry` says so). An empty field let go
 *   of is "never mind": the number goes back to what it was.
 *
 *   THE RULER UNDER IT: the value's scale on a strip, a needle in the middle, dragged with a thumb.
 *   It is the platform's own horizontal scroll view — native momentum, native snapping to one step
 *   (`snapToInterval`), and a nested scroll that never fights the sheet's vertical one — so a flick
 *   carries the number most of the way and it settles ON a step; every step crossed is felt as one
 *   light `tick`, never closer than 40 ms (`tickDue`). The sheet hears a drag at most every 50 ms
 *   and always hears where it settled (`rulerEmitDue`), so a sheet with a picture in it — the milk
 *   rising in a bag — follows the thumb without redrawing on every frame.
 *
 *   THE − AND + AT THE TWO ENDS, the fine tune: one flick gets near, one tap corrects. They are the
 *   stepper's own buttons under the stepper's own ids (`-decrement`, `-increment`), so the flows that
 *   tap them are unchanged, and a hold still repeats.
 *
 * ONE ELEMENT TO A SCREEN READER: the number and the ruler are one `adjustable` control — its name,
 * its value spoken as the stepper speaks it ("4.5 oz", "35 minutes"), a swipe up or down is one step,
 * and a double tap types the number. While the number is being typed the group opens up, so the
 * field — named, with the range as its hint — and its Done can be reached on their own.
 *
 * STILL WHEN IT MUST BE. Reduce motion: no momentum (`disableIntervalMomentum`: a release stops on
 * the next step), the ruler jumps rather than glides when the number is set another way, and the
 * snap is still a snap. Night: the night palette's roles and nothing that glows (`theme/ruler.ts`).
 *
 * WIDTH: `rulerMath.test.ts` walks every phone from 308 to 430 pt at every text size up to the
 * chrome cap — the strip keeps a dozen steps in view, the labels never touch, the number's box
 * always fits and keeps the caption beside it on every phone of 360 pt and up, and the Done under a
 * typed number fits beside its hint.
 *
 * AND THE RULER SITS IN ITS ROW'S GAP WHEN IT CAN (the owner, 2026-09-30, over the bottle sheet: *"Would
 * it make sense to you if the slider is inside the red circle I made instead? We don't need a very
 * long slider for this."*, the circle round the empty stretch between "In the bottle" and its number).
 * One row: the caption at its own width, the strip in the gap, the number's box at the right, the
 * strip's ticks, labels and needle as they were and only its window shorter; the − and + go, since a
 * flick and a tap on the number already give a quick answer and an exact one, and a screen reader's
 * swipe is still a step. It is 47 pt where the two rows were 99. Where the strip would be shorter than
 * `RULER.inlineMin` (a narrow phone, a long caption, a large text size) the ruler keeps the two rows,
 * − and + and all (`rulerInline`). The caption is measured as it is drawn, and the row too; before
 * they are, the window's width and a long guess at the caption decide (`rulerCaptionGuess`).
 *
 * A COUNT IS A RULER TOO (the owner, 2026-09-30, of the one to six containers a pump session goes
 * into: a visible caption in the container's word, and *"the slider"* the app already uses for an
 * amount). A short run of whole numbers (`rulerCounts`) is drawn as a number line, every number
 * labeled. Its word is the caption's ("How many bottles"), so the box holds the bare number, never
 * narrower than a target (`rulerBoxWidth`), and a screen reader hears it as the caller says it
 * (`say`: "3 bottles").
 *
 * AND ALL OF IT IN VIEW (the owner, the same day: *"The slider with the empty space on the left
 * don't look very nice. Think about it and then fix it"*). A ruler's needle stays in the middle, so
 * at one bottle half the strip was empty scale. Where a count's numbers keep apart in its strip
 * (`countLineFits`, every count the app draws) they stand from one end of the strip to the other
 * and the NEEDLE moves: a tap puts it on the nearest number, a finger gone sideways drags it with
 * a `tick` at each number, and it glides to the nearest when let go (it jumps under Reduce motion).
 * The chosen number reads in the page's full ink (`paint.chosen`). Nothing scrolls and nothing
 * fades; a scroll of the sheet that starts on the line is still the sheet's, since the line takes a
 * touch only once it has gone sideways (`countLineClaims`, the side slider's rule). A count too long
 * for its strip keeps the ruler, its steps `RULER.countTick` apart.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { haptic } from '../feedback/haptics';
import { withAlpha } from '../theme/contrast';
import { rulerPaintFor, type RulerPaint } from '../theme/ruler';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';
import {
  countLineClaims,
  countLineFits,
  countLineGap,
  countLineIndexAt,
  countLineIndexOf,
  countLineTapped,
  countLineX,
  RULER,
  rulerBoxWidth,
  rulerCaptionGuess,
  rulerContentWidth,
  rulerCount,
  rulerCounts,
  rulerEmitDue,
  rulerHeight,
  rulerIndexAt,
  rulerInline,
  rulerLabelFor,
  rulerMarksFor,
  rulerMustFollow,
  rulerOffsetOf,
  rulerReadsHours,
  rulerTickFor,
  rulerTickX,
  rulerValueAt,
  tickKind,
} from './rulerMath';
import { readoutRow, StepReadout, typedBoxStyle } from './StepReadout';
import {
  sanitizeTyped,
  spokenReadout,
  stepReadout,
  tickDue,
  typedA11yHint,
  typedHint,
  typedKeyboard,
  typedText,
  typedValue,
  unitCaseStyle,
  wholeDigits,
  type TypedEntry,
  type TypedKind,
} from './stepperMath';
import { AppText, Body, BodySm, CHROME_FONT_CAP, Label } from './Text';

export interface NumberRulerProps {
  value: number;
  onChange: (value: number) => void;
  step: number;
  min: number;
  max: number;
  /** The stepper's display precision (`decimalsOfStep` unless the caller said otherwise). */
  places: number;
  unitLabel: string;
  /** A length in minutes (read as hours from an hour on) or an amount (`readoutKind`). */
  kind: TypedKind;
  accessibilityLabel: string;
  /** The name on the left of the header row, with the number's box on the right. */
  caption?: string;
  /** How a screen reader says the value, when its word changes with it ("1 bottle", "3 bottles"). */
  say?: ((value: number) => string) | undefined;
  /** How the number is typed; absent, a tap on the number does nothing. */
  typed: TypedEntry | undefined;
  /** The stepper's own − and +, built by `NumberStepper` with its hold and its tick. */
  minus: ReactNode;
  plus: ReactNode;
  /** One step of the stepper's own: what a screen reader's swipe does. */
  fire: (delta: number) => boolean;
  disabled: boolean;
  /**
   * THE STRIP ON THE LEFT, − number + ON THE RIGHT, one row (the pump's amount, 2026-10-06): no
   * caption and no header row; the ruler and the stepper side by side, one value.
   */
  beside?: boolean;
  /** The strip on the page's own white, the scale quieter (`rulerPaintFor(…, true)`). */
  soft?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Where a drag is: `idle` (nothing, or the ruler being moved to a number set another way — which
 * reports nothing), the thumb down (`drag`), just let go and not yet coasting (`release`), or
 * coasting to its snap (`coast`).
 */
type Phase = 'idle' | 'drag' | 'release' | 'coast';

/** How long a ruler let go of must lie still before it is taken to have settled. */
const SETTLE_MS = 140;

export function NumberRuler({
  value,
  onChange,
  step,
  min,
  max,
  places,
  unitLabel,
  kind,
  accessibilityLabel,
  caption,
  say,
  typed,
  minus,
  plus,
  fire,
  disabled,
  beside = false,
  soft = false,
  style,
  testID,
}: NumberRulerProps) {
  const t = useTheme();
  // one object per palette, so the memoized ticks are not redrawn by a drag's every step
  const paint = useMemo(() => rulerPaintFor(t.color, soft), [t.color, soft]);
  const scale = t.fontScale.chrome;
  const count = rulerCount(min, max, step);
  // a count's scale: its numbers a thumb apart, every one labeled (see the header)
  const counts = rulerCounts(min, max, step);
  const tick = rulerTickFor(min, max, step);
  const hours = rulerReadsHours(kind, max);
  const height = rulerHeight(scale);
  // THE BOX KEEPS ITS WIDEST WIDTH (`rulerBoxWidth`), so a drag from 9 to 10 oz, or from 59 minutes
  // to 1h, never moves its edge; while the number is typed it is the same box, lit as a field is
  const boxWidth = rulerBoxWidth(min, max, places, unitLabel, kind, scale);

  /* ---------------------------------------------------------------- one row, or two (see the header) */
  const win = useWindowDimensions();
  // the whole control's width, and the caption's own on one line, as drawn; 0 and null until then
  const [row, setRow] = useState(0);
  const [captionWidth, setCaptionWidth] = useState<number | null>(null);
  const inline = rulerInline(
    row > 0 ? row : win.width - 2 * t.space.xxl,
    caption ? (captionWidth ?? rulerCaptionGuess(caption, t.fontScale.body)) : 0,
    boxWidth,
  );
  /* the strip is a new view in the other layout: it is placed afresh there (`onContentSize`) */
  const layout = beside ? 'beside' : inline ? 'inline' : 'rows';

  // the latest of what a timer or a native event reads, so none of them acts on a stale render
  const valueRef = useRef(value);
  valueRef.current = value;
  const minRef = useRef(min);
  minRef.current = min;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  /* ------------------------------------------------------------------------------ the drag */
  const scrollRef = useRef<ScrollView>(null);
  const [strip, setStrip] = useState(0);
  // A COUNT ALL IN VIEW (`countLineFits`): its numbers end to end, and the needle moves, not them
  const line = counts && countLineFits(strip, min, max, scale);
  // the number under the needle while a thumb moves the ruler; null when the prop is the number
  const [live, setLive] = useState<number | null>(null);
  const liveRef = useRef<number | null>(null);
  const phase = useRef<Phase>('idle');
  // the offset the scroll view last reported, or was last sent to
  const shownOffset = useRef(0);
  const lastIndex = useRef<number | null>(null);
  const felt = useRef<number | null>(null);
  const emitted = useRef<{ at: number | null; value: number }>({ at: null, value });
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // the layout the strip has been placed on its number in: none yet
  const ready = useRef<string | null>(null);

  const clearPending = (): void => {
    if (pending.current !== null) clearTimeout(pending.current);
    pending.current = null;
  };
  const clearSettle = (): void => {
    if (settleTimer.current !== null) clearTimeout(settleTimer.current);
    settleTimer.current = null;
  };
  useEffect(
    () => () => {
      clearPending();
      clearSettle();
    },
    [],
  );

  /** Tell the sheet: at most every `RULER.emitMs` while moving, and always where it settled. */
  const report = (v: number, final: boolean): void => {
    const now = Date.now();
    if (final || rulerEmitDue(emitted.current.at, now)) {
      clearPending();
      if (v !== emitted.current.value) onChangeRef.current(v);
      emitted.current = { at: now, value: v };
      return;
    }
    if (pending.current !== null) return;
    const wait = RULER.emitMs - (now - (emitted.current.at ?? now));
    pending.current = setTimeout(
      () => {
        pending.current = null;
        const latest = liveRef.current;
        if (latest === null || latest === emitted.current.value) return;
        emitted.current = { at: Date.now(), value: latest };
        onChangeRef.current(latest);
      },
      Math.max(0, wait),
    );
  };

  /** One step crossed under the needle: seen at once, felt as a tick unless one was just felt. */
  const cross = (index: number): void => {
    lastIndex.current = index;
    const v = rulerValueAt(index, min, max, step, places);
    liveRef.current = v;
    setLive(v);
    const at = Date.now();
    if (tickDue(felt.current, at)) {
      felt.current = at;
      haptic('tick');
    }
    report(v, false);
  };

  const settle = (): void => {
    clearSettle();
    if (phase.current === 'idle') return;
    phase.current = 'idle';
    const index = rulerIndexAt(shownOffset.current, count, tick);
    if (index !== lastIndex.current) cross(index);
    const v = rulerValueAt(index, min, max, step, places);
    liveRef.current = null;
    report(v, true);
    setLive(null);
  };
  const settleSoon = (): void => {
    clearSettle();
    settleTimer.current = setTimeout(settle, SETTLE_MS);
  };

  const onBegin = (): void => {
    endTyping();
    clearSettle();
    if (phase.current === 'idle') {
      emitted.current = { at: null, value: valueRef.current };
      lastIndex.current = rulerIndexAt(shownOffset.current, count, tick);
    }
    phase.current = 'drag';
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    shownOffset.current = e.nativeEvent.contentOffset.x;
    if (phase.current === 'idle') return;
    const index = rulerIndexAt(shownOffset.current, count, tick);
    if (index !== lastIndex.current) cross(index);
    if (phase.current !== 'drag') settleSoon();
  };
  const onEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    shownOffset.current = e.nativeEvent.contentOffset.x;
    if (phase.current !== 'drag') return;
    phase.current = 'release';
    settleSoon();
  };
  const onCoast = (): void => {
    if (phase.current === 'idle') return;
    phase.current = 'coast';
    settleSoon();
  };
  const onCoastEnd = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    shownOffset.current = e.nativeEvent.contentOffset.x;
    settle();
  };

  const onStripLayout = (e: LayoutChangeEvent): void => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w !== strip) setStrip(w);
  };
  /** The ruler moved to show a number set another way: a −, a +, a typed number, a swipe. */
  const follow = useCallback(
    (animated: boolean) => {
      const x = rulerOffsetOf(valueRef.current, min, step, count, tick);
      if (!rulerMustFollow(x, shownOffset.current, false)) return;
      shownOffset.current = x;
      scrollRef.current?.scrollTo({ x, y: 0, animated });
    },
    [min, step, count, tick],
  );
  /*
    THE RULER OPENS ON ITS NUMBER, placed once the ticks are laid out, without a glide — and unseen
    until then, so it never shows a frame at zero first. Not through the scroll view's
    `contentOffset` prop: under the new architecture a prop that changes is applied again on every
    render, and this one would change with the number, yanking the strip out from under a thumb.
  */
  const [placed, setPlaced] = useState<string | null>(null);
  const onContentSize = (): void => {
    if (ready.current === layout) return;
    ready.current = layout;
    shownOffset.current = -1;
    follow(false);
    setPlaced(layout);
  };
  // and if the content's size is never reported — a platform that sizes it before it listens —
  // it is placed a moment after the strip is measured, all the same
  const placeRef = useRef(onContentSize);
  placeRef.current = onContentSize;
  useEffect(() => {
    if (strip <= 0) return undefined;
    const late = setTimeout(() => placeRef.current(), 120);
    return () => clearTimeout(late);
  }, [strip]);
  useEffect(() => {
    if (strip <= 0 || ready.current !== layout || phase.current !== 'idle' || live !== null) return;
    follow(!t.reduceMotion);
  }, [value, live, strip, follow, t.reduceMotion, layout]);

  /* ------------------------------------------------------------------ a count's line */
  /*
    THE NEEDLE MOVES ALONG A COUNT (`countLineFits`; see rulerMath's "A COUNT IS A LINE"). A tap puts
    it on the nearest number; a finger gone sideways drags it, the number under it live and each one
    crossed felt as a `tick`, as the ruler's are; let go, it glides to the nearest. Nothing on the
    strip takes a touch of its own (every mark is `pointerEvents="none"`), so the strip is the one
    target and a touch's `locationX` is the strip's own.
  */
  const needleX = useRef(new Animated.Value(0)).current;
  const lineRef = useRef({ strip, count, disabled });
  lineRef.current = { strip, count, disabled };
  // the touch on the line now: where the strip starts on the page, where the touch landed, and
  // whether it has become a drag; null when no finger is on it
  const lineTouch = useRef<{
    origin: number;
    pageX: number;
    pageY: number;
    dragged: boolean;
  } | null>(null);
  // THE NEEDLE STANDS ON ITS NUMBER FROM THE FIRST FRAME the line is drawn in, and again when the
  // strip's width changes: set before the needle is mounted, never glided in from the edge
  const lineAt = useRef<number | null>(null);
  if (line && lineAt.current !== strip && phase.current === 'idle') {
    lineAt.current = strip;
    needleX.setValue(countLineX(strip, count, countLineIndexOf(value, min, count)));
  }
  const glide = useCallback(
    (index: number) => {
      const { strip: s, count: c } = lineRef.current;
      const x = countLineX(s, c, index);
      needleX.stopAnimation();
      if (t.reduceMotion) needleX.setValue(x);
      else
        Animated.timing(needleX, {
          toValue: x,
          duration: RULER.countGlideMs,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
    },
    [needleX, t.reduceMotion],
  );
  // a number set another way (typed, a screen reader's swipe, a − or +) is where the needle goes
  useEffect(() => {
    if (!line || phase.current !== 'idle' || live !== null) return;
    glide(countLineIndexOf(value, min, count));
  }, [line, value, live, min, count, glide]);

  /** A drag on the line let go of, or taken away: the nearest number is the one, and it is told. */
  const lineSettle = (): void => {
    if (phase.current === 'idle') return;
    phase.current = 'idle';
    const index = lastIndex.current ?? countLineIndexOf(valueRef.current, min, count);
    const v = rulerValueAt(index, min, max, step, places);
    liveRef.current = null;
    report(v, true);
    setLive(null);
    glide(index);
  };
  // what the pan's handlers, made once, call: this render's, with its range and its sheet
  const crossRef = useRef(cross);
  crossRef.current = cross;
  const lineSettleRef = useRef(lineSettle);
  lineSettleRef.current = lineSettle;
  const linePan = useMemo(
    () =>
      PanResponder.create({
        // NEVER ON CONTACT: a tap is the line's own (`onLineTouchEnd`), a scroll is the sheet's
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, gs) =>
          !lineRef.current.disabled && lineTouch.current !== null && countLineClaims(gs.dx, gs.dy),
        onPanResponderGrant: () => {
          if (lineTouch.current !== null) lineTouch.current.dragged = true;
          needleX.stopAnimation();
          emitted.current = { at: null, value: valueRef.current };
          lastIndex.current = countLineIndexOf(
            valueRef.current,
            minRef.current,
            lineRef.current.count,
          );
          phase.current = 'drag';
        },
        onPanResponderMove: (_e, gs) => {
          const touch = lineTouch.current;
          if (touch === null) return;
          const { strip: s, count: c } = lineRef.current;
          const x = Math.min(
            countLineX(s, c, c - 1),
            Math.max(countLineX(s, c, 0), gs.moveX - touch.origin),
          );
          needleX.setValue(x);
          const index = countLineIndexAt(x, s, c);
          if (index !== lastIndex.current) crossRef.current(index);
        },
        // a drag that has turned up or down is the sheet's scroll
        onPanResponderTerminationRequest: (_e, gs) => Math.abs(gs.dy) > Math.abs(gs.dx),
        onPanResponderRelease: () => lineSettleRef.current(),
        onPanResponderTerminate: () => lineSettleRef.current(),
      }),
    [needleX],
  );
  const onLineTouchStart = (e: GestureResponderEvent): void => {
    endTyping();
    const { pageX, pageY, locationX } = e.nativeEvent;
    lineTouch.current = { origin: pageX - locationX, pageX, pageY, dragged: false };
  };
  /** A touch that ended where it began is a tap: the nearest number is the one, at once. */
  const onLineTouchEnd = (e: GestureResponderEvent): void => {
    const touch = lineTouch.current;
    lineTouch.current = null;
    if (touch === null || touch.dragged || disabled) return;
    const { pageX, pageY } = e.nativeEvent;
    if (!countLineTapped(pageX - touch.pageX, pageY - touch.pageY)) return;
    const index = countLineIndexAt(pageX - touch.origin, strip, count);
    if (rulerValueAt(index, min, max, step, places) === valueRef.current) {
      glide(index);
      return;
    }
    // a drag of one step that lets go at once: crossed (seen, and felt as the ruler's one `tick`),
    // then settled (told, and the needle glides there)
    emitted.current = { at: null, value: valueRef.current };
    lastIndex.current = null;
    phase.current = 'drag';
    cross(index);
    lineSettle();
  };
  // the sheet's scroll, or the system, took the touch: nothing was chosen by it
  const onLineTouchCancel = (): void => {
    lineTouch.current = null;
  };

  /* ------------------------------------------------------------------ typing the number */
  const [draft, setDraftState] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const setDraft = (d: string | null): void => {
    draftRef.current = d;
    setDraftState(d);
  };
  const original = useRef(value);
  const inputRef = useRef<TextInput>(null);
  const typing = draft !== null;
  const canType = typed !== undefined && !disabled;
  const typedNext = (text: string): number | null =>
    typed === undefined
      ? null
      : typedValue(text, typed.kind, min, max, places, typed.kind === 'amount' ? step : undefined);

  const startTyping = (): void => {
    if (!canType || draftRef.current !== null) return;
    if (line) lineSettle();
    else settle();
    original.current = valueRef.current;
    setDraft(typedText(valueRef.current, places));
  };
  const onType = (text: string): void => {
    if (typed === undefined) return;
    const kept = sanitizeTyped(text, typed.kind, places, wholeDigits(max));
    setDraft(kept);
    const next = typedNext(kept);
    if (next !== null && next !== valueRef.current) onChangeRef.current(next);
  };
  /** Let go of the field: keep what was typed, or — empty, or Escape — the number from before. */
  const finish = (keep: boolean): void => {
    const d = draftRef.current;
    if (d === null) return;
    setDraft(null);
    const next = keep ? typedNext(d) : null;
    if (next === null && valueRef.current !== original.current)
      onChangeRef.current(original.current);
  };
  const commit = (): void => {
    finish(true);
    inputRef.current?.blur();
  };
  const cancel = (): void => {
    finish(false);
    inputRef.current?.blur();
  };
  function endTyping(): void {
    if (draftRef.current !== null) commit();
  }
  /*
    THE PAD PUT AWAY IS THE FIELD LET GO OF. Android's Back closes the keypad without taking the
    field's focus away, which would leave a number half-typed under a Done nobody sees a reason to
    tap — so a keypad that goes away, however it goes, commits what is on the screen. (Escape, on a
    hardware keyboard, is the one way to put the old number back.)
  */
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    if (!typing) return undefined;
    const sub = Keyboard.addListener('keyboardDidHide', () => finishRef.current(true));
    return () => sub.remove();
  }, [typing]);

  /* ------------------------------------------------------------------ what is shown and said */
  const shown = live ?? value;
  const readout = stepReadout(shown, places, unitLabel, kind);
  const spoken = say ? say(shown) : spokenReadout(readout, kind);
  const typeHint = canType && typed ? typedA11yHint(typed.kind) : null;
  const onAction = (e: AccessibilityActionEvent): void => {
    if (e.nativeEvent.actionName === 'increment') fire(step);
    else if (e.nativeEvent.actionName === 'decrement') fire(-step);
    else if (e.nativeEvent.actionName === 'activate') startTyping();
  };
  // ONE ELEMENT, until the number is being typed: then the field and its Done stand on their own
  const adjustable: ViewProps = typing
    ? {}
    : {
        accessible: true,
        accessibilityRole: 'adjustable',
        accessibilityLabel,
        accessibilityValue: { text: spoken },
        accessibilityState: { disabled },
        accessibilityActions: [
          { name: 'increment' },
          { name: 'decrement' },
          ...(typeHint ? [{ name: 'activate', label: typeHint }] : []),
        ],
        ...(typeHint ? { accessibilityHint: typeHint } : {}),
        onAccessibilityAction: onAction,
      };
  const hint =
    typed === undefined ? '' : (typed.hint ?? typedHint(typed.kind, min, max, places, unitLabel));
  const valueStyle = { fontSize: RULER.value, letterSpacing: -0.02 * RULER.value };
  const boxed = canType || typing;
  /* THE BOX IS THE STRIP'S HEIGHT, ON THE STRIP'S CORNER (2026-09-30): the number's well and the
     ruler it moves are one family, as a stepper's box and its circles are (`TypedBoxShape`) */
  const boxShape = { height, radius: t.radius.m };

  const number = typing ? (
    <View style={[typedBoxStyle(t, boxShape, true), { minWidth: boxWidth }]}>
      <View style={readoutRow(t.space.xs)}>
        <TextInput
          ref={inputRef}
          value={draft}
          onChangeText={onType}
          autoFocus
          selectTextOnFocus
          keyboardType={typedKeyboard(typed?.kind ?? 'amount', places)}
          returnKeyType="done"
          onSubmitEditing={commit}
          onBlur={() => finish(true)}
          onKeyPress={e => {
            if (e.nativeEvent.key === 'Escape') cancel();
          }}
          maxLength={wholeDigits(max) + (places > 0 ? places + 1 : 0)}
          maxFontSizeMultiplier={CHROME_FONT_CAP}
          accessibilityLabel={
            unitLabel
              ? `${typed?.title ?? accessibilityLabel}, ${unitLabel}`
              : (typed?.title ?? accessibilityLabel)
          }
          accessibilityHint={hint}
          selectionColor={t.color.accent}
          cursorColor={t.color.accent}
          style={[
            styles.field,
            valueStyle,
            {
              color: t.color.text,
              minWidth: t.hit.min,
              ...(t.fontsReady ? { fontFamily: t.type.display.fontFamily } : {}),
            },
          ]}
          {...(testID ? { testID: `${testID}-field` } : {})}
        />
        {/* typed in minutes, and said so beside the digits, however the number reads once let go; a
            count has no unit, its word being the caption's */}
        {unitLabel ? <Label style={unitCaseStyle(unitLabel)}>{unitLabel}</Label> : null}
      </View>
    </View>
  ) : (
    /* the number, a button of its own to the eye — its box says it can be typed — and part of the
       one adjustable element to a screen reader, whose double tap does the same (a11y-grouped:
       the role is the adjustable View's, so this Pressable says none of its own) */
    <Pressable
      onPress={startTyping}
      disabled={!canType}
      hitSlop={{ top: t.space.sm, bottom: t.space.sm }}
      style={({ pressed }) => [
        boxed ? typedBoxStyle(t, boxShape) : styles.plain,
        { minWidth: boxed ? boxWidth : undefined, opacity: pressed ? 0.6 : 1 },
      ]}
      {...(testID ? { testID: `${testID}-type` } : {})}
    >
      <View style={readoutRow(t.space.xs)}>
        <StepReadout
          readout={readout}
          size={RULER.value}
          unit={u => <Label style={unitCaseStyle(u)}>{u}</Label>}
          {...(testID ? { testID: `${testID}-value` } : {})}
        />
      </View>
    </Pressable>
  );

  const captionEl = caption ? (
    <Body
      style={inline ? styles.inlineCaption : styles.caption}
      {...(testID ? { testID: `${testID}.caption` } : {})}
    >
      {caption}
    </Body>
  ) : null;
  /* THE STRIP, in the row's gap or on a row of its own between the − and + (see the header). A new
     view when the layout changes, keyed so, and placed on its number afresh (`onContentSize`). */
  const needleStyle = {
    top: RULER.padTop - RULER.needleOver / 2,
    width: RULER.needle,
    height: RULER.major + RULER.needleOver,
    borderRadius: RULER.needle / 2,
    backgroundColor: paint.needle,
  };
  const stripEl = line ? (
    /* A COUNT'S LINE: every number in view, the needle on the chosen one (see "a count's line") */
    <View
      key={layout}
      onLayout={onStripLayout}
      onTouchStart={onLineTouchStart}
      onTouchEnd={onLineTouchEnd}
      onTouchCancel={onLineTouchCancel}
      {...linePan.panHandlers}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.strip, { height, borderRadius: t.radius.m, backgroundColor: paint.track }]}
      {...(testID ? { testID: `${testID}-ruler` } : {})}
    >
      <CountLine
        count={count}
        min={min}
        strip={strip}
        height={height}
        paint={paint}
        chosen={countLineIndexOf(shown, min, count)}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.needle,
          needleStyle,
          { left: -RULER.needle / 2, transform: [{ translateX: needleX }] },
        ]}
        {...(testID ? { testID: `${testID}-needle` } : {})}
      />
    </View>
  ) : (
    <View
      key={layout}
      onLayout={onStripLayout}
      onTouchStart={endTyping}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[styles.strip, { height, borderRadius: t.radius.m, backgroundColor: paint.track }]}
      {...(testID ? { testID: `${testID}-ruler` } : {})}
    >
      {strip > 0 ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEnabled={!disabled}
          snapToInterval={tick}
          snapToAlignment="start"
          decelerationRate={t.reduceMotion ? 'fast' : 'normal'}
          disableIntervalMomentum={t.reduceMotion}
          bounces={false}
          overScrollMode="never"
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          style={{ opacity: placed === layout ? 1 : 0 }}
          onContentSizeChange={onContentSize}
          onScrollBeginDrag={onBegin}
          onScroll={onScroll}
          onScrollEndDrag={onEndDrag}
          onMomentumScrollBegin={onCoast}
          onMomentumScrollEnd={onCoastEnd}
        >
          <RulerTicks
            count={count}
            min={min}
            max={max}
            step={step}
            hours={hours}
            counts={counts}
            tick={tick}
            strip={strip}
            height={height}
            paint={paint}
          />
        </ScrollView>
      ) : null}
      {/* where the scale runs out of sight, it fades into the track rather than stopping */}
      <LinearGradient
        pointerEvents="none"
        colors={[paint.track, withAlpha(paint.track, 0)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.fade, styles.fadeLeft, { width: RULER.fade }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[withAlpha(paint.track, 0), paint.track]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.fade, styles.fadeRight, { width: RULER.fade }]}
      />
      {/* the needle: longer and thicker than any tick, in the scheme's hue, lit by nothing */}
      <View
        pointerEvents="none"
        style={[styles.needle, needleStyle, { left: strip / 2 - RULER.needle / 2 }]}
      />
    </View>
  );

  return (
    <View
      onLayout={e => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w !== row) setRow(w);
      }}
      style={[{ gap: t.space.sm, opacity: disabled ? 0.5 : 1 }, style]}
      {...(testID ? { testID } : {})}
    >
      {caption ? (
        /* THE CAPTION'S OWN WIDTH, on one line, measured as it is drawn: out of the layout, unseen,
           and unheard (the caption itself is heard in the row) */
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.measure}
        >
          <Body
            numberOfLines={1}
            onLayout={e => {
              const w = Math.ceil(e.nativeEvent.layout.width);
              if (w !== captionWidth) setCaptionWidth(w);
            }}
          >
            {caption}
          </Body>
        </View>
      ) : null}
      <View {...adjustable} style={{ gap: t.space.sm }}>
        {beside ? (
          /* THE STRIP, THEN − number +: the ruler takes what the stepper leaves — under its caption
             where it has one (the bottle's "In the bottle", 2026-10-06; the pump's heading is its
             own) */
          <>
            {captionEl}
            <View
              style={[styles.row, { gap: t.space.sm, minHeight: t.hit.min }]}
              {...(testID ? { testID: `${testID}.beside` } : {})}
            >
              {stripEl}
              <View style={[styles.row, { gap: t.space.xs }]}>
                <View onTouchStart={endTyping}>{minus}</View>
                {number}
                <View onTouchStart={endTyping}>{plus}</View>
              </View>
            </View>
          </>
        ) : inline ? (
          /* ONE ROW: the caption at its own width, the strip in the gap, the number's box at the
             right, each on the row's middle; a target tall, so nothing reaches past it */
          <View
            style={[styles.row, { gap: t.space.md, minHeight: t.hit.min }]}
            {...(testID ? { testID: `${testID}.inline` } : {})}
          >
            {captionEl}
            {stripEl}
            {number}
          </View>
        ) : (
          /* THE HEADER ROW: the caption on the left, the number's box on the right — and, where the
             two do not fit side by side, the box under the caption at the right edge, never off it
             (`rulerHeaderFits`). A target tall, so nothing reaches past it into the row above. */
          <View
            style={[
              styles.header,
              caption ? null : styles.centered,
              { gap: t.space.md, minHeight: t.hit.min },
            ]}
          >
            {captionEl}
            <View style={caption ? styles.boxEnd : null}>{number}</View>
          </View>
        )}
        {typing ? (
          /* while it is typed: what may be typed, and the Done — on a line of their own under the
             number's row, so the box itself never moves when the pad comes up */
          <View style={[styles.row, { gap: t.space.md }]}>
            {/* an explanation is the hint, wherever it sits (docs/DESIGN_SYSTEM.md §4.1) */}
            <BodySm style={styles.grow} {...(testID ? { testID: `${testID}-hint` } : {})}>
              {hint}
            </BodySm>
            <Button
              label="Done"
              size="sm"
              variant="secondary"
              onPress={commit}
              {...(testID ? { testID: `${testID}-done` } : {})}
            />
          </View>
        ) : null}
        {inline || beside ? null : (
          <View style={[styles.row, { gap: t.space.xs }]}>
            {/* a − or + while the number is typed lets go of the field first, so the step is from
                the typed number */}
            <View onTouchStart={endTyping}>{minus}</View>
            {stripEl}
            <View onTouchStart={endTyping}>{plus}</View>
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * THE TICKS, drawn once per shape. Memoized on what changes them — never on the value — so a drag
 * that moves the needle across forty steps redraws the number above and nothing here.
 */
const RulerTicks = memo(function RulerTicks({
  count,
  min,
  max,
  step,
  hours,
  counts,
  tick,
  strip,
  height,
  paint,
}: {
  count: number;
  min: number;
  max: number;
  step: number;
  /** A length that reaches an hour: labeled in hours (`rulerMarksFor`, `rulerLabelFor`). */
  hours: boolean;
  /** A count: every number labeled (`rulerCounts`). */
  counts: boolean;
  /** Between two ticks (`rulerTickFor`). */
  tick: number;
  strip: number;
  height: number;
  paint: RulerPaint;
}) {
  const marks = rulerMarksFor(step, hours, counts);
  const box = marks.major * tick - RULER.labelAir;
  const parts: ReactNode[] = [];
  for (let i = 0; i < count; i += 1) {
    const kind = tickKind(i, min, step, marks);
    const x = rulerTickX(strip, i, tick);
    const w = kind === 'major' ? RULER.majorWidth : RULER.minorWidth;
    const length = kind === 'major' ? RULER.major : kind === 'mid' ? RULER.mid : RULER.minor;
    parts.push(
      <View
        key={i}
        style={[
          styles.tick,
          {
            left: x - w / 2,
            top: RULER.padTop,
            width: w,
            height: length,
            borderRadius: w / 2,
            backgroundColor: kind === 'major' ? paint.major : paint.minor,
          },
        ]}
      />,
    );
    if (kind === 'major')
      parts.push(
        <AppText
          key={`label-${i}`}
          variant="meta"
          numeric
          color={paint.label}
          numberOfLines={1}
          style={[
            styles.tickLabel,
            {
              left: x - box / 2,
              width: box,
              top: RULER.padTop + RULER.major + RULER.labelGap,
              fontSize: RULER.label,
            },
          ]}
        >
          {rulerLabelFor(rulerValueAt(i, min, max, step, 6), step, hours)}
        </AppText>,
      );
  }
  return <View style={{ width: rulerContentWidth(strip, count, tick), height }}>{parts}</View>;
});

/**
 * A COUNT'S NUMBERS, END TO END (`countLineX`): a long tick and its number for each, the chosen one
 * in the page's full ink (`paint.chosen`) so it reads without the needle, and never by hue alone.
 * Takes no touch: the strip under it is the one target.
 */
const CountLine = memo(function CountLine({
  count,
  min,
  strip,
  height,
  paint,
  chosen,
}: {
  count: number;
  min: number;
  strip: number;
  height: number;
  paint: RulerPaint;
  /** The number the needle stands on, by its place on the line. */
  chosen: number;
}) {
  const box = countLineGap(strip, count) - RULER.labelAir;
  const parts: ReactNode[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = countLineX(strip, count, i);
    parts.push(
      <View
        key={i}
        style={[
          styles.tick,
          {
            left: x - RULER.majorWidth / 2,
            top: RULER.padTop,
            width: RULER.majorWidth,
            height: RULER.major,
            borderRadius: RULER.majorWidth / 2,
            backgroundColor: paint.major,
          },
        ]}
      />,
      <AppText
        key={`label-${i}`}
        variant="meta"
        numeric
        color={i === chosen ? paint.chosen : paint.label}
        numberOfLines={1}
        style={[
          styles.tickLabel,
          {
            left: x - box / 2,
            width: box,
            top: RULER.padTop + RULER.major + RULER.labelGap,
            fontSize: RULER.label,
          },
        ]}
      >
        {rulerLabelFor(min + i, 1, false)}
      </AppText>,
    );
  }
  return (
    <View pointerEvents="none" style={[styles.line, { height }]}>
      {parts}
    </View>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  // the caption and the box: one row that wraps rather than overflows (`rulerHeaderFits`)
  header: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  centered: { justifyContent: 'center' },
  // the caption takes the room the box leaves, and never less than `RULER.captionMin`
  caption: { flexGrow: 1, flexShrink: 1, flexBasis: RULER.captionMin },
  // in the one row, the caption at its own width: the strip gives way, never the words
  inlineCaption: { flexShrink: 0 },
  // the caption measured on one line, out of the layout
  measure: { position: 'absolute', left: 0, top: 0, opacity: 0 },
  // the box at the right edge, on the caption's line or — wrapped — on its own
  boxEnd: { marginLeft: 'auto' },
  grow: { flex: 1 },
  // a number that cannot be typed: no box, centered where the box would be
  plain: { alignItems: 'center', justifyContent: 'center' },
  field: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  strip: { flex: 1, overflow: 'hidden' },
  line: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  fade: { position: 'absolute', top: 0, bottom: 0 },
  fadeLeft: { left: 0 },
  fadeRight: { right: 0 },
  needle: { position: 'absolute' },
  tick: { position: 'absolute' },
  tickLabel: { position: 'absolute', textAlign: 'center' },
});
