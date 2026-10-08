/**
 * THE PIECES OF THE COMPLETED-LOG FORMS (the owner's Option 2 "Soft groups", 2026-10-05), shared
 * by the diaper, breastfeed and sleep sheets, logging and editing alike, so the six forms are one
 * family: soft groups in the module's own tint, compact white rows inside them, the day and the
 * clock on the right of a labeled row with a chevron, the four time chips, a note and the entry's
 * details folded to one row each, and the Save in the household's accent.
 *
 *   * `SoftGroup`     the module's soft tint, rounded, around rows that belong together
 *   * `FieldRow`      `[icon] Label ........ Today · 2:28 PM ›` — a tap opens the date and time
 *   * `TimeChips`     Now · −15m · −30m · Custom, for a NEW entry only
 *   * `ValuePill`     − value + on a white pill, the number typed with a tap (`RoundStepper`)
 *   * `NoteRow`       Add note, or the saved note's first line; opens the normal field
 *   * `DetailsRow`    Entry details: who added and who last changed it, folded
 *   * `FormSave`      the one Save, pinned to the sheet's foot; on an edit, Save changes with a
 *                     quiet Delete entry under it
 *   * `useInstantPicker`  the date, then the time, as one instant in the household's zone
 *
 * Every color is a role: the module's soft tint (`useCategory`), the theme's surfaces, lines and
 * accent. Nothing here is a hex.
 */
import { zonedToUtc, localDayKey, type ModuleId } from '@nibblecue/core';
import {
  AppText,
  BodySm,
  Button,
  SlotRow,
  Icon,
  Input,
  RoundStepper,
  SheetFooter,
  useCategory,
  useTheme,
  wallClockOf,
  type IconName,
} from '@nibblecue/ui';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  EVENT_PRESET_LABEL,
  EVENT_PRESET_LONG_LABEL,
  EVENT_PRESET_SPOKEN,
  EVENT_PRESETS,
  type EventPreset,
} from './completedTime';
import { ADD_NOTE, ENTRY_NOTE, ENTRY_NOTE_HINT } from './copy';
import { useDatePicker } from './datePicker';
import { useEditBinding } from './edit/binding';
import { useSaveTick } from './saveTick';
import { useTimePicker } from './timePicker';

export const COMPLETED = {
  details: 'Entry details',
  note: 'Note',
  saveChanges: 'Save changes',
  delete: 'Delete entry',
} as const;

/** The module's soft ground, round a group of rows. */
export function SoftGroup({
  module,
  children,
  style,
  testID,
}: {
  module: ModuleId;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const t = useTheme();
  const cat = useCategory(module as Parameters<typeof useCategory>[0]);
  return (
    <View
      style={[
        {
          backgroundColor: cat.soft,
          borderRadius: t.radius.l,
          // 14, not 8 (the owner, 2026-10-06: "the text what was in the diaper, changed at, is too
          // close to the outer border … give some extra margin on the left"): the heading and the
          // chips under it sit in from the rounded edge, in every group on every form
          paddingHorizontal: t.space.xl,
          paddingVertical: t.space.md,
          gap: t.space.sm,
        },
        style,
      ]}
      {...(testID ? { testID } : {})}
    >
      {children}
    </View>
  );
}

/** A group's title row (`FieldRow strong`): 32 tall, reached at 44. */
const GROUP_TITLE_HEIGHT = 32;
const GROUP_TITLE_SLOP = 6;

/** A hairline between two rows in one group. */
export function RowRule() {
  const t = useTheme();
  return <View style={[styles.rule, { backgroundColor: t.color.line }]} />;
}

export interface FieldRowProps {
  label: string;
  /** What the row holds, on the right: `Today · 2:28 PM`. */
  value: string;
  onPress?: () => void;
  icon?: IconName;
  /** On the sheet itself (a white row with an edge); inside a group, no edge. */
  bordered?: boolean;
  /**
   * The label in the heading weight, as a group's own title ("Woke up at") — and a COMPACT row,
   * 32 tall with its 44 reach in the slop: over the chips in its own group the full 44 left a gap
   * between the heading and its chips that read as two things (the owner, 2026-10-06: "the gap
   * between the text like ended at … and the chips are way too far").
   */
  strong?: boolean;
  accessibilityHint?: string;
  testID?: string;
}

/** `[icon] Label ........ value ›`: one labeled value, a tap to change it. */
export function FieldRow({
  label,
  value,
  onPress,
  icon,
  bordered = false,
  strong = false,
  accessibilityHint = 'Opens a date and time picker',
  testID,
}: FieldRowProps) {
  const t = useTheme();
  return (
    <Pressable
      // with no tap it is a line of words, not a button (the chips under it set the time)
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${label}, ${value}`}
      {...(onPress ? { accessibilityHint } : {})}
      onPress={onPress}
      disabled={onPress === undefined}
      {...(strong ? { hitSlop: { top: GROUP_TITLE_SLOP, bottom: GROUP_TITLE_SLOP } } : {})}
      style={({ pressed }) => [
        styles.field,
        {
          minHeight: strong ? GROUP_TITLE_HEIGHT : t.hit.min,
          gap: t.space.sm,
          opacity: pressed ? 0.7 : 1,
        },
        bordered
          ? {
              backgroundColor: t.color.surfaceSolid,
              borderColor: t.color.line,
              borderWidth: 1,
              borderRadius: t.radius.m,
              paddingHorizontal: t.space.md,
            }
          : null,
      ]}
      {...(testID ? { testID } : {})}
    >
      {icon ? <Icon name={icon} size={20} color={t.color.text2} /> : null}
      <AppText variant={strong ? 'bodyStrong' : 'body'} style={styles.label} numberOfLines={2}>
        {label}
      </AppText>
      {/* at a large text size the date wraps rather than pushing the label to nothing */}
      <AppText
        variant="body"
        ink="text"
        numberOfLines={2}
        style={styles.value}
        testID={testID ? `${testID}.value` : undefined}
      >
        {value}
      </AppText>
      {onPress ? <Icon name="chev" size={16} color={t.color.text2} /> : null}
    </Pressable>
  );
}

/** What a screen reader calls the four, before it reads each one. */
const TIME_CHIPS_NAME = 'When it happened';

/** Now · −15m · −30 · custom: the time a NEW entry's event happened, on the app's one row. */
export function TimeChips({
  value,
  onChoose,
  testID,
  ground,
}: {
  value: EventPreset;
  onChoose: (p: EventPreset) => void;
  testID: string;
  /** The soft group the row sits in, so the resting edge is measured against it. */
  ground?: string;
}) {
  return (
    <SlotRow
      accessibilityLabel={TIME_CHIPS_NAME}
      options={EVENT_PRESETS.map(p => ({
        value: p,
        label: EVENT_PRESET_LABEL[p],
        longLabel: EVENT_PRESET_LONG_LABEL[p],
        accessibilityLabel: EVENT_PRESET_SPOKEN[p],
        ...(p === 'custom' ? { accessibilityHint: 'Opens a date and time picker' } : {}),
      }))}
      value={value}
      onChange={onChoose}
      {...(ground !== undefined ? { ground } : {})}
      testID={testID}
    />
  );
}

/** − value + on a white pill: a number to step, or to type with a tap. */
export function ValuePill({
  value,
  onChange,
  step,
  min,
  max,
  unitLabel,
  label,
  typeable,
  testID,
}: {
  value: number;
  onChange: (n: number) => void;
  step: number;
  min: number;
  max: number;
  unitLabel: string;
  label: string;
  typeable: { title: string; kind: 'minutes' | 'count' | 'amount' };
  testID: string;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: t.color.surfaceSolid, borderRadius: t.radius.pill, padding: 3 },
      ]}
    >
      <RoundStepper
        value={value}
        onChange={onChange}
        step={step}
        min={min}
        max={max}
        unitLabel={unitLabel}
        circle={32}
        valueSize={22}
        bare
        typeable={typeable}
        accessibilityLabel={label}
        testID={testID}
      />
    </View>
  );
}

/** A folded row on the light panel: an icon, a title, maybe a second line, and a chevron. */
function FoldRow({
  icon,
  title,
  detail,
  open,
  onPress,
  testID,
}: {
  icon: IconName;
  title: string;
  detail?: string | null;
  open: boolean;
  onPress: () => void;
  testID: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={detail ? `${title}, ${detail}` : title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.field,
        {
          minHeight: t.hit.min + 4,
          gap: t.space.md,
          paddingHorizontal: t.space.md,
          backgroundColor: t.color.surface2,
          borderRadius: t.radius.m,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
      testID={testID}
    >
      <Icon name={icon} size={20} color={t.color.text2} />
      <View style={styles.grow}>
        <AppText variant="body">{title}</AppText>
        {detail ? (
          <BodySm numberOfLines={1} testID={`${testID}.preview`}>
            {detail}
          </BodySm>
        ) : null}
      </View>
      <Icon name={open ? 'up' : 'chev'} size={16} color={t.color.text2} />
    </Pressable>
  );
}

/**
 * ADD NOTE, FOLDED: one row, and the normal note field once it is tapped. A saved note shows its
 * first line under "Note", never a tall empty box.
 */
export function NoteRow({
  value,
  onChangeText,
  testID,
}: {
  value: string;
  onChangeText: (text: string) => void;
  testID: string;
}) {
  const [open, setOpen] = useState(false);
  if (open)
    return (
      <Input
        label={ENTRY_NOTE}
        value={value}
        onChangeText={onChangeText}
        placeholder={ENTRY_NOTE_HINT}
        multiline
        maxLength={2000}
        autoFocus
        testID={testID}
      />
    );
  const saved = value.trim();
  return (
    <FoldRow
      icon="note"
      title={saved === '' ? ADD_NOTE : COMPLETED.note}
      detail={saved === '' ? null : (saved.split('\n')[0] ?? null)}
      open={false}
      onPress={() => setOpen(true)}
      testID={`${testID}.add`}
    />
  );
}

/** ENTRY DETAILS, folded: who added this entry and who last changed it, as the record says. */
export function DetailsRow({ text }: { text: string | null }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  if (text === null) return null;
  return (
    <View style={{ gap: t.space.xs }}>
      <FoldRow
        icon="info"
        title={COMPLETED.details}
        open={open}
        onPress={() => setOpen(o => !o)}
        testID="entry.details"
      />
      {open ? (
        <BodySm style={{ paddingHorizontal: t.space.md }} testID="entry.by">
          {text}
        </BodySm>
      ) : null}
    </View>
  );
}

/**
 * THE ONE SAVE, at the sheet's foot. A new entry's says what it saves; an edit's is Save changes,
 * with Delete entry as quiet red words under it — the same delete, refusal and Undo as before.
 * The Save ticks when its entry lands, as every form's does (`saveTick.ts`).
 */
export function FormSave({
  label,
  onSave,
  disabled,
  testID,
}: {
  label: string;
  onSave: () => void | Promise<void>;
  disabled: boolean;
  testID: string;
}) {
  const t = useTheme();
  const edit = useEditBinding();
  const tick = useSaveTick();
  /*
    ONE SAVE PER TAP, HOWEVER FAST THE SECOND TAP: the sleep and feed forms hold no busy flag of their
    own, and an edit's host only marks itself saving after its first await, so a double tap reached
    the write twice. The guard lives here, under every completed form's one Save.
  */
  const inFlight = useRef(false);
  const guarded = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      await onSave();
    } finally {
      inFlight.current = false;
    }
  };
  const press = () => void (tick === null ? guarded() : tick.pressed(guarded));
  return (
    <SheetFooter>
      <View style={{ gap: t.space.sm }}>
        <Button
          label={edit === null ? label : COMPLETED.saveChanges}
          onPress={press}
          disabled={disabled}
          {...(tick !== null ? { done: tick.ticked } : {})}
          testID={testID}
        />
        {edit !== null && edit.canChange && edit.remove ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={COMPLETED.delete}
            onPress={edit.remove}
            disabled={edit.deleting === true}
            hitSlop={t.space.sm}
            style={({ pressed }) => [
              styles.delete,
              { minHeight: t.hit.min - 8, opacity: pressed || edit.deleting ? 0.6 : 1 },
            ]}
            testID="entry.delete"
          >
            {/* QUIET: the size and the ink of the app's one red line (BodySm crit), a link under
                the Save rather than a second filled button beside it */}
            <BodySm ink="crit">{COMPLETED.delete}</BodySm>
          </Pressable>
        ) : null}
      </View>
    </SheetFooter>
  );
}

/**
 * THE DATE, THEN THE TIME, as one instant in the household's zone: the day picker opens on the
 * row's day (never after today), the clock on its time. Dismissing either leaves the row alone.
 */
export function useInstantPicker(
  clock24: boolean,
  timeZone: string,
): { pick: (currentMs: number) => Promise<number | null>; element: ReactNode } {
  const date = useDatePicker();
  const time = useTimePicker(clock24);
  const pick = useCallback(
    async (currentMs: number): Promise<number | null> => {
      const day = await date.pick(localDayKey(timeZone, currentMs), new Date());
      if (day === null) return null;
      const wall = await time.pick(wallClockOf(currentMs, timeZone));
      if (wall === null) return null;
      const [y, m, d] = day.split('-').map(Number);
      if (!y || !m || !d) return null;
      return zonedToUtc(timeZone, y, m, d, wall.hours, wall.minutes);
    },
    [date, time, timeZone],
  );
  return {
    pick,
    element: (
      <>
        {date.element}
        {time.element}
      </>
    ),
  };
}

const styles = StyleSheet.create({
  rule: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
  field: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1, flexShrink: 1, minWidth: 0 },
  label: { flexGrow: 1, flexShrink: 1, minWidth: 72 },
  value: { flexShrink: 1, maxWidth: '62%', textAlign: 'right' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  pill: { alignSelf: 'flex-start' },
  delete: { alignSelf: 'center', justifyContent: 'center' },
});
