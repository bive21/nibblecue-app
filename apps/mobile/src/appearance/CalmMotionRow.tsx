/**
 * CALM MOTION, ON THE APPEARANCE SHEET (2026-09-28; the design system's `CalmMotion`). The owner
 * asked whether the app was "too animated … too much" for a new parent, and the answer at 3 a.m. was
 * yes: this is the row that keeps it still. Off, At night, Always; Off is the default (2026-10-06).
 *
 * UNDER VIBRATION, and built as its twin (`HapticsRow`): the same kind of answer, how the app feels
 * to use on this phone, never a look and never a fact about the baby or the household. It is free
 * on every plan and it is a preference of this phone only (the `appearance` record, device-level).
 * SELF-CONTAINED, so the sheet adds it with one line and knows nothing about it.
 *
 * IT PREVIEWS ITSELF (docs/DESIGN_SYSTEM.md §17): a tap is `set`, a token swap, so the pill moves
 * and the whole app, the sheet under the parent's thumb included, is still or moving again before
 * the finger is up. Nothing has to be closed to see what it did.
 *
 * WHEN THE PHONE ITSELF ASKS FOR LESS MOTION, the phone wins whatever is chosen here
 * (`reducesMotion`), so the row shows Always, takes no tap and says where the setting lives.
 */
import { BodySm, Label, SegmentedControl, useTheme } from '@nibblecue/ui';
import { View } from 'react-native';
import { deviceClock24 } from '../sheets/quick/prefs';
import { useAppearance } from './AppearanceProvider';
import { CALM_MOTION_COPY, CALM_MOTION_OPTIONS, calmMotionView } from './calmMotion';

export function CalmMotionRow() {
  const t = useTheme();
  const { prefs, osReduceMotion, set } = useAppearance();
  const view = calmMotionView(prefs.calmMotion, osReduceMotion, deviceClock24());
  return (
    <View style={{ gap: t.space.sm }} testID="appearance.sheet.calm">
      <Label>{CALM_MOTION_COPY.title}</Label>
      <SegmentedControl
        label={CALM_MOTION_COPY.title}
        options={CALM_MOTION_OPTIONS}
        value={view.value}
        onChange={calmMotion => set({ calmMotion, calmMotionChosen: true })}
        disabled={view.disabled}
        testID="appearance.sheet.calm.mode"
      />
      <BodySm testID="appearance.sheet.calm.note">{view.line}</BodySm>
      {/* what the setting is, for a parent who has never met it (2026-10-06) */}
      <BodySm ink="text2" testID="appearance.sheet.calm.about">
        {CALM_MOTION_COPY.about}
      </BodySm>
    </View>
  );
}
