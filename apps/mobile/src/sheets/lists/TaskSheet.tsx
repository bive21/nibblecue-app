/**
 * One chore (WP6c; the prototype's `SHEETS.taskedit`): what needs doing, by when, how often,
 * and whose it is.
 *
 * THE SUGGESTIONS ARE CHORES, NOT ADVICE. "Wash and prepare the bottles" is a thing this
 * household already does and a name it would otherwise type; nothing here suggests a routine,
 * an interval or a standard, and none of them is pre-selected. They are absent once the field
 * has anything in it, which is also when they would start getting in the way.
 *
 * "Any time" is a real answer and the sheet keeps it: a chore with no time raises no reminder,
 * and the app never picks a time on the household's behalf.
 */
import { TASK_REPEATS, TASK_REPEAT_LABEL, type TaskRepeat } from '@nibblecue/core';
import {
  BodySm,
  BottomSheet,
  Button,
  Chip,
  Input,
  Label,
  SegmentedControl,
  useTheme,
} from '@nibblecue/ui';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { saveTask } from '../../data/lists';
import { systemClock } from '../../data/repository';
import type { PersonRow, TaskRowLocal } from '../../db/queries/lists';
import { TASKS } from '../../lists/copy';
import { clockFor } from '../../lists/format';
import { useToast } from '../../ui/toast';
import { useTimePicker } from '../quick/timePicker';
import { useWriteContext } from '../quick/useWriteContext';

/** Names a household types anyway. Never pre-selected, and gone once the field has words. */
const SUGGESTIONS: readonly string[] = [
  'Wash and prepare the bottles',
  'Sterilize the pump parts',
  'Defrost milk for tomorrow',
  'Pack the diaper bag',
  'Refill the wipes and diapers',
  'Charge the pump',
  'Start the laundry',
];

const DEFAULT_TIME = '21:00';

export interface TaskSheetProps {
  target: TaskRowLocal | 'new' | null;
  onClose: () => void;
  people: readonly PersonRow[];
  clock24: boolean;
  onRemove: (task: TaskRowLocal) => void;
}

export function TaskSheet({ target, onClose, people, clock24, onRemove }: TaskSheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { context } = useWriteContext();
  const picker = useTimePicker(clock24);
  const [shown, setShown] = useState<TaskRowLocal | 'new' | null>(target);
  const [title, setTitle] = useState('');
  const [at, setAt] = useState<string | null>(DEFAULT_TIME);
  const [repeat, setRepeat] = useState<TaskRepeat>('DAILY');
  const [who, setWho] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target === null) return;
    setShown(target);
    const row = target === 'new' ? null : target;
    setTitle(row?.title ?? '');
    setAt(row === null ? DEFAULT_TIME : (row.at_local_time?.slice(0, 5) ?? null));
    setRepeat((row?.repeat as TaskRepeat | undefined) ?? 'DAILY');
    setWho(row?.assigned_to ?? null);
    setBusy(false);
  }, [target]);

  const editing = shown !== null && shown !== 'new' ? shown : null;

  const pickTime = async () => {
    const [h, m] = (at ?? DEFAULT_TIME).split(':');
    const picked = await picker.pick({ hours: Number(h ?? 21), minutes: Number(m ?? 0) });
    if (picked === null) return;
    setAt(`${String(picked.hours).padStart(2, '0')}:${String(picked.minutes).padStart(2, '0')}`);
  };

  const save = async () => {
    const clean = title.trim();
    if (clean.length === 0 || busy) return;
    const ctx = await context();
    if (ctx === null) return;
    setBusy(true);
    const { db, ...w } = ctx;
    const r = await saveTask(db, systemClock, {
      ...w,
      ...(editing === null ? {} : { taskId: editing.id }),
      title: clean,
      atLocalTime: at,
      repeat,
      assignedTo: who,
    });
    setBusy(false);
    onClose();
    if (r.committed) toast.show(TASKS.saved(clean));
  };

  return (
    <>
      <BottomSheet
        visible={target !== null}
        title={editing === null ? TASKS.newTask : TASKS.editTask}
        onClose={onClose}
        detent="large"
        bottomInset={insets.bottom}
        footer={
          <Button
            label={TASKS.save}
            onPress={() => void save()}
            disabled={title.trim().length === 0 || busy}
            testID="tasks.sheet.save"
          />
        }
        testID="tasks.sheet"
      >
        <View style={{ gap: t.space.lg }}>
          <View style={{ gap: t.space.sm }}>
            <Input
              label={TASKS.what}
              value={title}
              onChangeText={setTitle}
              placeholder={TASKS.whatPlaceholder}
              testID="tasks.sheet.title"
            />
            {editing === null && title.trim().length === 0 ? (
              <View style={[styles.wrap, { gap: t.space.sm }]}>
                {SUGGESTIONS.map(s => (
                  <Chip
                    key={s}
                    label={s}
                    selected={false}
                    onPress={() => setTitle(s)}
                    testID={`tasks.sheet.suggest.${s.slice(0, 8)}`}
                  />
                ))}
              </View>
            ) : null}
          </View>

          <View style={{ gap: t.space.sm }}>
            <Label>{TASKS.when}</Label>
            <View style={[styles.wrap, { gap: t.space.sm }]}>
              <Chip
                label={at === null ? TASKS.pickTime : clockFor(at, clock24)}
                selected={at !== null}
                onPress={() => void pickTime()}
                testID="tasks.sheet.time"
              />
              <Chip
                label={TASKS.anyTime}
                selected={at === null}
                onPress={() => setAt(null)}
                testID="tasks.sheet.anytime"
              />
            </View>
          </View>

          <SegmentedControl
            options={TASK_REPEATS.map(value => ({ value, label: TASK_REPEAT_LABEL[value] }))}
            value={repeat}
            onChange={setRepeat}
            label={TASKS.repeat}
            testID="tasks.sheet.repeat"
          />

          <View style={{ gap: t.space.sm }}>
            <Label>{TASKS.who}</Label>
            <View style={[styles.wrap, { gap: t.space.sm }]}>
              <Chip
                label={TASKS.anyone}
                selected={who === null}
                onPress={() => setWho(null)}
                testID="tasks.sheet.who.anyone"
              />
              {people.map(p => (
                <Chip
                  key={p.id}
                  label={p.name}
                  selected={who === p.id}
                  onPress={() => setWho(p.id)}
                  testID={`tasks.sheet.who.${p.id}`}
                />
              ))}
            </View>
          </View>

          {editing !== null ? (
            <Button
              label={TASKS.remove}
              variant="ghost"
              onPress={() => {
                onRemove(editing);
                onClose();
              }}
              disabled={busy}
              testID="tasks.sheet.remove"
            />
          ) : null}

          <BodySm ink="text2">{TASKS.hint}</BodySm>
          <BodySm ink="text2">{TASKS.footer}</BodySm>
        </View>
        {/*
          THE PICKER LIVES INSIDE THE SHEET (the owner, 2026-09-29: after "Any time", "Pick a time"
          could not be tapped again). On iOS the picker is a Modal, and a Modal presents from the
          view controller its host view sits in: beside the sheet that is the screen's, which is
          already presenting the sheet, so iOS refused it without a word. Inside the sheet it
          presents from the sheet's own controller, as every log sheet's does
          (`timePicker.test.ts` holds every sheet to it).
        */}
        {picker.element}
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
});
