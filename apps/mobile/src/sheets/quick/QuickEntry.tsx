/**
 * The shared Quick Entry skeleton (PRODUCT_SPEC.md §5.2).
 *
 * Twelve modules, one sheet. Everything a module varies — its steppers, its option pills, its
 * save wording — arrives as children or props; everything a module must NOT vary is fixed
 * here, in this order, because §5.2 is an anatomy and not a suggestion:
 *
 *   1. the time row        what the time is, then Now · −15m · −30m · Custom · 9:22 PM
 *   2. the steppers        the caller's, with the §5.2 step table from @nibblecue/core
 *   3. the option rows     single-select pills, the remembered value pre-pressed
 *   4. the primary save    full-width, with secondary and destructive BENEATH it
 *   5. the byline          who it is logged as, and where it went
 *   6. save as favorite    on any sheet
 *
 * The order is what makes twelve sheets feel like one: a parent who has learned where Save is
 * on the bottle sheet must not have to look for it on the diaper sheet. `anatomy.test.ts`
 * pins it by scanning this file, because there is no React Native renderer in the workspace
 * to mount it in.
 *
 * TIME IS RESOLVED AGAINST THE SHEET'S OPEN TIME, NOT `Date.now()` AT RENDER. A sheet that sat
 * open for ten minutes while a baby was settled still means "now" when Save is finally tapped,
 * and `TimeRow` is handed that instant rather than reading a clock itself.
 *
 * THE TIME CAN BE HELD BY THE SHEET (`useQuickTime`, the `time` prop). A sheet that swaps this
 * form for a view of its own — the temperature and growth histories, and the medicine sheet's
 * inline Add until it went on 2026-09-26 — unmounts it, and a time held in here went back to Now with it: a parent who backdated a reading
 * to 2:10 AM, glanced at the history and came back saved it at the time they came back (the audit
 * of 2026-09-24). Such a sheet holds the time itself and hands it in; every other sheet leaves the
 * prop off and the form keeps its own.
 *
 * A SHEET OPENED FOR A SLOT THAT IS OVER STARTS AT THE SLOT'S TIME (the owner, 2026-09-25: "yes
 * pre-fill the slot's time when tapping a past slot"). The host hands the instant in
 * (`SlotBinding.atMs`, decided by `slotPrefillAt`), and the row starts on Custom at it — exactly
 * as if the parent had picked it: the chip, the time, the picker opening on it, and Now and the
 * offsets one tap away. It is read in ONE place, where the row's state is made (`useQuickTime`),
 * so every form gets it — the ones that hold their time themselves included — and it is read
 * once, as the form mounts: a starting point, never a value that follows the slot afterwards.
 * Nothing about the rule above changes: the presets still resolve against the opening, and the
 * pre-filled instant is a fixed time, as a picked one is.
 *
 * …EXCEPT ON A ROW THAT IS AN END, WHICH STAYS ANCHORED TO THE SLOT UNTIL IT IS TOUCHED (2026-09-25:
 * "keep the START pinned to the slot while the parent edits lengths"). Sleep, a breastfeed, tummy
 * time and — since 2026-09-26 — a pump session pass their length (`lengthMinutes`), and while the
 * parent has not touched the row the entry STARTS at the slot's time and the end the row shows
 * follows the length — the minute the schedule matches an entry on is the slot's own, whatever
 * length is typed (`finishedEnd`). The first tap on the row — a chip, or Custom — makes the end the
 * parent's, holding the one it showed (`touchRow`), and from there a length changes the start, as
 * it always has.
 *
 * EVERY SHEET NAMES WHAT ITS TIME IS (the owner, 2026-09-26: "instead of just 'time' it should say
 * 'feeding start time'"). `timeLabel` is the eyebrow over the row — "Feeding start time", "Changed
 * at", "End time", "Woke up at" (`TIME_LABEL` and `FINISHED` in copy.ts) — and the row under it is
 * the same one row on every sheet: `Now · −15m · −30m · Custom`, then the time.
 *
 * A FORM FOR SOMETHING ALREADY FINISHED keeps this anatomy. Its row is the END (its eyebrow says
 * so), it passes its length (above), and it may pin its Save:
 *
 *   * `stickySave` — the Save, the error over it and anything beneath it pinned to the sheet's
 *     foot (`SheetFooter`), in the thumb zone and above the keyboard while a note is typed. The
 *     byline stays with the form; parts 4 and 5 keep their order in this file either way.
 *
 * (Until 2026-09-26 it also had chips of its own — "−15m", the pump's "Just finished" — with
 * the time said in a sentence under them, and the pump's row was a START read through a
 * `resolveAt`. Neither fitted one line at 360 dp, and "Start time" beside "Just finished" asked the
 * parent to work backwards; the pump's row is an end like the others now, `pumpForm.ts`.)
 *
 * A FORM CORRECTING AN ENTRY STARTS AT THE ENTRY'S OWN TIME (the owner, 2026-09-26: editing looks
 * the same as logging; `sheets/quick/edit`). The edit hands its instant in the way a slot does —
 * the row's start, as a Custom time, read once where the row's state is made — with no slot anchor:
 * an entry's end is already its own. And a time PICKED on it lands on the day nearest the time it
 * corrects (`pickedNear`, the care audit's C5), not on today: 3:05 PM picked on Tuesday's 3:00 PM
 * feed is Tuesday's, and 12:15 AM on a sleep that began at 11:30 PM is the next morning.
 *
 * THE SAVE TICKS WHEN ITS ENTRY LANDS (the owner, 2026-09-26, "agreed"): its words give way to a
 * check that draws itself, and the sheet closes a quarter of a second later. The Save marks itself
 * in flight while the sheet's `onSave` runs, and the host that hears `onDone()` in that time knows
 * the save came from here (`saveTick.ts`). Nothing about what is written, or when, changes.
 */
import {
  applyCustom,
  BodySm,
  Button,
  resolvePreset,
  Row,
  Rows,
  SheetFooter,
  TimeRow,
  useTheme,
  wallClockOf,
  type Preset,
  type WallClock,
} from '@nibblecue/ui';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../../auth/AuthContext';
import { pickedNear } from '../entry/editor';
import { bylineText } from './byline';
import { MEASURED_ON } from './copy';
import { useEditBinding } from './edit/binding';
import { LoggingForRow } from './LoggingForRow';
import { measuredDayKey, middayOfDay, middayOn } from './measuredOn';
import { useSaveTick } from './saveTick';
import { useSlotBinding } from './slotBinding';
import { finishedEnd, touchRow } from './timerMath';

/** Which preset the time row is on, and the instant a `custom` pick resolved to. */
export interface QuickTimeState {
  preset: Preset;
  customMs: number | undefined;
  /**
   * The slot's time, while a row that is an END — opened on a slot that is over — has not been
   * touched: the entry starts there and the end follows the length (`finishedEnd`; see the
   * header). Null once the row is touched, and on every other row.
   */
  anchorMs: number | null;
  setPreset: (next: Preset) => void;
  setCustomMs: (ms: number | undefined) => void;
  setAnchorMs: (ms: number | null) => void;
}

/**
 * The time row's state, for a sheet that has to keep it while the form is off screen (see the
 * header) — and the form's own. Starts on Now; on a sheet opened for a slot that is over, on
 * Custom at the slot's time — and a row that is an END (`endRow`) anchored to it until touched.
 */
export function useQuickTime(endRow = false): QuickTimeState {
  const slotAtMs = useSlotBinding()?.atMs ?? null;
  // an entry being corrected: its own time, and nothing anchored — its end is its own already
  const editAtMs = useEditBinding()?.form.rowAtMs ?? null;
  const startAtMs = editAtMs ?? slotAtMs;
  // read once, as the form mounts (see the header): where the row STARTS, never a value that follows
  const [preset, setPreset] = useState<Preset>(startAtMs === null ? 'now' : 'custom');
  const [customMs, setCustomMs] = useState<number | undefined>(startAtMs ?? undefined);
  const [anchorMs, setAnchorMs] = useState<number | null>(
    endRow && editAtMs === null ? slotAtMs : null,
  );
  return { preset, customMs, anchorMs, setPreset, setCustomMs, setAnchorMs };
}

export interface QuickEntryProps {
  /** The instant the sheet opened. Every preset resolves against this, never a live clock. */
  openedAtMs: number;
  /** The household's zone, for resolving a custom time onto the right day. */
  timeZone: string;
  clock24: boolean;
  /**
   * Steppers and option rows — whatever this module captures. A function receives the
   * RESOLVED time, for a one-tap module whose tiles save with it (diaper: the tile is the save).
   */
  children: ReactNode | ((atMs: number) => ReactNode);
  /** The primary action's words, e.g. `Save bottle`. Full-width, always last before the byline. */
  saveLabel: string;
  onSave: (atMs: number) => void | Promise<void>;
  saveDisabled?: boolean;
  /**
   * Anything that sits BENEATH the primary: a secondary action, a destructive one. A function
   * receives the RESOLVED time, as `children` can: a second save beneath the primary must save
   * at the time the row says, not the moment the sheet opened (the pump's "Save and add to
   * stash" did — the audit of 2026-09-24, feeding C3).
   */
  belowSave?: ReactNode | ((atMs: number) => ReactNode);
  /**
   * Open the platform time picker and RESOLVE with what the parent chose, or null if they
   * dismissed it. Returning the value rather than taking a callback keeps the roll-back rule
   * in one place: the sheet feeds whatever comes back through `applyCustom`, so a time later
   * than now becomes last night on every sheet identically.
   */
  onPickTime?: (current: WallClock) => Promise<WallClock | null>;
  /** Persist this sheet's values as a one-tap favorite (§5.2 part 6). */
  onSaveFavorite?: (atMs: number) => void;
  /** An inline validation message, e.g. `The bottle cannot hold less than the baby took` (§6.1). */
  error?: string | null;
  /**
   * A form whose own buttons finish it draws them in `belowSave`, and the full-width primary would
   * be one more button that does nothing they do not. A new pump session is the one today: it ends
   * with the stopped timer's own two, Choose where it goes and Save session only (`PumpFinish.tsx`,
   * 2026-10-01), where the diaper's four tiles once saved from themselves. The slot stays where
   * §5.2 puts it: the buttons sit where the Save would, pinned with it on a finished form.
   */
  hidePrimary?: boolean;
  /**
   * The eyebrow over the time row — WHAT THE TIME IS: "Feeding start time" on a bottle, "End time"
   * on a finished feed, "Woke up at" on a finished sleep (`TIME_LABEL`, `FINISHED` in copy.ts).
   * Absent, the row says "Time" — only the Log's plain form for a note leaves it off.
   */
  timeLabel?: string;
  /**
   * `date` replaces the time row with ONE date row — no `Now · −15m` presets, because a
   * measurement is not an event with a minute (the owner, 2026-09-16: "there is no need to record
   * the time for growth, but rather the date; you're not going to measure the baby every hour").
   * The instant still written is midday on the chosen day, so a record made at 11 p.m. and one
   * made at 7 a.m. the same day sort together instead of straddling a boundary.
   */
  timeMode?: 'time' | 'date';
  /** `date` mode: opens the platform date picker and resolves with `yyyy-mm-dd`, or null. */
  onPickDate?: (current: string) => Promise<string | null>;
  /**
   * The Logging-for row (MULTIPLES §2): one chip per child plus Both / All n. Rendered only
   * when there is something to choose; the hook that builds it returns no options otherwise.
   * The three timer sheets leave it off and draw the row at their own top instead, where one row
   * answers for both of their paths (`LoggingForRow` says why).
   */
  loggingFor?: {
    options: { value: string; label: string }[];
    value: string;
    onChange: (v: string) => void;
  };
  /**
   * The time row's state, held by the sheet (`useQuickTime`) when the sheet can put this form
   * away and bring it back. Absent, the form holds its own.
   */
  time?: QuickTimeState;
  /**
   * A FORM WHOSE ROW IS WHEN THE THING ENDED — sleep, a breastfeed, tummy time, a pump session —
   * and its length in minutes as it stands now. Read only on a sheet opened on a slot that is over:
   * until the row is touched, its end is the slot's time plus this, so the entry STARTS at the slot
   * (see the header). Absent, the row is the slot's time itself: a moment.
   */
  lengthMinutes?: number;
  /** Pin the save, with the error over it and anything beneath it, to the sheet's foot. */
  stickySave?: boolean;
  /**
   * THE PUMP'S ORDER (the owner's pumping redesign, 2026-10-05): the amount first, then when it
   * Finished, then the length and what the milk is for. `lead` is drawn ABOVE the time row, and
   * `timeRowLayout="heading"` draws that row as a heading with its time on the right and the
   * four chips spelled out under it (`TimeRow`). Every other sheet leaves both off and keeps
   * §5.2's order exactly.
   */
  lead?: ReactNode | ((atMs: number) => ReactNode);
  timeRowLayout?: 'chips' | 'heading' | 'inline';
  /** `inline` only: the time it comes to, under the heading (the bottle; `TimeRow.clockUnder`). */
  timeRowClockUnder?: boolean;
  /**
   * No byline line under the save — THE DEFAULT SINCE 2026-10-06 (the owner: "remove the whole
   * sentence logged as … saves immediately"). The entry is still attributed (the write carries
   * who); the sheet just does not say it. `hideByline={false}` brings the line back on a sheet.
   */
  hideByline?: boolean;
  testID?: string;
}

export function QuickEntry({
  openedAtMs,
  timeZone,
  clock24,
  children,
  saveLabel,
  onSave: saveEntry,
  saveDisabled = false,
  belowSave,
  onPickTime,
  onSaveFavorite,
  error = null,
  hidePrimary = false,
  timeLabel,
  timeMode = 'time',
  onPickDate,
  loggingFor,
  time,
  lengthMinutes,
  stickySave = false,
  lead,
  timeRowLayout = 'chips',
  timeRowClockUnder = false,
  hideByline = true,
  testID,
}: QuickEntryProps) {
  const t = useTheme();
  const { account, online } = useAuth();
  const editing = useEditBinding() !== null;
  const own = useQuickTime(lengthMinutes !== undefined);
  const { preset, customMs, anchorMs, setPreset, setCustomMs, setAnchorMs } = time ?? own;
  // the Save, marked in flight while the sheet's save runs, so the host can tell a save that landed
  // from here and tick for it (see the header). Drawn anywhere without a host, it simply saves
  const tick = useSaveTick();
  const onSave = useCallback(
    (at: number) => (tick === null ? saveEntry(at) : tick.pressed(() => saveEntry(at))),
    [tick, saveEntry],
  );

  /**
   * `date` mode is a DAY: midday on it in the household's zone (measuredOn.ts) — "today" as well
   * as a picked day, where "today" used to be the moment the sheet opened. A custom instant is
   * read as its day's midday too: a picked day already is one, and a slot's time handed in as the
   * row's start (see the header) becomes the day it fell on, never the minute.
   */
  const rowAtMs = useMemo(
    () =>
      timeMode === 'date'
        ? preset === 'custom' && customMs !== undefined
          ? middayOfDay(customMs, timeZone)
          : middayOfDay(openedAtMs, timeZone)
        : resolvePreset(preset, openedAtMs, customMs),
    [timeMode, preset, openedAtMs, customMs, timeZone],
  );
  // a row that is an END, still anchored to its slot: the slot plus the length (see the header)
  const endAtMs =
    lengthMinutes === undefined
      ? rowAtMs
      : finishedEnd(rowAtMs, anchorMs, lengthMinutes, openedAtMs);
  // the one instant the row shows, the fields get and Save writes
  const atMs = endAtMs;
  /** Part 4's actions, where the form wants them: inline, or pinned to the sheet's foot. */
  const placeSave = (node: ReactNode): ReactNode =>
    stickySave ? <SheetFooter>{node}</SheetFooter> : node;

  const pickCustom = useCallback(async () => {
    if (!onPickTime) return;
    const picked = await onPickTime(wallClockOf(atMs, timeZone));
    // dismissing the picker leaves the previous choice alone rather than snapping back to now.
    // RESOLVED AGAINST NOW, NOT THE OPENING (the audit of 2026-09-24): `applyCustom` reads a
    // wall time later than its anchor as last night, so a sheet opened at 2:00 and a 2:05 picked
    // at 2:07 was saved as 2:05 YESTERDAY, with nothing on the time row to say so.
    if (picked) {
      // a picked time is the parent's end: nothing is anchored to a slot from here (`touchRow`)
      setAnchorMs(null);
      const nowMs = Date.now();
      setCustomMs(
        // a correction's time goes on the day nearest the one it corrects (see the header)
        editing
          ? pickedNear(picked, endAtMs, nowMs, timeZone)
          : applyCustom(picked, Math.max(nowMs, openedAtMs), timeZone),
      );
    }
  }, [atMs, endAtMs, editing, onPickTime, openedAtMs, timeZone, setCustomMs, setAnchorMs]);

  /**
   * `date` mode: the chosen day at MIDDAY, in the household's zone. Midday rather than midnight
   * so a record does not sit on a day boundary that a time-zone change could push across, and
   * because nothing about a measurement depends on the hour. The picker speaks in day keys, so
   * it opens on — and hands back — the household's day, whatever zone the phone is in.
   */
  const pickDay = useCallback(async () => {
    if (!onPickDate) return;
    const picked = await onPickDate(measuredDayKey(atMs, timeZone));
    if (picked === null) return;
    const midday = middayOn(picked, timeZone);
    if (midday === null) return;
    setPreset('custom');
    setCustomMs(midday);
  }, [atMs, onPickDate, timeZone, setPreset, setCustomMs]);

  const onPreset = useCallback(
    (next: Preset) => {
      // THE FIRST TOUCH ON AN ANCHORED ROW LETS GO OF THE SLOT (see the header): the end it showed
      // is the parent's from here, Custom holds it, and a length changed later moves the start
      if (anchorMs !== null) {
        const held = touchRow({ customMs, anchorMs }, endAtMs);
        setCustomMs(held.customMs);
        setAnchorMs(held.anchorMs);
      }
      setPreset(next);
      // Custom opens the clock ONLY through TimeRow's `onCustom` (below). Opening it here too
      // asked for the clock twice on every finished form — pump, sleep, feed, tummy — and only
      // the first pick was kept (`TimeRow` calls `onPreset('custom')` then `onCustom`).
    },
    [anchorMs, customMs, endAtMs, setAnchorMs, setCustomMs, setPreset],
  );

  const displayName = account?.profile?.display_name ?? '';

  return (
    <View style={[styles.sheet, { gap: t.space.lg }]} {...(testID ? { testID } : {})}>
      {/* the pump's amount, above its Finished row (see `lead`); nothing on any other sheet */}
      {typeof lead === 'function' ? lead(atMs) : (lead ?? null)}

      {/* 1 — when. A date for a measurement, the time row for everything that happens. */}
      {timeMode === 'date' ? (
        <Rows>
          <Row
            icon="cal"
            title={timeLabel ?? MEASURED_ON}
            detail={new Date(atMs).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              timeZone,
            })}
            onPress={() => void pickDay()}
            testID="quick.date"
          />
        </Rows>
      ) : (
        <TimeRow
          value={atMs}
          preset={preset}
          onPreset={onPreset}
          onCustom={() => void pickCustom()}
          clock24={clock24}
          now={openedAtMs}
          timeZone={timeZone}
          {...(timeLabel !== undefined ? { label: timeLabel } : {})}
          layout={timeRowLayout}
          clockUnder={timeRowClockUnder}
          testID="quick.time"
        />
      )}

      {/* who it is for: the chips, and on Both who that is, in words (`LoggingForRow`) */}
      {loggingFor ? (
        <LoggingForRow
          options={loggingFor.options}
          value={loggingFor.value}
          onChange={loggingFor.onChange}
        />
      ) : null}

      {/* 2 and 3 — the module's steppers and option rows */}
      <View style={[styles.fields, { gap: t.space.lg }]}>
        {typeof children === 'function' ? children(atMs) : children}
      </View>

      {placeSave(
        <>
          {/* the app's one error line (BodySm crit, docs/DESIGN_SYSTEM.md §4.1), as a module's
              own problems are drawn above it (FoodLines) */}
          {error ? (
            <BodySm ink="crit" accessibilityRole="alert" testID="quick.error">
              {error}
            </BodySm>
          ) : null}

          {/* 4 — primary save, full width, with anything secondary BENEATH it */}
          {hidePrimary ? null : (
            <Button
              label={saveLabel}
              onPress={() => void onSave(atMs)}
              disabled={saveDisabled}
              // the check that draws itself once the entry has landed (`saveTick.ts`)
              {...(tick !== null ? { done: tick.ticked } : {})}
              testID="quick.save"
            />
          )}
          {typeof belowSave === 'function' ? belowSave(atMs) : belowSave}
        </>,
      )}

      {/* 5 — the byline */}
      {hideByline ? null : (
        <BodySm ink="text2" testID="quick.byline">
          {bylineText(displayName, online)}
        </BodySm>
      )}

      {/* 6 — save as favorite */}
      {onSaveFavorite ? (
        <Button
          label="Save as favorite"
          variant="ghost"
          onPress={() => onSaveFavorite(atMs)}
          testID="quick.favorite"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { width: '100%' },
  fields: { width: '100%' },
});
