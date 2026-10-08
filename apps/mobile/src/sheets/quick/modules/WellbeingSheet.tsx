/**
 * THE HEALTH NOTE SHEET (the owner, 2026-10-08, from a parent's feedback: "we need something to log
 * any irregularities … at which day and time. so that it can be looked back what happened before
 * that … it does not need to be shown in the quick log module, but just in the + button").
 *
 * WHAT IT ASKS, in the order a parent tells it: when it started (the time row, and the day under it
 * for a note written days on), what they noticed (chips for what was SEEN, any number of them), the
 * same thing in their own words, and whether it is still going or when it stopped. A chip or some
 * words is enough to save (`noteProblem`); nothing else is required.
 *
 * THE CHIPS ARE WHAT A PARENT SAW, NEVER A CONDITION (CLAUDE.md §2 rules 1 and 3; the list is
 * `SEEN_LABEL` in core). This app has refused a tick list of symptoms on the temperature sheet, and
 * still does: these are not symptoms to score, they are the few words a tired parent would otherwise
 * type, stored as tapped and shown back as tapped. Nothing reads them to decide anything, nothing
 * counts them, nothing colors them. Temperature has its own sheet, so there is no fever chip.
 *
 * AFTER THE SAVE, THE LOOK BACK (`LookBackView`): the note's baby's log in the hours before it
 * started, in the order it happened, with a first time logged said on a meal. And a note opened from
 * the Log opens on its look back, with its form one tap away (Change this note): the look back is
 * what a parent opens an old note for, and Delete, with its Undo, is at the sheet's foot as on every
 * entry.
 *
 * ONE BABY PER NOTE (`SINGLE_ONLY` in `save.ts`): the Logging-for row offers the children and no
 * Both, and there is no "+ Liam".
 */
import {
  localDayKey,
  NOTE_COPY,
  NOTE_SUBTITLE,
  noteProblem,
  SEEN_LABEL,
  savedNote,
  wallClock,
  WELLBEING_SEEN,
  zonedToUtc,
  type WellbeingSeen,
} from '@nibblecue/core';
import {
  BodySm,
  Chip,
  formatClock,
  Input,
  Row,
  Rows,
  SectionHeader,
  SegmentedControl,
  useTheme,
  wallClockOf,
} from '@nibblecue/ui';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDatePicker } from '../datePicker';
import { useEditBinding } from '../edit/binding';
import { QuickEntry, useQuickTime } from '../QuickEntry';
import { useTimePicker } from '../timePicker';
import { useLoggingFor } from '../useLoggingFor';
import { useQuickWrite } from '../useQuickWrite';
import type { ModuleSheetProps } from './common';
import { LookBackView, type LookedAtNote } from './wellbeing/LookBackView';
import { dayLabel, endProblem, movedToDay } from './wellbeing/noteForm';

type Going = 'going' | 'stopped';
const GOING_OPTIONS = [
  { value: 'going', label: NOTE_COPY.stillGoing },
  { value: 'stopped', label: NOTE_COPY.stopped },
] as const satisfies readonly { value: Going; label: string }[];

export function WellbeingSheet({ openedAtMs, timeZone, clock24, onDone }: ModuleSheetProps) {
  const t = useTheme();
  const lf = useLoggingFor('wellbeing');
  const write = useQuickWrite('wellbeing', lf.selection);
  const timePicker = useTimePicker(clock24);
  const datePicker = useDatePicker();
  // the time row's state, held here: the day row under it moves the same instant (see the header)
  const time = useQuickTime();
  const edit = useEditBinding();
  const editing = edit !== null;

  const [seen, setSeen] = useState<WellbeingSeen[]>(edit?.form.wellbeingSeen ?? []);
  const [words, setWords] = useState(edit?.form.note ?? '');
  const [going, setGoing] = useState<Going>(edit?.form.wellbeingEnded ? 'stopped' : 'going');
  // the stop, when there is one: the entry's own on an edit, else the moment the sheet opened
  const [endMs, setEndMs] = useState<number>(
    edit?.form.wellbeingEnded ? edit.form.endMs : openedAtMs,
  );
  // what stopped the last Save, said over it until the parent changes something (`QuickEntry`)
  const [error, setError] = useState<string | null>(null);
  /*
    WHICH VIEW IS UP. A new note opens on the form and turns into its look back once saved; a note
    opened from the Log opens on its look back, which is what a parent opens an old note for.
  */
  const [saved, setSaved] = useState<LookedAtNote | null>(
    edit === null
      ? null
      : {
          id: edit.record.activity.id,
          childId: edit.record.activity.child_id,
          startMs: edit.form.startMs,
          endMs: edit.form.wellbeingEnded ? edit.form.endMs : null,
          seen: edit.form.wellbeingSeen,
          words: edit.form.note,
        },
  );
  const [view, setView] = useState<'form' | 'lookBack'>(editing ? 'lookBack' : 'form');

  // a chip on or off, kept in the sheet's own order whatever order they were tapped in
  const toggle = (s: WellbeingSeen) => {
    setError(null);
    setSeen(cur =>
      cur.includes(s)
        ? cur.filter(x => x !== s)
        : WELLBEING_SEEN.filter(x => x === s || cur.includes(x)),
    );
  };

  const stoppedAt = going === 'stopped' ? endMs : null;

  const onSave = async (atMs: number) => {
    const problem = noteProblem(seen, words) ?? endProblem(atMs, stoppedAt, Date.now());
    setError(problem);
    if (problem !== null) return;
    const outcome = await write.save({
      fields: {
        type: 'wellbeing',
        startAt: new Date(atMs).toISOString(),
        endAt: stoppedAt === null ? null : new Date(stoppedAt).toISOString(),
        notes: words.trim() || null,
        detail: { seen },
      },
      toast: savedNote(formatClock(atMs, clock24, timeZone)),
    });
    if (!outcome?.committed) return;
    if (editing) {
      onDone();
      return;
    }
    // the note just written, and the hours before it (see the header)
    setSaved({
      id: outcome.entityIds[0] ?? '',
      childId: write.plan.kind === 'one' ? write.plan.childId : null,
      startMs: atMs,
      endMs: stoppedAt,
      seen,
      words: words.trim(),
    });
    setView('lookBack');
  };

  if (view === 'lookBack' && saved !== null) {
    return (
      <LookBackView
        householdId={write.householdId}
        note={saved}
        timeZone={timeZone}
        clock24={clock24}
        nowMs={openedAtMs}
        onDone={onDone}
        {...(editing && edit.canChange ? { onChange: () => setView('form') } : {})}
      />
    );
  }

  /** The day picker, answering a `yyyy-mm-dd` in the household's day; never a day after today. */
  const pickDay = async (current: number): Promise<string | null> =>
    datePicker.pick(localDayKey(timeZone, current), new Date());

  /** The stop's clock time on its own day: the picker answers the hour and minute only. */
  const pickEndTime = async () => {
    const picked = await timePicker.pick(wallClockOf(endMs, timeZone), {
      title: NOTE_COPY.stoppedAt,
      set: NOTE_COPY.stoppedAt,
    });
    if (picked === null) return;
    const w = wallClock(timeZone, endMs);
    setError(null);
    setEndMs(zonedToUtc(timeZone, w.year, w.month, w.day, picked.hours, picked.minutes));
  };

  return (
    <>
      <QuickEntry
        openedAtMs={openedAtMs}
        timeZone={timeZone}
        clock24={clock24}
        timeLabel={NOTE_COPY.started}
        saveLabel={NOTE_COPY.save}
        onSave={onSave}
        saveDisabled={!write.ready}
        onPickTime={timePicker.pick}
        loggingFor={{ options: lf.options, value: lf.value, onChange: lf.setValue }}
        time={time}
        error={error}
        testID="quick.wellbeing"
      >
        {(atMs: number) => (
          <>
            {editing ? null : <BodySm ink="text2">{NOTE_SUBTITLE}</BodySm>}
            {/* THE DAY IT STARTED, under the time row: the same clock time on another day */}
            <Rows>
              <Row
                icon="cal"
                title={NOTE_COPY.startedOn}
                detail={dayLabel(atMs, openedAtMs, timeZone)}
                onPress={() =>
                  void pickDay(atMs).then(day => {
                    if (day === null) return;
                    time.setPreset('custom');
                    time.setCustomMs(movedToDay(day, atMs, Date.now(), timeZone));
                  })
                }
                testID="quick.wellbeing.day"
              />
            </Rows>

            <View style={{ gap: t.space.sm }}>
              <SectionHeader title={NOTE_COPY.seen} />
              {/* every chip drawn alike, any number of them, a second tap takes one off */}
              <View style={[styles.wrap, { gap: t.space.sm }]} testID="quick.wellbeing.seen">
                {WELLBEING_SEEN.map(s => (
                  <Chip
                    key={s}
                    label={SEEN_LABEL[s]}
                    compact
                    selected={seen.includes(s)}
                    onPress={() => toggle(s)}
                    testID={`quick.wellbeing.seen.${s.toLowerCase()}`}
                  />
                ))}
              </View>
            </View>

            <Input
              label={NOTE_COPY.words}
              value={words}
              onChangeText={text => {
                setError(null);
                setWords(text);
              }}
              placeholder={NOTE_COPY.wordsHint}
              multiline
              maxLength={2000}
              testID="quick.wellbeing.words"
            />

            <SegmentedControl
              options={GOING_OPTIONS}
              value={going}
              onChange={next => {
                setError(null);
                setGoing(next);
              }}
              label={NOTE_COPY.goingLabel}
              testID="quick.wellbeing.going"
            />
            {going === 'stopped' ? (
              <Rows>
                <Row
                  icon="cal"
                  title={NOTE_COPY.stoppedOn}
                  detail={dayLabel(endMs, openedAtMs, timeZone)}
                  onPress={() =>
                    void pickDay(endMs).then(day => {
                      if (day === null) return;
                      setError(null);
                      setEndMs(movedToDay(day, endMs, Date.now(), timeZone));
                    })
                  }
                  testID="quick.wellbeing.endDay"
                />
                <Row
                  icon="clock"
                  title={NOTE_COPY.stoppedAt}
                  detail={formatClock(endMs, clock24, timeZone)}
                  onPress={() => void pickEndTime()}
                  testID="quick.wellbeing.endTime"
                />
              </Rows>
            ) : null}

            {/* the way back to the look back, on a note that has one */}
            {saved !== null ? (
              <Rows>
                <Row
                  icon="note"
                  title={NOTE_COPY.lookBack}
                  onPress={() => setView('lookBack')}
                  accessibilityHint={NOTE_COPY.lookBackHint}
                  testID="quick.wellbeing.lookBack"
                />
              </Rows>
            ) : null}
          </>
        )}
      </QuickEntry>
      {timePicker.element}
      {datePicker.element}
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
});
