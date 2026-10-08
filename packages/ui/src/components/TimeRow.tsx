/**
 * TimeRow (docs/DESIGN_SYSTEM.md §5; docs/MOBILE.md §4 "TimePicker", §8): the backdating row
 * at the top of every Quick Entry — `Now · −15m · −30m · Custom` as chips, then the
 * resolved clock time in mono at the row's right end, so the choice is visible as a time and not
 * only as a chip. The row resolves presets against the `now` it is handed (never the wall clock)
 * and tells the caller the resulting timestamp; `Custom` only reports the preset and calls
 * `onCustom` — opening the platform time picker is the app's job, and when the picker returns
 * the app runs `applyCustom`, which rolls a time later than now back one day.
 *
 * ONE ROW, ON EVERY SHEET (the owner, 2026-09-26: *"the options should show in 1 row, 'Now',
 * '−15m', '−30m' 'Custom' then the actual hour"*). The eyebrow over the row says what the
 * time IS — "Feeding start time", "Changed at", "End time" — and that is the only thing a sheet
 * varies; the chips and their words are the same four everywhere. The finished forms' variant of
 * 2026-09-25 (their own chip words, and the time said in a sentence on a line of its own under the
 * chips) is gone: its eyebrow now carries the sentence's words, and its chips no longer fitted one
 * line — "Just finished · −15m · −30m · Custom" is about 380 points of pills in a sheet
 * body of 324 on a 360-wide phone, so Custom and the time fell onto lines of their own.
 *
 * FITTING 360 DP. Measured in the faces the app ships (Hanken Grotesk at 13 for the words, IBM
 * Plex Mono at 13 for the clock), the four `compact` chips — one of them selected, with its check
 * and bold face — and "10:45 PM" come to about 318 points with the gaps below: inside the 324 a
 * 360-wide phone leaves between the sheet's two 18-point gutters (`timeRow.test.ts` does the sum).
 * The clock is the row's size rather than the body's for the same reason. At a larger text size
 * the row WRAPS — the clock keeps the right-hand end of whichever line it lands on — and never
 * clips or scrolls (§6: nothing scrolls horizontally except chip rows, charts and tables, and a
 * wrapped row keeps the clock in view). The chips are 28 tall and reach 44 through their hitSlop;
 * none is narrower than 44.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { SlotRow } from './SlotRow';
import { AppText } from './Text';
import { formatClock } from './timeFormat';
import {
  dayWord,
  PRESET_LABELS,
  PRESET_LONG_LABELS,
  PRESET_SPOKEN,
  PRESETS,
  resolvePreset,
  type Preset,
} from './timePresets';

export interface TimeRowProps {
  /** The entry's timestamp (UTC ms). */
  value: number;
  preset: Preset;
  /** The chosen preset and the timestamp it resolves to; for `custom`, the current value. */
  onPreset: (preset: Preset, valueMs: number) => void;
  /** Open the platform time picker (the app's job); called after `onPreset('custom', …)`. */
  onCustom?: () => void;
  clock24: boolean;
  /** The clock to resolve against — the sheet's open time, not Date.now() at render. */
  now: number;
  /** The person's zone (`profiles.time_zone`); device zone when omitted. */
  timeZone?: string;
  /** The eyebrow above the row — what this time IS ("Feeding start time"); pass '' for none. */
  label?: string;
  /**
   * `heading` (the pump's Finished row, 2026-10-05): the label as a section heading on the left,
   * the time and a chevron on the right of the same line — a tap there is Custom — and the four
   * chips, spelled out, on the line below. `chips` (default): every other sheet's row, as it was.
   */
  layout?: 'chips' | 'heading' | 'inline';
  /**
   * `inline` only: the time it comes to, under the heading on the left. The pump says its time
   * beside the Duration ("Started → Ended"); the bottle has no duration, so its row says it here
   * (the owner, 2026-10-06: "change the current rules in bottle logging to match … pump").
   */
  clockUnder?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function TimeRow({
  value,
  preset,
  onPreset,
  onCustom,
  clock24,
  now,
  timeZone,
  label = 'Time',
  layout = 'chips',
  clockUnder = false,
  disabled = false,
  style,
  testID,
}: TimeRowProps) {
  const t = useTheme();
  const clock = formatClock(value, clock24, timeZone);
  const name = label || 'Time';
  const custom = () => {
    onPreset('custom', resolvePreset('custom', now, value));
    onCustom?.();
  };
  /*
    ONE LAYOUT ON EVERY SHEET (the owner's rhythm and solids handoff, 2026-10-06): the time's name
    on the left and its answer on the right — "Meal time · Today · 10:13 AM ⌄", a tap there is
    custom — and under it the four presets sharing one full-width row equally (`SlotRow`). The
    pump's row says no time beside its name: its answer is "Started → Ended" beside the Duration,
    so it passes `layout="inline"` without `clockUnder`. The other layout names are kept so the
    sheets that asked for them still compile; they all draw this.
  */
  const showClock = layout !== 'inline' || clockUnder;
  return (
    <View style={[{ gap: t.space.sm }, style]} {...(testID ? { testID } : {})}>
      {label ? (
        <View style={styles.head}>
          <AppText variant="bodyStrong" style={styles.shrink}>
            {name}
          </AppText>
          {showClock ? (
            /* THE ANSWER, AS WORDS (the owner, 2026-10-06: "the time > when clicked, and the custom
               button underneath serve the same purpose … just pick one … keep the custom"): the
               Custom chip under it is the one door to the clock */
            <AppText
              variant="body"
              ink="text"
              accessibilityLabel={`${name}, ${clock}`}
              style={styles.clock}
              {...(testID ? { testID: `${testID}-clock` } : {})}
            >
              {`${dayWord(value, now, timeZone)} · ${clock}`}
            </AppText>
          ) : null}
        </View>
      ) : null}
      <SlotRow
        accessibilityLabel={name}
        options={PRESETS.map(p => ({
          value: p,
          label: PRESET_LABELS[p],
          // `−15 min` where every slot holds it with room to spare (`SlotRow`, 2026-10-08)
          longLabel: PRESET_LONG_LABELS[p],
          // the short words read aloud as sentences, with the field they set
          accessibilityLabel: `${name}, ${PRESET_SPOKEN[p].toLowerCase()}`,
          ...(p === 'custom' ? { accessibilityHint: 'Opens a time picker' } : {}),
        }))}
        value={preset}
        disabled={disabled}
        onChange={p => (p === 'custom' ? custom() : onPreset(p, resolvePreset(p, now)))}
        {...(testID ? { testID } : {})}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shrink: { flexShrink: 1 },
  clock: { flexDirection: 'row', alignItems: 'center' },
});
