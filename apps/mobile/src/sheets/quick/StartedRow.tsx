/**
 * THE START ROW, AND WHAT IT SAYS BEFORE THE TAP (the owner, 2026-09-29: *"when start activity, user
 * can easily choose what the start time was … make the ui look better than before"*). The rules
 * are `startWhen.ts`'s, the words `TIMER_START`'s, and a sheet holds the choice in `useStartWhen`.
 * Three pieces, the same on every timer, so a parent who has used them once knows them everywhere:
 *
 *   ─ under the two path tiles, before a way in is chosen ──────────────────────────────────────
 *   Started earlier?  (−5m) (−10m) (Custom)            `StartShortcuts`
 *
 *   ─ over the Start, once the live way is open ─────────────────────────────────────────────
 *   STARTED                                              9:31 PM      `StartedRow`
 *   (Now) (−5m) (✓ −10m) (Custom)
 *   ( ▶ 10:03 )  Pumping 10m already. The timer counts from then.     `StartBlock`
 *   [ Start pumping from 9:31 PM ]                                     the sheet's own Start
 *
 * THE ROW IS THE TIME ROW'S ANATOMY: an eyebrow that says what the time is, one line of the small
 * chips every sheet's time row uses, and the time they come to. The clock sits at the eyebrow's end
 * rather than the chips' because four chips and a clock do not fit one line on a 360 dp phone, and
 * four chips do (`startedRow.test.ts` does the sum in the faces the app ships). Selected is the
 * chip's own: the filled pill, the check and the bold face, never color alone.
 *
 * THE PREVIEW IS THE TIMER ITSELF, ALREADY RUNNING: a pill in the module's own soft color with the
 * count-up the card will show, ticking from 10:03 rather than 0:00, beside the sentence that says
 * the same in words. It is drawn only for a start earlier than the tap, where it is news; a screen
 * reader hears the sentence, not a clock ticking every second. The digits are the palette's `text`,
 * which clears every module's soft tint as it clears the accent's; the glyph is the module's ink.
 * Digits are information, so they tick under reduce motion and in Night too; they stop while the
 * sheet is not in front (`useTimerNow`).
 */
import { durationLabel, type TimerType } from '@nibblecue/core';
import {
  BodySm,
  SlotRow,
  formatClock,
  formatElapsed,
  Icon,
  Label,
  Numeric,
  Surface,
  useCategory,
  useTheme,
  useTimerNow,
} from '@nibblecue/ui';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { TIMER_START, type StartWords } from './copy';
import {
  heldStart,
  isHeld,
  isOffset,
  shortcutFloor,
  shortcutHeld,
  START_CHOICES,
  START_SHORTCUTS,
  type EarlierChoice,
  type StartChoice,
} from './startWhen';
import { useMinuteTick } from '../../time/useMinuteTick';
import { useStartWords, type StartWhen } from './useStartWhen';

export interface StartedRowProps {
  choice: StartChoice;
  /** The instant the row comes to, for the clock at the eyebrow's end. */
  atMs: number;
  onChoose: (choice: StartChoice) => void;
  clock24: boolean;
  timeZone: string;
  disabled?: boolean;
  /** Whose colors the chips wear: the timer's own, like the Start tile above them (2026-10-06). */
  module: TimerType;
  testID: string;
}

/** The eyebrow, the time it comes to, and the four chips (see the header). */
export function StartedRow({
  choice,
  atMs,
  onChoose,
  clock24,
  timeZone,
  disabled = false,
  module,
  testID,
}: StartedRowProps) {
  const t = useTheme();
  const clock = formatClock(atMs, clock24, timeZone);
  return (
    <View style={{ gap: t.space.sm }} testID={testID}>
      <View style={[styles.head, { gap: t.space.md }]}>
        <Label>{TIMER_START.label}</Label>
        <Numeric
          variant="bodySm"
          ink="text"
          accessibilityLabel={`${TIMER_START.label}, ${clock}`}
          testID={`${testID}-clock`}
        >
          {clock}
        </Numeric>
      </View>
      {/* Now · −5m · −15m · −30m · Custom sharing the row equally, left edge to right (the owner,
          2026-10-06: "fit the whole row … make it −5 −15 −30") */}
      <SlotRow
        accessibilityLabel={TIMER_START.label}
        options={START_CHOICES.map(c => ({
          value: c,
          label: TIMER_START.choice[c],
          // `−5 min` where every slot holds it with room to spare (`SlotRow`, 2026-10-08)
          longLabel: TIMER_START.choiceLong[c],
          accessibilityLabel: TIMER_START.spoken[c],
          ...(c === 'earlier' ? { accessibilityHint: 'Opens a time picker' } : {}),
        }))}
        value={choice}
        disabled={disabled}
        onChange={onChoose}
        module={module}
        small
        gap={6}
        slotTestID={c => `${testID}-${c}`}
      />
    </View>
  );
}

/**
 * THE WAY IN TO A START ALREADY UNDER WAY, under the two path tiles while neither is chosen. Each
 * chip opens the live way with itself chosen, so "it began ten minutes ago" is two taps on every
 * timer — this chip, then Start — while a Start tile that starts on its tap still does.
 *
 * A CHIP THAT WOULD BE HELD IS FADED, AND A LINE SAYS WHY (the owner, 2026-10-08: "the button to
 * start pump −30m does not work"; `shortcutHeld`). Where the chip starts its timer at once (pump,
 * sleep, tummy time) nothing else on the screen could say that the start would be held at the end
 * of the last entry of the kind, so `held` hands in where each baby's last entry ended, and an
 * offset that would fall inside it takes no tap. Custom is never faded: the wheel's time is the
 * parent's own, and the toast that follows names the start written.
 */
export function StartShortcuts({
  onChoose,
  disabled = false,
  module,
  held,
  testID,
}: {
  onChoose: (choice: EarlierChoice) => void;
  disabled?: boolean;
  /** The timer whose colors the chips wear, as its Start tile does (2026-10-06). */
  module: TimerType;
  /**
   * Where each baby's (or, for a pump, the household's) last entry of the kind ended
   * (`StartWhen.lastEndOf`), with the clock to say it in. Omitted where a chip opens a page that
   * says the hold itself before its Start (a feed's `StartBlock`).
   */
  held?: { lastEnds: readonly (number | null)[]; clock24: boolean; timeZone: string };
  testID: string;
}) {
  const t = useTheme();
  const words = useStartWords(module);
  // the app's minute: a chip fades, and comes back, on the minute the clocks on the screen move
  const now = useMinuteTick({ onWrite: false });
  const floor = held === undefined ? null : shortcutFloor(held.lastEnds);
  const faded = (c: EarlierChoice) => isOffset(c) && shortcutHeld(c, floor, now);
  const anyFaded = START_SHORTCUTS.some(faded);
  return (
    <View style={{ gap: t.space.xs }} testID={testID}>
      <BodySm ink="text2">{TIMER_START.shortcut}</BodySm>
      {/* the question over its four answers, which share the row equally (2026-10-06) */}
      <SlotRow
        accessibilityLabel={TIMER_START.shortcut}
        options={START_SHORTCUTS.map(c => ({
          value: c,
          label: TIMER_START.choice[c],
          // `−5 min` where every slot holds it with room to spare (`SlotRow`, 2026-10-08)
          longLabel: TIMER_START.choiceLong[c],
          // "Started 15 minutes ago": the line's question and the chip's answer, as one phrase
          accessibilityLabel: `${TIMER_START.label} ${TIMER_START.spoken[c].toLowerCase()}`,
          ...(c === 'earlier' ? { accessibilityHint: 'Opens a time picker' } : {}),
          // a start inside the last entry of the kind cannot be taken (see the header)
          ...(faded(c) ? { disabled: true } : {}),
        }))}
        value={null}
        disabled={disabled}
        onChange={onChoose}
        module={module}
        small
        gap={6}
        slotTestID={c => `${testID}-${c}`}
      />
      {held !== undefined && floor !== null && anyFaded ? (
        <BodySm ink="text" testID={`${testID}.held`}>
          {TIMER_START.heldShortcut(
            words.what,
            formatClock(floor, held.clock24, held.timeZone),
            held.lastEnds.length > 1,
          )}
        </BodySm>
      ) : null}
    </View>
  );
}

/**
 * THE ROW, WHAT IT MEANS, AND THE SHEET'S OWN START BENEATH IT — one block for the four sheets, so
 * the arithmetic of what a start will be is made in one place. `children` is handed the clock the
 * Start should name (null for "Now") and draws the button, or a feed's side slider.
 */
export function StartBlock({
  type,
  words,
  start,
  childIds,
  nameOf,
  clock24,
  timeZone,
  disabled = false,
  testID,
  children,
}: {
  type: TimerType;
  words: StartWords;
  start: StartWhen;
  /** Who the start is for: one baby, each on Both, or the household (a pump: `[null]`). */
  childIds: readonly (string | null)[];
  nameOf: (childId: string | null) => string | null;
  clock24: boolean;
  timeZone: string;
  disabled?: boolean;
  testID: string;
  children: (clock: string | null) => ReactNode;
}) {
  const t = useTheme();
  // the minute every clock in the app moves on: "Now" says the minute a start at the tap is
  const now = useMinuteTick({ onWrite: false });
  const clockOf = (ms: number) => formatClock(ms, clock24, timeZone);
  const several = childIds.length > 1;
  const chosen = start.pick?.atMs ?? null;
  // what the clock and the Start say: one baby's start held at its last end, or the start chosen
  const shown =
    chosen === null
      ? now
      : several
        ? chosen
        : heldStart(chosen, start.lastEndOf(childIds[0] ?? null), Date.now());
  const heldLines =
    chosen === null
      ? []
      : childIds.flatMap(id => {
          const end = start.lastEndOf(id);
          return end !== null && isHeld(chosen, end)
            ? [TIMER_START.held(words.what, clockOf(end), several ? (nameOf(id) ?? '') : null)]
            : [];
        });
  return (
    <View style={{ gap: t.space.md }}>
      <StartedRow
        choice={start.choice}
        atMs={shown}
        onChoose={c => void start.choose(c)}
        clock24={clock24}
        timeZone={timeZone}
        disabled={disabled}
        module={type}
        testID={testID}
      />
      {start.refusedLimitMs !== null ? (
        <StartRefusal limitMs={start.refusedLimitMs} testID={`${testID}.refused`} />
      ) : null}
      {chosen !== null ? (
        <StartPreview
          module={type}
          startMs={shown}
          state={words.state}
          // one baby held at its last end: that is the whole of what the line has to say
          held={!several ? (heldLines[0] ?? null) : null}
          testID={`${testID}.already`}
        />
      ) : null}
      {several
        ? heldLines.map(line => (
            <BodySm key={line} ink="text" testID={`${testID}.held`}>
              {line}
            </BodySm>
          ))
        : null}
      {children(chosen === null ? null : clockOf(shown))}
    </View>
  );
}

/** A time further back than the kind allows, refused in words (`TIMER_START.tooEarly`). */
export function StartRefusal({ limitMs, testID }: { limitMs: number; testID: string }) {
  return (
    <BodySm ink="text" accessibilityRole="alert" testID={testID}>
      {TIMER_START.tooEarly(durationLabel(limitMs))}
    </BodySm>
  );
}

/**
 * The timer already running from the chosen start, and the sentence that says so (see the header).
 * It draws a timer's digits, so it keeps the one clock a second a timer's digits keep (§7), and
 * only while it is on the screen: the row over it moves on the app's minute.
 */
function StartPreview({
  module,
  startMs,
  state,
  held,
  testID,
}: {
  module: TimerType;
  startMs: number;
  /** The timer's state in the sentence: "Asleep", "Pumping", "Playtime". */
  state: string;
  /** The sentence for a start held at the last entry's end, in place of "… already". */
  held: string | null;
  testID: string;
}) {
  const t = useTheme();
  const cat = useCategory(module);
  const elapsedMs = Math.max(0, useTimerNow(undefined) - startMs);
  const sentence = held ?? TIMER_START.already(state, durationLabel(elapsedMs));
  return (
    <View style={[styles.preview, { gap: t.space.md }]} testID={testID}>
      {/* the ticking clock is for the eye: a screen reader hears the sentence beside it once */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Surface
          radius="pill"
          tint={cat.soft}
          hue={cat.fg}
          style={{ paddingVertical: t.space.xs, paddingHorizontal: t.space.md }}
        >
          <View style={[styles.pill, { gap: t.space.xs }]}>
            <Icon name="play" size={12} color={cat.fg} />
            <Numeric variant="bodyStrong" ink="text" testID={`${testID}-clock`}>
              {formatElapsed(elapsedMs, 'clock')}
            </Numeric>
          </View>
        </Surface>
      </View>
      <BodySm ink="text" style={styles.grow}>
        {sentence}
      </BodySm>
    </View>
  );
}

const styles = StyleSheet.create({
  /** The eyebrow and the time it comes to: the label at the left, the clock at the right. */
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  /** One line of chips, wrapping (never clipping, never scrolling) where the type is large. */
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  preview: { flexDirection: 'row', alignItems: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1 },
});
