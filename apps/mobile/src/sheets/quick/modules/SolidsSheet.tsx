/**
 * The solids sheet: which meal, WHAT THEY ATE ONE FOOD PER LINE, how it went, and anything the
 * parent noticed (the owner, 2026-09-24; docs/SOLIDS.md — this supersedes PRODUCT_SPEC §6.6's
 * single "Food" field and the prototype's solids sheet).
 *
 * It was one free-text field, and that was the whole problem: "strawberry and banana" typed once
 * and "straberry banana" the next time were two things nobody could ever count or look back on
 * ("this is obciosuly wrong"). Now each food is its own line with an amount in the unit the
 * parent counted, the household's own foods are offered back as they type, and the meal is
 * stored as that list (`solids_details.items`) beside a plain `food` text for anything older.
 *
 * The meal opens on what the clock implies (core/entry/remembered.ts) — a starting pill, not
 * a statement about when a baby should eat — and the clock is the TIME ROW's, not the moment the
 * sheet opened: a breakfast logged at noon with "−4 hours" is breakfast, and a food is "First
 * time" against the meals before the time the parent chose (the audit of 2026-09-24). Once the
 * parent picks a meal, the pill is theirs. "How did it go?" is the parent's read of liking; what
 * they noticed is stored VERBATIM, and the hint under it is the promise that nothing here is
 * assessed (CLAUDE.md rules 1–3).
 *
 * A MEAL'S SLOT OPENS ON ITS OWN MEAL (2026-09-28). Solids' set times are meals now, each rule
 * named for its meal (core `schedule/meals.ts`), so a sheet opened from one — a Schedule row, Up
 * next, a reminder's Log it — opens on that slot's meal (`mealOfRule`) rather than the clock's
 * guess: the 7:30 breakfast logged at 10:45 is still breakfast. It is chosen as if tapped, so the
 * time row no longer moves it. Opened from anywhere else, and from an older solids time with no
 * meal's name, the sheet opens on the clock's guess as before.
 *
 * THE MEAL IS A SKY SINCE 2026-09-25 (the owner's "that's cool" list: "Let's try doing everything.
 * I will then review"): the four pills became the sun's place on a small arc — low on the left at
 * sunrise for breakfast, high at noon for lunch, lower in the afternoon for a snack, setting at the
 * right edge in a dusk for dinner — with the chosen meal's word written under its sun
 * (`MealSkyToggle` in the design system). It is the same control underneath: a radio group named
 * "Meal", four radios with the pills' own words, and a tap on the chosen one changes nothing, so
 * a meal read off the clock keeps following the time row until the parent picks another.
 */
import {
  MEAL_LABEL,
  foodListText,
  isFirstTime,
  mealForTime,
  mealOfRule,
  type Meal,
} from '@nibblecue/core';
import { FoodPlate, formatClock, MealSkyToggle } from '@nibblecue/ui';
import { useMemo, useState } from 'react';
import { AddNote } from '../AddNote';
import { savedAt, TIME_LABEL } from '../copy';
import { useEditBinding } from '../edit/binding';
import { editedItems } from '../edit/forms';
import { QuickEntry } from '../QuickEntry';
import { useTimePicker } from '../timePicker';
import { useLoggingFor } from '../useLoggingFor';
import { useQuickWrite } from '../useQuickWrite';
import type { ModuleSheetProps } from './common';
import { FoodLines } from './solids/FoodLines';
import {
  defaultUnit,
  emptyLine,
  itemsFromLines,
  linesFromItems,
  linesReady,
  sameLines,
  type FoodLine,
} from './solids/foodLines';
import { useMealHistory } from './solids/useMealHistory';

export function SolidsSheet({ openedAtMs, timeZone, clock24, preset, onDone }: ModuleSheetProps) {
  const lf = useLoggingFor('solids');
  const write = useQuickWrite('solids', lf.selection);
  const picker = useTimePicker(clock24);
  const history = useMealHistory();
  const fallbackUnit = defaultUnit(history.foods);
  // an edit opens on the meal as it was logged (`sheets/quick/edit`)
  const edit = useEditBinding();
  // the meal of the slot this sheet was opened for, when its rule names one (see the header)
  const slotMeal = mealOfRule(preset?.slot?.occurrence.rule);
  // null until the parent picks one: until then the meal the chosen time implies — an edit's own
  // meal first, then a meal slot's
  const [mealChosen, setMeal] = useState<Meal | null>(edit?.form.meal ?? slotMeal);
  const mealAt = (atMs: number): Meal => mealChosen ?? mealForTime(atMs, timeZone);
  // the first line starts in pieces and moves to the household's unit once the history loads,
  // unless the parent has already touched it
  // AN EDITED MEAL'S FOODS, AS THEY OPENED: while the lines are still these, the meal keeps its own
  // list (`editedItems`) and can be saved as it stands — an older meal's line may be one no save
  // would take (`lineProblem` 'long'), and its time or note must still be correctable
  const [opened] = useState(() =>
    edit === null
      ? null
      : { lines: linesFromItems(edit.form.items, 'PIECE'), items: edit.form.items },
  );
  const [lines, setLines] = useState<FoodLine[]>(() => opened?.lines ?? [emptyLine('PIECE')]);
  const shown = useMemo(
    () =>
      lines.map(l =>
        !l.unitChosen && l.name === '' && l.amountText === ''
          ? { ...l, unit: fallbackUnit, baseUnit: fallbackUnit }
          : l,
      ),
    [lines, fallbackUnit],
  );
  const [observation, setObservation] = useState(edit?.form.observation ?? '');
  const [note, setNote] = useState(edit?.form.note ?? '');
  const asOpened = opened !== null && sameLines(shown, opened.lines);
  // what the plate beside the list draws: each line by its own key, with what it is called so far
  const plateFoods = useMemo(() => shown.map(l => ({ key: l.id, name: l.name })), [shown]);

  // "First time" against the babies this entry is for — a food new to one twin is not new to
  // the other, so it is marked only when neither has had it
  const { selection } = lf;
  const theirMeals = useMemo(() => {
    const ids = selection.isAll
      ? selection.children.map(c => c.id)
      : selection.selectedId === null
        ? []
        : [selection.selectedId];
    return history.meals.filter(m => m.childId !== null && ids.includes(m.childId));
  }, [history.meals, selection]);
  // (an edited meal is not counted against itself)
  const isNewAt = (atMs: number) => (name: string) =>
    isFirstTime(name, theirMeals, atMs, edit?.record.activity.id ?? null);

  const onSave = async (atMs: number) => {
    const items = editedItems(opened, shown, sameLines, itemsFromLines);
    const foods = foodListText(items);
    const meal = mealAt(atMs);
    const outcome = await write.save({
      fields: {
        type: 'solids',
        startAt: new Date(atMs).toISOString(),
        notes: note.trim() || null,
        detail: {
          meal,
          food: foods,
          items,
          observation: observation.trim() || null,
        },
      },
      toast: savedAt(
        foods ? `${foods} at ${MEAL_LABEL[meal].toLowerCase()}` : MEAL_LABEL[meal].toLowerCase(),
        formatClock(atMs, clock24, timeZone),
      ),
    });
    if (outcome?.committed) onDone();
  };

  return (
    <>
      <QuickEntry
        openedAtMs={openedAtMs}
        timeZone={timeZone}
        clock24={clock24}
        timeLabel={TIME_LABEL.solids}
        saveLabel="Save solids"
        onSave={onSave}
        saveDisabled={!write.ready || !(linesReady(shown) || asOpened)}
        onPickTime={picker.pick}
        // the sheet's last word is Save solids: no attribution paragraph under it (option 3)
        hideByline
        loggingFor={{ options: lf.options, value: lf.value, onChange: lf.setValue }}
        testID="quick.solids"
        /*
          THE MEAL'S PICTURE FIRST, then its time (the owner's option 3, 2026-10-06): the sky the
          parent taps for Breakfast, Lunch, Dinner or Snack sits above Meal time, the food list
          below. The sun opens roughly where the real one is: the meal comes from the clock until
          the parent picks (`mealAt`: `mealForTime` of the time row's instant), so a sheet opened at
          12:40 shows a noon sun over "Lunch", and −15m or a custom time glides it back. The words
          are core's own (`MEAL_LABEL`), one id per meal (`quick.solids.meal.BREAKFAST` …).
        */
        lead={(atMs: number) => (
          <MealSkyToggle
            value={mealAt(atMs)}
            onChange={setMeal}
            label="Meal"
            labels={MEAL_LABEL}
            testID="quick.solids.meal"
          />
        )}
      >
        {(atMs: number) => (
          <>
            <FoodLines
              lines={shown}
              onChange={setLines}
              foods={history.foods}
              isNew={isNewAt(atMs)}
              fallbackUnit={fallbackUnit}
              testID="quick.solids"
              /* THE PLATE (the owner's delight list, 2026-09-26): each food on the list drops onto
                 it as it is written and lifts off as it goes — the list drawn, never a portion or a
                 verdict, and hidden from a screen reader, which reads the list itself.
                 NOT UNTIL THERE IS A FOOD (the owner, 2026-09-27: "when still empty it confused me,
                 as its just a ring. maybe only show this up after user enter the food"): an empty
                 plate was a circle with nothing to say, so it arrives with the first food. */
              aside={
                plateFoods.some(f => f.name.trim() !== '') ? (
                  <FoodPlate foods={plateFoods} testID="quick.solids.plate" />
                ) : undefined
              }
            />
            {/* WHAT YOU NOTICED, folded to the one Add note row every sheet has (the owner's option
                3, 2026-10-06): the meal's own words, kept exactly as written, the field opening on
                a tap — never the tall open box and the paragraph under it. A saved one shows its
                first line. */}
            <AddNote
              value={observation}
              onChangeText={setObservation}
              testID="quick.solids.observation"
            />
            {/* an entry's own note, from before meals had one place for words: an edit keeps it
                correctable (`sheets/quick/edit`) while it holds anything */}
            {edit !== null && (edit.form.note ?? '') !== '' ? (
              <AddNote value={note} onChangeText={setNote} testID="quick.solids.note" />
            ) : null}
          </>
        )}
      </QuickEntry>
      {picker.element}
    </>
  );
}
