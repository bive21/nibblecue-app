/**
 * VIBRATION, ON THE APPEARANCE SHEET (the owner, 2026-09-25, of the "that's cool" list: "a soft
 * tick per stepper step, a firm tap on Save, a double tap when a timer starts, a click at each
 * theme-switch stop"). One row with a switch, on by default, that turns every one of those off —
 * and back on.
 *
 * ON THE APPEARANCE SHEET, UNDER THE LOG ROW, because it is the same kind of answer: how the app
 * feels to use on this phone, not something about the baby or the household. It is free on every
 * plan and it is not a look, so it sits among the switches, away from the palettes and skins.
 *
 * SELF-CONTAINED, so the sheet adds it with one line and knows nothing about it: the value is read
 * from the design system's own switch (`useHapticsOn`), so the row is always what `haptic()` obeys,
 * and a flip is `chooseHaptics` — set at once, written to the phone after. The row's own tap
 * (`Row.tsx`) is made after the flip is handed on, so turning vibration ON is felt as it arrives,
 * and turning it off is the one flip that is not felt at all.
 */
import { Row, Rows, useTheme } from '@nibblecue/ui';
import { prefsStore } from '../prefs/async-storage';
import { chooseHaptics, useHapticsOn } from './setting';

const HAPTICS_ROW = {
  title: 'Vibration',
  detail: 'A light tap when you save, step or start a timer',
} as const;

export function HapticsRow() {
  const t = useTheme();
  const on = useHapticsOn();
  return (
    <Rows>
      <Row
        title={HAPTICS_ROW.title}
        detail={HAPTICS_ROW.detail}
        // the phone with a line either side of it: every platform's own glyph for vibrate
        icon="vibrate"
        tint={{ fg: t.color.accent2, soft: t.color.accentSoft }}
        switchValue={on}
        onSwitch={next => void chooseHaptics(prefsStore, next)}
        testID="appearance.sheet.haptics"
      />
    </Rows>
  );
}
