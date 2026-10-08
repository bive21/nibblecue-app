/**
 * The platform time picker behind the time row's `Custom` (PRODUCT_SPEC.md §5.2).
 *
 * Android has an imperative dialog (`DateTimePickerAndroid.open`) that resolves once; iOS has
 * only a component, which the sheet has to mount. `useTimePicker` hides the difference: it
 * returns a `pick(current)` that resolves with the wall clock the parent chose or null when
 * they dismissed it, and an `element` the sheet renders (empty on Android).
 *
 * The picker works in WALL CLOCK, not instants: the sheet's `applyCustom` decides which day a
 * chosen 11:50 PM belongs to (D13: a time later than now is last night), so the picker only
 * ever answers "which hour and minute".
 *
 * A PICKER CAN SAY WHAT IT IS FOR (2026-09-30, when the long-run strip lost its sentence and its
 * "It ended" had to open a wheel that explains itself): `pick(current, { title, set })`. On the
 * iPhone the title is the heading over the wheel and `set` is the button that keeps the time. On
 * Android `set` is the dialog's OK — the only words that dialog takes: its default clock has no
 * title (`@react-native-community/datetimepicker` gives one to the Material 3 dialog alone, which
 * needs a Material 3 app theme that neither Expo Go nor this app has), so the one slot left says
 * what the tap does, "Set end time", where it would otherwise say OK.
 *
 * DONE ON IPHONE READS A REF, NOT THE RENDER (`timePickerClock.ts`). Android settles inside
 * `onValueChange` with the event's Date. On iPhone the spinner updates React state as the parent
 * scrolls, and Done can fire before that state has re-rendered, so a closure over `ios` still
 * held the opening time — often the timer's "now" — and "Custom 8:00" left the start at 8:25.
 */
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import {
  BodyStrong,
  Button,
  useTheme,
  withAlpha,
  type WallClock,
  useModalGate,
} from '@nibblecue/ui';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';
import { dateFromWallClock, settleWallClock, wallClockFromDate } from './timePickerClock';

type Resolve = (value: WallClock | null) => void;

/** What a picker says about itself: its question, and the words on the button that keeps the time. */
export interface PickWords {
  title: string;
  set: string;
}

export function useTimePicker(clock24: boolean): {
  pick: (current: WallClock, words?: PickWords) => Promise<WallClock | null>;
  element: ReactNode;
} {
  const t = useTheme();
  const [ios, setIos] = useState<Date | null>(null);
  // the spinner's last report: Done reads this, never the Date the last paint closed over
  const iosRef = useRef<Date | null>(null);
  // the words of the wheel on the screen now; none for a picker that names nothing
  const [said, setSaid] = useState<PickWords | null>(null);
  const resolve = useRef<Resolve | null>(null);

  const settle = useCallback((value: WallClock | null) => {
    resolve.current?.(value);
    resolve.current = null;
    iosRef.current = null;
    setIos(null);
    setSaid(null);
  }, []);

  const pick = useCallback(
    (current: WallClock, words?: PickWords) =>
      new Promise<WallClock | null>(res => {
        resolve.current = res;
        if (Platform.OS === 'android') {
          DateTimePickerAndroid.open({
            value: dateFromWallClock(current),
            mode: 'time',
            is24Hour: clock24,
            // the default dialog's one slot for words: its OK says what it sets (see the header)
            ...(words ? { positiveButton: { label: words.set } } : {}),
            // `onValueChange` + `onDismiss` rather than one `onChange` switching on
            // `event.type` — deprecated in datetimepicker 9, and the two names say which of
            // the promise's two outcomes each one is.
            onValueChange: (_e, d) => settle(wallClockFromDate(d)),
            onDismiss: () => settle(null),
          });
          return;
        }
        const opening = dateFromWallClock(current);
        iosRef.current = opening;
        setSaid(words ?? null);
        setIos(opening);
      }),
    [clock24, settle],
  );

  // never presented while another modal is still going (`modalGate.ts` in the design system)
  const shown = useModalGate(ios !== null, 300);
  const element =
    Platform.OS === 'ios' && ios && shown ? (
      <Modal transparent animationType="fade" onRequestClose={() => settle(null)}>
        <View style={[styles.scrim, { backgroundColor: withAlpha(t.color.text, 0.4) }]}>
          <View
            style={[
              styles.card,
              {
                backgroundColor: t.color.surfaceSolid,
                borderRadius: t.radius.l,
                padding: t.space.xl,
              },
            ]}
          >
            {said ? (
              <BodyStrong
                accessibilityRole="header"
                style={{ marginBottom: t.space.sm }}
                testID="quick.time.picker.title"
              >
                {said.title}
              </BodyStrong>
            ) : null}
            <DateTimePicker
              value={ios}
              mode="time"
              display="spinner"
              is24Hour={clock24}
              onValueChange={(_e, d) => {
                // write the ref in the same turn as the spin, before Done can fire
                iosRef.current = d;
                setIos(d);
              }}
              themeVariant={t.theme === 'light' ? 'light' : 'dark'}
              // spinner needs a height on iPhone or the wheel can paint without reporting spins
              style={styles.spinner}
              testID="quick.time.picker"
            />
            <View style={[styles.actions, { gap: t.space.md }]}>
              <Button label="Cancel" variant="ghost" onPress={() => settle(null)} />
              <Button
                label={said?.set ?? 'Done'}
                onPress={() => settle(settleWallClock(iosRef.current))}
              />
            </View>
          </View>
        </View>
      </Modal>
    ) : null;

  return { pick, element };
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'flex-end' },
  card: { margin: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
  /** UIDatePicker's spinner is ~216 pt; without a height some iOS builds skip value changes. */
  spinner: { height: 216, alignSelf: 'stretch' },
});
