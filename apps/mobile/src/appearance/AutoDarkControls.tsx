/**
 * AUTOMATIC DARK, THE CONTROL (the owner, 2026-09-20: *"Add the option to turn on automatic dark
 * mode at certain times (night) or follow Chiara's bed time. Add it to setting and ask this on
 * onboarding"*). Headed "Automatic night mode" since 2026-09-25, on both surfaces at once, because
 * its words are `AUTO_DARK_COPY` and both surfaces draw this file; the code keeps its name.
 *
 * ONE COMPONENT, BOTH PLACES. The Appearance sheet and onboarding step 4 render this file, the
 * way the rhythm rows render the Rule sheet's own segments: the question a parent answers during
 * setup and the control they come back to later have to be the same control, or the second one
 * is a new thing to learn. It is also the only way "Bed time" gets reworded once.
 *
 * THREE ANSWERS AND OFF IS ONE OF THEM. Off is first and is where everybody starts — a household
 * that has never been asked has not asked for anything. `times` opens two chips; `bedtime` opens
 * no control at all, because the times it uses are the ones already on Routine, and a second
 * copy of them here would be a second place to keep in step.
 *
 * WHAT IT DIMS TO IS A SEPARATE QUESTION, and it is the only half that is sold. Dark is the bill
 * of rights (CLAUDE.md §4) and so is putting a clock on it; night is part of Plus, and the night
 * stop carries its lock before the tap, exactly as the Theme control's does. A free household
 * that had night selected during the 14 days keeps the setting and the evening paints dark — the
 * resolver's take-back, said in words by `nightTookBack` rather than silently.
 *
 * IT IS THE THEME'S OWN TOGGLE, WITH TWO STOPS (the owner, 2026-09-26: *"in theme selection if
 * automatic night mode is on, the dim to should be a toggle like previously but only bettwen dark or
 * night"*). It was a segmented control of two words under a sky toggle of three, the same question
 * asked two ways on one sheet. Now it is that sky toggle with Night and Dark only (`DIM_STOPS`) —
 * the amber crescent on the left, the moon on the right, the chosen look's word on its sky — with
 * the lock drawn in Night's halo on a free plan, every tap through `pickTheme`, and the change
 * painted the moment it is made while the window is open, as every token swap on this sheet is.
 *
 * IT ONLY EVER DIMS, and the last line says so. A parent already on dark who turns this on would
 * otherwise sit waiting for 8 p.m. to do something.
 */
import { AUTO_DARK_MODE_OPTIONS, AUTO_DARK_COPY, DIM_TO_LABELS, isAutoDarkLocked } from './options';
import {
  BodySm,
  Chip,
  DayNightSwitch,
  DIM_STOPS,
  Label,
  SegmentedControl,
  ThemeSkyToggle,
  useTheme,
  type AppearanceEntitlements,
  type AutoDarkPrefs,
  type AutoDarkTheme,
  type DimBedtime,
} from '@nibblecue/ui';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { clockOf, hhmmOf } from '../lib/clock';
import { deviceClock24 } from '../sheets/quick/prefs';
import { useTimePicker } from '../sheets/quick/timePicker';

export interface AutoDarkControlsProps {
  value: AutoDarkPrefs;
  onChange: (next: AutoDarkPrefs) => void;
  /** The household's own wake/bed pair, when the caller has one to show. */
  bedtime: DimBedtime | null;
  entitled: AppearanceEntitlements;
  /** A locked night segment's tap: open the paywall over whatever this is sitting in. */
  onLocked: () => void;
  plusName: string;
  /** Whether the window is open at this moment, when the caller knows (the settings sheet does). */
  onNow?: boolean;
  /** True when the plan took night back and the window is painting dark instead. */
  tookBack?: boolean;
  /** Setup calls this its own thing; the sheet does not repeat the page's heading. */
  heading?: boolean;
  /**
   * Whether to offer the CHOICE of look. Setup does not (see the note on the render): half of
   * that choice is sold, and a paywall two screens into a first run is a trap whatever the
   * copy says. Setup's window dims to dark, which is free forever, and Appearance is where
   * night is chosen later.
   */
  offerLook?: boolean;
  /*
    NO `later` LINE ANY MORE (the owner, 2026-09-25: "remove the your porifle picture apperance
    hasngiht mode too"). It was setup's one line naming where the control lives afterwards, and
    the only caller that passed it was setup, so the prop went with the line.
  */
  /**
   * SETUP'S OWN LIVE PREVIEW (the owner, 2026-09-22: "add a small button on the right side that
   * says try me, where enable it toggles to dark mode"). Undefined where a caller does not offer
   * one — the sheet does not, because a parent there is already looking at the live app and the
   * theme control two taps away does the same job. Present, it sits beside the header; the
   * caller owns what flipping it actually does and what `tryingMe` reports back.
   *
   * A DAY/NIGHT SWITCH SINCE 2026-09-25, not a button (the owner: *"make this an interesting
   * animation toggle"*, after a sun-and-moon switcher). A preview that is either on or off is a
   * switch in all but looks, and now it is one: the knob is the sun while the screen is as the
   * parent left it and rolls over into the moon while it is dark. The switch's value IS
   * `tryingMe` and its one handler IS `onTryMe`; when the preview ends and what ends it — the
   * switch, leaving the step, the screen closing — is the caller's (setup's `darkPreview.ts`).
   */
  onTryMe?: () => void;
  /** Whether `onTryMe`'s preview is the one currently painted: the switch's own value. */
  tryingMe?: boolean;
  /**
   * The room the controls have — the Appearance sheet's body — for "Dim to"'s toggle, which is as
   * wide as it is given (`ThemeSkyToggle`). Absent, the control measures its own.
   */
  width?: number;
  testID: string;
}

const wallOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return { hours: h ?? 0, minutes: m ?? 0 };
};

export function AutoDarkControls({
  value,
  onChange,
  bedtime,
  entitled,
  onLocked,
  plusName,
  onNow = false,
  tookBack = false,
  heading = true,
  offerLook = true,
  onTryMe,
  tryingMe = false,
  width,
  testID,
}: AutoDarkControlsProps) {
  const t = useTheme();
  const clock24 = deviceClock24();
  const timePicker = useTimePicker(clock24);
  const at = (hhmm: string) => clockOf(hhmm, clock24);
  const nightLocked = isAutoDarkLocked('night', entitled);
  /**
   * THE HEADING SITS WHERE EVERY OTHER BOX'S HEADING SITS (the owner, 2026-09-26: "in automatic
   * night mode, the padding on the top feels like more than the others, remove this"). The row
   * that carries "Try me" is as tall as its 44 pt target, and the heading was centered in it — so
   * the words began some 15 pt lower than Do not disturb's, under the same box padding. The row is
   * measured, and the whole control rises by the space above the heading: the words land on the
   * box's own top line and the capsule stays centered on them. Nothing is pushed out of the box —
   * the lift is never more than the box's padding — and the target keeps its full 44 pt.
   */
  const [rowH, setRowH] = useState(0);
  const [headH, setHeadH] = useState(0);
  // "Dim to"'s room, measured only where the caller did not say it
  const [measured, setMeasured] = useState(0);
  const room = width ?? measured;
  const lift = onTryMe && heading && rowH > headH && headH > 0 ? (rowH - headH) / 2 : 0;
  const measure = (set: (h: number) => void) => (e: LayoutChangeEvent) =>
    set(e.nativeEvent.layout.height);
  const measureWidth = (e: LayoutChangeEvent) => setMeasured(e.nativeEvent.layout.width);

  const pick = async (key: 'from' | 'to') => {
    const w = await timePicker.pick(wallOf(value[key]));
    if (!w) return;
    onChange({ ...value, [key]: hhmmOf(w.hours, w.minutes) });
  };

  /** A locked look opens the gate and changes nothing; everything else is a token swap. */
  const pickTheme = (next: AutoDarkTheme) => {
    if (isAutoDarkLocked(next, entitled)) return void onLocked();
    onChange({ ...value, theme: next });
  };

  return (
    <View style={{ gap: t.space.sm, marginTop: -lift }} testID={testID}>
      {onTryMe ? (
        <View style={styles.headerRow} onLayout={measure(setRowH)}>
          {/* THE HEADING GIVES WAY, NOT THE SWITCH (2026-09-25). "Automatic night mode" is six
              characters longer than "Automatic dark", the words beside the switch sit in a
              capsule now, and on setup the row is inside a box — about 289 pt of row in 286 on a
              360 dp phone. A row item in React Native does not shrink unless told to, so the
              switch was pushed past the box's edge and clipped. The heading wraps instead, and at
              any text size the switch stays whole and in reach. */}
          {heading ? (
            <Label style={styles.headerLabel} onLayout={measure(setHeadH)}>
              {AUTO_DARK_COPY.header}
            </Label>
          ) : null}
          {/* the words stay "Try me" either way: which way it is set is the knob's job — where it
              sits, and whether it is the sun or the moon — and a switch whose name changed with
              its state would announce a different control every time it was flipped */}
          <DayNightSwitch
            value={tryingMe}
            onValueChange={onTryMe}
            caption={AUTO_DARK_COPY.tryMe}
            accessibilityLabel={AUTO_DARK_COPY.tryMeLabel}
            accessibilityHint={AUTO_DARK_COPY.tryMeHint}
            testID={`${testID}.try_me`}
          />
        </View>
      ) : heading ? (
        <Label>{AUTO_DARK_COPY.header}</Label>
      ) : null}
      <BodySm>{AUTO_DARK_COPY.lede}</BodySm>
      <SegmentedControl
        label={AUTO_DARK_COPY.header}
        options={AUTO_DARK_MODE_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
        value={value.mode}
        onChange={mode => onChange({ ...value, mode })}
        testID={`${testID}.mode`}
      />

      {value.mode === 'times' ? (
        <View style={{ gap: t.space.sm }}>
          <View style={[styles.wrap, { gap: t.space.sm }]}>
            <Chip
              label={`${AUTO_DARK_COPY.from} ${at(value.from)}`}
              icon="moon"
              onPress={() => void pick('from')}
              testID={`${testID}.from`}
            />
            <Chip
              label={`${AUTO_DARK_COPY.to} ${at(value.to)}`}
              icon="sun"
              onPress={() => void pick('to')}
              testID={`${testID}.to`}
            />
          </View>
          {value.from === value.to ? (
            <BodySm testID={`${testID}.same`}>{AUTO_DARK_COPY.sameTimes}</BodySm>
          ) : null}
        </View>
      ) : null}

      {value.mode === 'bedtime' ? (
        <>
          <BodySm ink="text" testID={`${testID}.window`}>
            {bedtime === null
              ? AUTO_DARK_COPY.bedtimeWaiting(at(value.from), at(value.to))
              : AUTO_DARK_COPY.bedtimeFollows(at(bedtime.bed), at(bedtime.wake))}
          </BodySm>
          <BodySm>{AUTO_DARK_COPY.bedtimeWhere}</BodySm>
        </>
      ) : null}

      {value.mode === 'off' || !offerLook ? null : (
        <View
          style={{ gap: t.space.sm, paddingTop: t.space.sm }}
          {...(width === undefined ? { onLayout: measureWidth } : {})}
        >
          <Label>{AUTO_DARK_COPY.dimTo}</Label>
          {/* THE THEME TOGGLE'S NIGHT AND DARK (the header says why): the lock in Night's halo on a
              free plan before the tap, every tap through `pickTheme` — a locked one opens the gate
              and moves nothing — and the stops' words from the option list */}
          <ThemeSkyToggle
            label={AUTO_DARK_COPY.dimTo}
            stops={DIM_STOPS}
            labels={DIM_TO_LABELS}
            // what is PAINTED, never a stored choice the plan took back — the same reason the
            // Theme control binds to `shownTheme`: a knob resting on a Night the plan took back
            // would cover the lock that says Night is sold, over an evening painted dark
            value={tookBack ? 'dark' : value.theme}
            onChange={pickTheme}
            locked={{ night: nightLocked }}
            lockedHint={AUTO_DARK_COPY.lockedHint(plusName)}
            width={room}
            testID={`${testID}.theme`}
          />
          {tookBack ? (
            <BodySm testID={`${testID}.took_back`}>{AUTO_DARK_COPY.nightTookBack(plusName)}</BodySm>
          ) : nightLocked ? (
            <BodySm testID={`${testID}.night_note`}>{AUTO_DARK_COPY.nightFree(plusName)}</BodySm>
          ) : null}
          <BodySm>{AUTO_DARK_COPY.onlyDims}</BodySm>
          {onNow ? <BodySm ink="text">{AUTO_DARK_COPY.onNow}</BodySm> : null}
        </View>
      )}
      {value.mode !== 'off' && !offerLook ? <BodySm>{AUTO_DARK_COPY.onlyDims}</BodySm> : null}
      {timePicker.element}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerLabel: { flexShrink: 1 },
});
