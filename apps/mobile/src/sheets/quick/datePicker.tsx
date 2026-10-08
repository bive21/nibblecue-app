/**
 * The platform DATE picker, the sibling of useTimePicker: `Add stored milk` asks when a bag
 * was pumped and when it went into the freezer, which may be days or weeks ago — a time row's
 * `Now · −15 min · −1 hour` cannot say "last Tuesday". Same shape: `pick(current)` resolves
 * with a local calendar day (`yyyy-mm-dd`) or null, and `element` is what iOS has to mount.
 */
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Button, useTheme, withAlpha, useModalGate } from '@nibblecue/ui';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';

type Resolve = (value: string | null) => void;

const pad = (n: number): string => String(n).padStart(2, '0');
/** The device's local calendar day, which is what the platform picker shows. */
const dayKeyOf = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const asDate = (key: string): Date => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
};

export function useDatePicker(): {
  pick: (current: string, maxDate?: Date) => Promise<string | null>;
  element: ReactNode;
} {
  const t = useTheme();
  const [ios, setIos] = useState<{ value: Date; max: Date | undefined } | null>(null);
  // Done reads the spinner's last report, not the Date the last paint closed over (see timePicker)
  const iosRef = useRef<{ value: Date; max: Date | undefined } | null>(null);
  const resolve = useRef<Resolve | null>(null);

  const settle = useCallback((value: string | null) => {
    resolve.current?.(value);
    resolve.current = null;
    iosRef.current = null;
    setIos(null);
  }, []);

  const pick = useCallback(
    (current: string, maxDate?: Date) =>
      new Promise<string | null>(res => {
        resolve.current = res;
        if (Platform.OS === 'android') {
          DateTimePickerAndroid.open({
            value: asDate(current),
            mode: 'date',
            ...(maxDate ? { maximumDate: maxDate } : {}),
            // `onValueChange` + `onDismiss` rather than one `onChange` switching on
            // `event.type` — deprecated in datetimepicker 9, and the two names say which of
            // the promise's two outcomes each one is.
            onValueChange: (_e, d) => settle(dayKeyOf(d)),
            onDismiss: () => settle(null),
          });
          return;
        }
        const opening = { value: asDate(current), max: maxDate };
        iosRef.current = opening;
        setIos(opening);
      }),
    [settle],
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
            <DateTimePicker
              value={ios.value}
              mode="date"
              display="spinner"
              {...(ios.max ? { maximumDate: ios.max } : {})}
              onValueChange={(_e, d) => {
                const next = iosRef.current ? { ...iosRef.current, value: d } : null;
                iosRef.current = next;
                setIos(next);
              }}
              themeVariant={t.theme === 'light' ? 'light' : 'dark'}
              style={styles.spinner}
              testID="stash.date.picker"
            />
            <View style={[styles.actions, { gap: t.space.md }]}>
              <Button label="Cancel" variant="ghost" onPress={() => settle(null)} />
              <Button
                label="Done"
                onPress={() => settle(iosRef.current ? dayKeyOf(iosRef.current.value) : null)}
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
  spinner: { height: 216, alignSelf: 'stretch' },
});
