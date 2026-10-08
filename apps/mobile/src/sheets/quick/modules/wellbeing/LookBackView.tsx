/**
 * LOGGED BEFORE THIS — the look back a Health note opens on (the owner, 2026-10-08: "so that it can
 * be looked back what happened before that"). Right after a note is saved, and whenever one is
 * opened from the Log: everything logged for that baby in the 24, 48 or 72 hours before the note
 * started, oldest first, in days, each entry drawn exactly as the Log draws it.
 *
 * `lookBackFor` (packages/core/src/wellbeing/lookBack.ts) decides what is in it and in what order,
 * and says why the order is the time things happened and nothing else. This view only draws it: no
 * entry is colored, starred, raised or set apart. The one mark it adds is core's "first time logged"
 * on a meal whose food was first logged in the window — a date from the log, said in words.
 *
 * FREE, like logging (CLAUDE.md §4): the look back is the household's own entries. It keeps the
 * plan's history floor, the Log's own (`historyFloorMs`), and says when the window reaches past it.
 *
 * A tap on an entry opens it, as a tap on the Log's row does.
 */
import {
  DEFAULT_LOOK_BACK_HOURS,
  historyFloorMs,
  LOOK_BACK_COPY,
  LOOK_BACK_HOURS,
  lookBackFor,
  noteLine,
  type LookBackHours,
  type ModuleId,
  type TodayActivity,
  type WellbeingSeen,
} from '@nibblecue/core';
import {
  BodySm,
  Button,
  formatClock,
  SectionHeader,
  SegmentedControl,
  TimelineItem,
  useTheme,
} from '@nibblecue/ui';
import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useShell } from '../../../../app/shell';
import { openLocalDb } from '../../../../db';
import { lookBackActivities } from '../../../../db/queries/today';
import { useModuleLabels } from '../../../../modules/useModuleLabels';
import { usePlan } from '../../../../plan/PlanProvider';
import { timelineRow } from '../../../../screens/today/rows';
import { useUnits } from '../../prefs';
import { useMealHistory } from '../solids/useMealHistory';
import { dayLabel, lookBackDays } from './noteForm';

/** The note the look back is for, as it was saved. */
export interface LookedAtNote {
  id: string;
  childId: string | null;
  startMs: number;
  endMs: number | null;
  seen: readonly WellbeingSeen[];
  words: string;
}

export interface LookBackViewProps {
  householdId: string | null;
  note: LookedAtNote;
  timeZone: string;
  clock24: boolean;
  nowMs: number;
  onDone: () => void;
  /** The door to the form, on a note that can be changed; absent, there is none. */
  onChange?: () => void;
}

const HOUR_OPTIONS = LOOK_BACK_HOURS.map(h => ({
  value: String(h) as `${LookBackHours}`,
  label: LOOK_BACK_COPY.hours(h),
}));

export function LookBackView({
  householdId,
  note,
  timeZone,
  clock24,
  nowMs,
  onDone,
  onChange,
}: LookBackViewProps) {
  const t = useTheme();
  const shell = useShell();
  const plan = usePlan();
  const units = useUnits();
  const labels = useModuleLabels();
  const history = useMealHistory();
  const [hours, setHours] = useState<LookBackHours>(DEFAULT_LOOK_BACK_HOURS);
  const [rows, setRows] = useState<TodayActivity[]>([]);

  // the widest window, read once per note: the segmented choice narrows it on the phone
  const widest = Math.max(...LOOK_BACK_HOURS);
  useEffect(() => {
    let live = true;
    if (householdId === null || note.childId === null) return undefined;
    const childId = note.childId;
    void openLocalDb()
      .then(db =>
        lookBackActivities(db, {
          householdId,
          childId,
          fromMs: note.startMs - widest * 3_600_000,
          toMs: note.startMs,
        }),
      )
      .then(found => {
        if (live) setRows(found);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [householdId, note.childId, note.startMs, widest]);

  const floorMs = historyFloorMs(nowMs, timeZone, plan.limitFor('history'));
  const back = useMemo(
    () =>
      lookBackFor({
        note: { id: note.id, childId: note.childId, startMs: note.startMs },
        rows,
        meals: history.meals,
        hours,
        floorMs,
      }),
    [note.id, note.childId, note.startMs, rows, history.meals, hours, floorMs],
  );
  const days = lookBackDays(back.items, nowMs, timeZone);
  const clock = (ms: number) => formatClock(ms, clock24, timeZone);
  const stamp = (ms: number) => `${dayLabel(ms, nowMs, timeZone)}, ${clock(ms)}`;
  const ctx = {
    unit: units.volume,
    units,
    clock,
    timeZone,
    nowMs,
    moduleLabel: (id: ModuleId) => labels.label(id),
  };
  const said = noteLine(note.seen, note.words);

  return (
    <View style={{ gap: t.space.lg }} testID="wellbeing.lookBack">
      {/* THE NOTE ITSELF, first: what was written and when, so the list below has its anchor */}
      <View style={{ gap: t.space.xs }}>
        <BodySm testID="wellbeing.lookBack.note">{said}</BodySm>
        <BodySm ink="text2">
          {[
            LOOK_BACK_COPY.noted(stamp(note.startMs)),
            note.endMs === null ? LOOK_BACK_COPY.noEnd : LOOK_BACK_COPY.ended(stamp(note.endMs)),
          ].join(' · ')}
        </BodySm>
      </View>

      <SegmentedControl
        options={HOUR_OPTIONS}
        value={String(hours) as `${LookBackHours}`}
        onChange={v => setHours(Number(v) as LookBackHours)}
        label={LOOK_BACK_COPY.window}
        testID="wellbeing.lookBack.hours"
      />
      <BodySm ink="text2" testID="wellbeing.lookBack.count">
        {LOOK_BACK_COPY.count(back.items.length, hours)}
      </BodySm>

      {days.map(day => (
        <View key={day.dayKey} style={{ gap: t.space.xs }}>
          <SectionHeader title={day.heading} />
          {day.items.map((item, i) => {
            const row = timelineRow(item.entry, ctx);
            const firsts =
              item.firstTimeFoods.length === 0
                ? null
                : `${item.firstTimeFoods.join(', ')} · ${LOOK_BACK_COPY.firstTime}`;
            const detail = [row.detail, firsts].filter(Boolean).join(' · ');
            return (
              <TimelineItem
                key={item.entry.id}
                moduleId={row.moduleId}
                startLabel={row.startLabel}
                {...(row.endLabel !== undefined ? { endLabel: row.endLabel } : {})}
                title={row.title}
                {...(detail !== '' ? { detail } : {})}
                onPress={() => shell.openEntry(item.entry.id)}
                divider={i < day.items.length - 1}
                testID={`wellbeing.lookBack.entry.${item.entry.id}`}
              />
            );
          })}
        </View>
      ))}

      {back.clipped ? (
        <BodySm ink="text2" testID="wellbeing.lookBack.clipped">
          {LOOK_BACK_COPY.clipped}
        </BodySm>
      ) : null}
      <BodySm ink="text2">{LOOK_BACK_COPY.caveat}</BodySm>

      <Button label={LOOK_BACK_COPY.done} onPress={onDone} testID="wellbeing.lookBack.done" />
      {onChange ? (
        <Button
          label={LOOK_BACK_COPY.change}
          variant="ghost"
          onPress={onChange}
          testID="wellbeing.lookBack.change"
        />
      ) : null}
    </View>
  );
}
