/**
 * THE STEPPER'S NUMBER, TYPED (the owner, 2026-09-25: "Make 35 min tappable so users can enter an
 * exact duration … this needs to be done for all logging finished, that involved adjusting the
 * minute or time manually").
 *
 * A tap on the number opens this: a small dialog over the sheet with one numeric field, titled
 * with the stepper's own label ("Slept for"), the number already selected so typing replaces it,
 * the unit beside it and one line saying what may be typed and how far it goes. `Set` (or the
 * keyboard's Done) commits through `typedValue` — a length in whole minutes, or an amount at the
 * stepper's precision and on its grid — clamped into the stepper's range. `Cancel`, the scrim and
 * Back change nothing, and neither does anything `typedValue` cannot read: `Set` stays disabled
 * until the field holds a number.
 *
 * NUMBERS ONLY (the owner, 2026-09-26: *"users must be able to enter only numerical value"*). Every
 * change of the field's text goes through `sanitizeTyped` before it is kept, so a letter, a sign or
 * a second point never appears at all, and the keypad is the one that offers only what is kept
 * (`typedKeyboard`). A length is digits — "1:20" and "1h 20m" went with the letters.
 *
 * THIS DIALOG IS FOR THE STEPPERS WITH NO ROOM TO TYPE WHERE THEY STAND — the round pair, the
 * compact row, the box. The ruler (`NumberRuler`) has a whole row for its number and types in
 * place, under the same rules.
 *
 * WHY A DIALOG AND NOT THE NUMBER TURNING INTO A FIELD WHERE IT STANDS. Three reasons, each of
 * which the in-place field failed:
 *
 *  - iOS's number pad has no return key, so an in-place field is finished only by a tap
 *    somewhere else — and a tap on the sheet's Save is a tap somewhere else that saves the OLD
 *    number, because the field has not let go of the new one yet. A modal cannot be saved
 *    through.
 *  - The stepper is ONE accessible element (the adjustable pattern), which hides its children
 *    from VoiceOver — a field inside it would be one VoiceOver could not reach. The dialog is a
 *    window of its own.
 *  - The round stepper's value is about fifty points wide between its circles: room for "35",
 *    not for a field, a unit and the line that says "Up to 16h".
 *
 * It is the same shape as the time row's iOS picker (a transparent Modal over the sheet's own), so
 * it needs nothing Expo Go does not already carry: React Native's Modal and TextInput, and the
 * design system's own `KeyboardLift` to stand the card above the keyboard. No `Alert.prompt` —
 * that one is iOS-only.
 */
import { useCallback, useState, type ReactNode } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';
import { Input } from './Input';
import { KeyboardLift } from './KeyboardLift';
import { Scrim } from './Scrim';
import {
  sanitizeTyped,
  typedHint,
  typedKeyboard,
  typedText,
  typedValue,
  wholeDigits,
  type TypedEntry,
} from './stepperMath';
import { BodyStrong } from './Text';
import { useModalGate } from './useModalGate';

/** Turns on typing for a stepper (the type lives in `stepperMath`, beside the rules that read it). */
export type { TypedEntry } from './stepperMath';

export interface TypedEntryState {
  /** Open the dialog on the current value; null when the stepper cannot be typed into. */
  open: (() => void) | null;
  /** The dialog, while it is open — rendered by the stepper, beside its own tree. */
  element: ReactNode;
}

/**
 * The dialog's state for one stepper. `entry` absent (or the stepper disabled) is a stepper whose
 * number is only a readout: `open` is null and nothing is ever rendered.
 */
export function useTypedEntry(args: {
  entry: TypedEntry | undefined;
  value: number;
  min: number;
  max: number;
  decimals: number;
  unitLabel: string;
  disabled: boolean;
  onChange: (value: number) => void;
  /** The stepper's grid: a typed amount is put on it (`typedValue`), never a length. */
  step?: number;
  testID?: string;
}): TypedEntryState {
  const { entry, value, min, max, decimals, unitLabel, disabled, onChange, step, testID } = args;
  const t = useTheme();
  // the text in the field while the dialog is up; null is closed
  const [draft, setDraft] = useState<string | null>(null);
  const open = useCallback(() => setDraft(typedText(value, decimals)), [value, decimals]);
  const close = useCallback(() => setDraft(null), []);
  // on an iPhone, never presented while another modal is still going (`modalGate.ts`)
  const shown = useModalGate(draft !== null, 300);

  if (entry === undefined || disabled) return { open: null, element: null };

  const next = draft === null ? null : typedValue(draft, entry.kind, min, max, decimals, step);
  // ONLY A NUMBER IS EVER IN THE FIELD (the owner, 2026-09-26): each change keeps what can stand
  // in it and nothing else (`sanitizeTyped`)
  const type = (text: string): void =>
    setDraft(sanitizeTyped(text, entry.kind, decimals, wholeDigits(max)));
  const commit = (): void => {
    // unreadable input changes nothing, and the dialog stays for a second try
    if (next === null) return;
    if (next !== value) onChange(next);
    setDraft(null);
  };
  const hint = entry.hint ?? typedHint(entry.kind, min, max, decimals, unitLabel);
  const element =
    draft === null || !shown ? null : (
      <Modal transparent animationType="fade" onRequestClose={close}>
        {/* above the keyboard on both platforms, by the design system's own lift (BottomSheet's
            header has the whole story; 2026-09-28) */}
        <KeyboardLift style={styles.fill}>
          <Scrim onPress={close} {...(testID ? { testID: `${testID}-entry-scrim` } : {})} />
          <View style={[styles.center, { padding: t.space.lg }]} pointerEvents="box-none">
            <View
              accessibilityViewIsModal
              style={[
                styles.card,
                {
                  backgroundColor: t.color.surfaceSolid,
                  borderRadius: t.radius.l,
                  padding: t.space.xl,
                  gap: t.space.lg,
                },
              ]}
              {...(testID ? { testID: `${testID}-entry` } : {})}
            >
              <BodyStrong accessibilityRole="header">{entry.title}</BodyStrong>
              <View style={[styles.field, { gap: t.space.md }]}>
                <Input
                  label={entry.title}
                  labelHidden
                  value={draft}
                  onChangeText={type}
                  hint={hint}
                  autoFocus
                  selectTextOnFocus
                  // digits, and a point only where the number has places: the pad offers nothing
                  // the field would not keep
                  keyboardType={typedKeyboard(entry.kind, decimals)}
                  returnKeyType="done"
                  onSubmitEditing={commit}
                  maxLength={12}
                  style={styles.grow}
                  inputStyle={{
                    fontSize: t.type.h2.fontSize,
                    ...(t.fontsReady ? { fontFamily: t.type.numeric.fontFamily } : {}),
                    fontVariant: ['tabular-nums'],
                  }}
                  {...(testID ? { testID: `${testID}-entry-field` } : {})}
                />
                {/* level with the field's text, not with the hint under it */}
                <BodyStrong ink="text2" style={{ paddingTop: t.space.md }}>
                  {unitLabel}
                </BodyStrong>
              </View>
              <View style={[styles.actions, { gap: t.space.md }]}>
                <Button
                  label="Cancel"
                  variant="ghost"
                  onPress={close}
                  {...(testID ? { testID: `${testID}-entry-cancel` } : {})}
                />
                <Button
                  label="Set"
                  onPress={commit}
                  disabled={next === null}
                  {...(testID ? { testID: `${testID}-entry-set` } : {})}
                />
              </View>
            </View>
          </View>
        </KeyboardLift>
      </Modal>
    );
  return { open, element };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, justifyContent: 'center' },
  card: { alignSelf: 'stretch' },
  field: { flexDirection: 'row', alignItems: 'flex-start' },
  grow: { flex: 1 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end' },
});
