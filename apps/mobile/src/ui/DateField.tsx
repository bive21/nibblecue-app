/**
 * A labeled date picker (docs/DESIGN_SYSTEM.md §16.4: an INPUT takes the input radius, never
 * a surface's): inline on iOS, a dialog on Android behind a button that reads like the text
 * field beside it — the solid surface, the `line2` edge, 44pt. The value is always a whole
 * day. The picker's own chrome follows the theme: light stays light, dark and night both take
 * the dark wheel.
 *
 * THE DATE IS AN ANSWER, SO IT IS SET LIKE THE OTHER ANSWERS (the owner, 2026-09-27, of setup's
 * first page: *"i dont like how date of birth (not the title text) but the actual answer dare has
 * a different font than the others, make it uniform here"*). It was set through `Numeric`, which
 * swaps to the mono face with tabular figures, on the grounds that a date is a value. The fields
 * beside it are `Input`s, whose typed text is the body face at the body size in `text`, so
 * "Dana" and "Ada" sat in Hanken Grotesk over a date in IBM Plex Mono: two faces for three
 * answers on one card. The mono face earns its place where figures line up in a column (a table,
 * a timer, a ledger; `type.numeric` says so), and a date alone in a field lines up with nothing.
 * So the value is now exactly what `Input` draws its text in: `Body`, the body face and size, in
 * `text`, and the empty field's words in `text3`, which is `Input`'s placeholder ink. iOS draws the
 * platform's own wheel inline and never had a line of text of its own here.
 */
import DateTimePicker from '@react-native-community/datetimepicker';
import { Body, Label, useTheme } from '@nibblecue/ui';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

export function DateField({
  label,
  value,
  onChange,
  maximumDate,
  minimumDate,
  openAt,
  testID,
}: {
  label: string;
  value: Date | null;
  onChange: (d: Date) => void;
  maximumDate?: Date;
  minimumDate?: Date;
  /**
   * Where the picker opens with no value yet; the latest date allowed when it is not given. A due
   * date's latest is 300 days ahead (`DUE_AHEAD_DAYS`), and a wheel that opens there is ten months
   * from the date a parent is looking for, so the due date fields open on today.
   */
  openAt?: Date;
  testID?: string;
}) {
  const t = useTheme();
  const [open, setOpen] = useState(Platform.OS === 'ios');
  /**
   * ANDROID'S DIALOG IS ONE-SHOT and iOS's wheel is not, so only Android's mounting state moves.
   * On iOS `open` starts true and stays true — the picker is drawn inline under the label and the
   * button that would reopen it is Android-only, so closing it there would leave a dead space
   * with no control left to bring the wheel back.
   */
  const close = () => {
    if (Platform.OS !== 'ios') setOpen(false);
  };
  const shown = value ?? openAt ?? maximumDate ?? new Date();
  return (
    <View style={{ gap: t.space.sm }}>
      <Label>{label}</Label>
      {Platform.OS !== 'ios' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${value ? value.toDateString() : 'not set'}`}
          onPress={() => setOpen(true)}
          style={({ pressed }) => [
            styles.button,
            {
              minHeight: t.hit.min,
              borderRadius: t.radius.s,
              paddingHorizontal: t.space.lg,
              backgroundColor: t.color.surfaceSolid,
              borderColor: open ? t.color.accent : t.color.line2,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
          {...(testID ? { testID } : {})}
        >
          {/* the body face, size and ink `Input` types its answer in (the header says why) */}
          <Body ink={value ? 'text' : 'text3'}>{value ? value.toDateString() : 'Pick a date'}</Body>
        </Pressable>
      ) : null}
      {open ? (
        <DateTimePicker
          value={shown}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          // Two callbacks, not one `onChange` reading `event.type` — deprecated in
          // @react-native-community/datetimepicker 9 in favor of `onValueChange`/`onDismiss`,
          // and the pair is the clearer shape anyway: `date` is non-optional where a value was
          // actually chosen, so there is no `d &&` guard left to get wrong.
          onValueChange={(_e, d) => {
            close();
            onChange(d);
          }}
          onDismiss={close}
          themeVariant={t.theme === 'light' ? 'light' : 'dark'}
          {...(maximumDate ? { maximumDate } : {})}
          {...(minimumDate ? { minimumDate } : {})}
          testID={Platform.OS === 'ios' ? testID : `${testID ?? 'date'}.picker`}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { borderWidth: 1, justifyContent: 'center' },
});
