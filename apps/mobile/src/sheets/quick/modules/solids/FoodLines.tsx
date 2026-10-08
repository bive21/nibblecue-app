/**
 * WHAT THEY ATE, ONE LINE PER FOOD — then how it went (the owner, 2026-09-24; docs/SOLIDS.md §2).
 *
 * The capture sheet and the entry editor draw this same block, so correcting a meal is the
 * gesture that made it. Every rule — which unit a line starts in, what a suggestion fills, what
 * "Loved it" at the top does — is `foodLines.ts`, tested in node; this file is layout.
 *
 * THE SUGGESTIONS ARE THE HOUSEHOLD'S OWN FOODS, never a catalog: the owner, of another app's
 * prefilled list, "it is a lot of data and information". They are also what keeps one food one
 * food — tapping "Strawberry" is faster than typing "straberry".
 *
 * THE COLUMN HEADS ARE THE LABELS. Each line's two fields sit under "Food" and "How much" like a
 * table's cells, so the fields hide their own labels and carry them for a screen reader instead;
 * a placeholder alone would not be a label (DESIGN_SYSTEM §9).
 */
import {
  FOOD_NAME_MAX,
  FOOD_RESPONSES,
  FOOD_UNITS,
  FOODS_PER_MEAL_MAX,
  RESPONSE_LABEL,
  UNIT_CHOICE_LABEL,
  foodKey,
  suggestFoods,
  unitLabel,
  type FoodResponse,
  type FoodSummary,
  type FoodUnit,
} from '@nibblecue/core';
import {
  AppText,
  Badge,
  BodySm,
  Button,
  Chip,
  Icon,
  Input,
  Label,
  Meta,
  useCategory,
  useTheme,
  accentInk,
} from '@nibblecue/ui';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FOOD_LINES, RESPONSE_TILE } from './copy';
import {
  addFood,
  emptyLine,
  lineProblem,
  mealResponse,
  namedLines,
  responsesDiffer,
  sameForAll,
  setAllResponses,
  tooManyFoods,
  unitShown,
  withAmount,
  withName,
  type FoodLine,
  type LineProblem,
} from './foodLines';

export interface FoodLinesProps {
  lines: readonly FoodLine[];
  onChange: (lines: FoodLine[]) => void;
  /** The household's foods, most recent first (`useMealHistory`). */
  foods: readonly FoodSummary[];
  /** Whether this name would be a first for the baby — the "First time" mark. */
  isNew: (name: string) => boolean;
  /** The unit a new line starts in (`defaultUnit`). */
  fallbackUnit: FoodUnit;
  /** `quick.solids` or `entry.solids`. */
  testID: string;
  /**
   * A picture beside the heading — the quick sheet's plate, which mirrors these lines (the owner's
   * delight list, 2026-09-26). The editor passes none and draws the heading as it always has.
   */
  aside?: ReactNode;
}

const PROBLEM_TEXT: Record<LineProblem, string> = {
  amount: FOOD_LINES.amountProblem,
  name: FOOD_LINES.nameProblem,
  long: FOOD_LINES.longProblem,
};

/** The list card's measurements (the owner's option 3, 2026-10-06). */
const CARD_INSET = 8;
const ROW_PAD = 6;
const FIELD_GAP = 6;
const FIELD_HEIGHT = 40;
const AMOUNT_WIDTH = 48;
const UNIT_WIDTH = 64;
const REMOVE_WIDTH = 28;
const ADD_HEIGHT = 40;
const RECENT_MAX = 8;
const TYPED_MAX = 4;

export function FoodLines({
  lines,
  onChange,
  foods,
  isNew,
  fallbackUnit,
  testID,
  aside,
}: FoodLinesProps) {
  const t = useTheme();
  // a chosen answer wears the module's own color, as every log sheet's controls do
  const cat = useCategory('solids');
  const [unitOpenFor, setUnitOpenFor] = useState<string | null>(null);
  // the per-food answers open by themselves on a meal whose foods already went differently
  const [each, setEach] = useState(() => responsesDiffer(lines));

  const update = (id: string, change: (l: FoodLine) => FoodLine) =>
    onChange(lines.map(l => (l.id === id ? change(l) : l)));
  const usedKeys = new Set(lines.map(l => foodKey(l.name)).filter(k => k !== ''));
  const named = namedLines(lines);
  const shared = mealResponse(lines);
  // a food added while the meal has one answer is one of the foods it was said of (M2)
  const inherited = each ? null : shared;
  const recent = suggestFoods(foods, '', usedKeys, RECENT_MAX);

  /* ONE ROW OF FOUR, a face over a word (`RESPONSE_TILE`). Chosen is said three ways, never by
     color alone: a heavier border, the tinted fill, and the radio's selected state. Tapping the
     chosen one again clears it, as the chips did. */
  const responseChips = (
    value: FoodResponse | null,
    set: (r: FoodResponse | null) => void,
    idPrefix: string,
    small: boolean,
  ) => (
    <View
      style={[styles.row, { gap: small ? t.space.xs : t.space.sm }]}
      accessibilityRole="radiogroup"
    >
      {FOOD_RESPONSES.map(r => {
        const on = value === r;
        return (
          <Pressable
            key={r}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={RESPONSE_LABEL[r]}
            onPress={() => set(on ? null : r)}
            style={({ pressed }) => [
              styles.tile,
              {
                minHeight: small ? t.hit.min : t.hit.min + t.space.md,
                paddingVertical: small ? t.space.xs : t.space.sm,
                paddingHorizontal: t.space.xs,
                borderRadius: t.radius.m,
                borderWidth: on ? 2 : 1,
                borderColor: on ? cat.fg : t.color.line,
                backgroundColor: on ? cat.soft : 'transparent',
                opacity: pressed ? 0.8 : 1,
              },
            ]}
            testID={`${idPrefix}.${r.toLowerCase()}`}
          >
            <AppText variant={small ? 'body' : 'h2'} align="center" accessible={false}>
              {RESPONSE_TILE[r].face}
            </AppText>
            <Meta ink={on ? 'text' : 'text2'} align="center" accessible={false}>
              {RESPONSE_TILE[r].word}
            </Meta>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View style={{ gap: t.space.md }} testID={`${testID}.foods`}>
      {/* WHAT THEY ATE, then ONE CARD of slim rows (the owner's option 3, 2026-10-06): the name, the
          amount, the unit and a small ×, a hairline between foods, and Add another food at the
          card's foot. Each field carries its own name for a screen reader; the placeholders show
          what goes where. */}
      <View style={[styles.head, { gap: t.space.sm }]}>
        <AppText variant="bodyStrong">{FOOD_LINES.header}</AppText>
        {aside}
      </View>
      <View
        style={[
          styles.card,
          {
            borderRadius: t.radius.m,
            borderColor: t.color.line,
            backgroundColor: t.color.surfaceSolid,
            paddingHorizontal: CARD_INSET,
          },
        ]}
        testID={`${testID}.list`}
      >
        {lines.map((line, i) => {
          const problem = lineProblem(line);
          const typed = line.name.trim();
          const matches =
            typed === '' || foods.some(f => f.key === foodKey(typed))
              ? []
              : suggestFoods(
                  foods,
                  typed,
                  new Set([...usedKeys].filter(k => k !== foodKey(typed))),
                  TYPED_MAX,
                );
          const lonelyBlank = lines.length === 1 && typed === '' && line.amountText.trim() === '';
          // the food's own unit until one is chosen or counted — what the amount will be saved in
          const unit = unitShown(line, foods);
          // what is wrong with the line, if anything, said once under it and again in the name of
          // the field it concerns, for a screen reader
          const said = problem === null ? null : PROBLEM_TEXT[problem];
          return (
            <View
              key={line.id}
              style={[
                {
                  gap: t.space.xs,
                  paddingVertical: ROW_PAD,
                  borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                  borderTopColor: t.color.line,
                },
              ]}
              testID={`${testID}.line.${String(i)}`}
            >
              <View style={[styles.row, { gap: FIELD_GAP }]}>
                {/* An older meal's food can be longer than a name may now be saved. The field
                  shows it whole — a native length limit would cut it on screen — and only lets
                  it shrink; the line says what to do before a changed list is saved. */}
                <Input
                  label={
                    said !== null && problem !== 'amount'
                      ? `${FOOD_LINES.nameA11y(i + 1)}. ${said}`
                      : FOOD_LINES.nameA11y(i + 1)
                  }
                  labelHidden
                  value={line.name}
                  onChangeText={v => update(line.id, l => withName(l, v, foods))}
                  placeholder={FOOD_LINES.namePlaceholder}
                  maxLength={Math.max(FOOD_NAME_MAX, line.name.length)}
                  autoCapitalize="sentences"
                  dense
                  style={styles.grow}
                  testID={`${testID}.line.${String(i)}.name`}
                />
                <Input
                  label={
                    said !== null && problem === 'amount'
                      ? `${FOOD_LINES.amountA11y(typed)}. ${said}`
                      : FOOD_LINES.amountA11y(typed)
                  }
                  labelHidden
                  value={line.amountText}
                  onChangeText={v => update(line.id, l => withAmount(l, v, foods))}
                  placeholder={FOOD_LINES.amountPlaceholder}
                  keyboardType="decimal-pad"
                  maxLength={7}
                  dense
                  inputStyle={styles.amount}
                  style={{ width: AMOUNT_WIDTH }}
                  testID={`${testID}.line.${String(i)}.amount`}
                />
                {/* the unit: its word and a chevron in a field-sized box, opening the units */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={FOOD_LINES.unitA11y(UNIT_CHOICE_LABEL[unit])}
                  accessibilityState={{ expanded: unitOpenFor === line.id }}
                  onPress={() => setUnitOpenFor(unitOpenFor === line.id ? null : line.id)}
                  hitSlop={{ top: 2, bottom: 2 }}
                  style={({ pressed }) => [
                    styles.unit,
                    {
                      width: UNIT_WIDTH,
                      height: FIELD_HEIGHT,
                      borderRadius: t.radius.s,
                      borderColor: unitOpenFor === line.id ? t.color.accent : t.color.line2,
                      paddingHorizontal: t.space.sm,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                  testID={`${testID}.line.${String(i)}.unit`}
                >
                  <AppText variant="body" numberOfLines={1} style={styles.shrink}>
                    {unitLabel(unit, 2)}
                  </AppText>
                  <Icon
                    name={unitOpenFor === line.id ? 'up' : 'down'}
                    size={14}
                    color={t.color.text2}
                  />
                </Pressable>
                {/* a small ×, its 44 reach kept inside the row and never over the unit */}
                {lonelyBlank ? (
                  <View style={{ width: REMOVE_WIDTH }} />
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={FOOD_LINES.removeA11y(typed)}
                    onPress={() => {
                      const rest = lines.filter(l => l.id !== line.id);
                      onChange(rest.length === 0 ? [emptyLine(fallbackUnit)] : rest);
                    }}
                    hitSlop={{ top: 8, bottom: 8, right: 8 }}
                    style={({ pressed }) => [
                      styles.remove,
                      { width: REMOVE_WIDTH, height: FIELD_HEIGHT, opacity: pressed ? 0.6 : 1 },
                    ]}
                    testID={`${testID}.line.${String(i)}.remove`}
                  >
                    <Icon name="x" size={18} color={t.color.text2} />
                  </Pressable>
                )}
              </View>

              {unitOpenFor === line.id ? (
                <View style={[styles.wrap, { gap: t.space.sm }]}>
                  {FOOD_UNITS.map(u => (
                    <Chip
                      key={u}
                      label={UNIT_CHOICE_LABEL[u]}
                      small
                      selected={unit === u}
                      onPress={() => {
                        update(line.id, l => ({ ...l, unit: u, unitChosen: true }));
                        setUnitOpenFor(null);
                      }}
                      testID={`${testID}.line.${String(i)}.unit.${u.toLowerCase()}`}
                    />
                  ))}
                </View>
              ) : null}

              {/* under the whole line, where there is room for it */}
              {said === null ? null : (
                <BodySm
                  ink="crit"
                  accessibilityRole="alert"
                  accessibilityLiveRegion="polite"
                  testID={`${testID}.line.${String(i)}.problem`}
                >
                  {said}
                </BodySm>
              )}
              {typed !== '' && isNew(typed) ? (
                <Badge
                  label={FOOD_LINES.firstTime}
                  tone="accent"
                  testID={`${testID}.line.${String(i)}.first`}
                />
              ) : null}

              {matches.length > 0 ? (
                <View style={[styles.wrap, { gap: t.space.sm }]}>
                  {matches.map(f => (
                    <Chip
                      key={f.key}
                      label={f.name}
                      small
                      icon="plus"
                      accessibilityLabel={FOOD_LINES.suggestA11y(f.name)}
                      onPress={() => update(line.id, l => withName(l, f.name, foods))}
                      testID={`${testID}.line.${String(i)}.suggest.${f.key}`}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}

        {lines.length < FOODS_PER_MEAL_MAX ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={FOOD_LINES.add}
            onPress={() => onChange([...lines, emptyLine(fallbackUnit, inherited)])}
            style={({ pressed }) => [
              styles.addRow,
              {
                minHeight: ADD_HEIGHT,
                gap: t.space.sm,
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: t.color.line,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
            testID={`${testID}.add`}
          >
            <Icon name="plus" size={18} color={accentInk(t.color)} />
            <AppText variant="body" ink="accent">
              {FOOD_LINES.add}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {tooManyFoods(lines) ? (
        <BodySm
          ink="crit"
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          testID={`${testID}.tooMany`}
        >
          {FOOD_LINES.tooMany}
        </BodySm>
      ) : null}

      {recent.length > 0 ? (
        <View style={{ gap: t.space.xs }}>
          <Meta>{FOOD_LINES.recent}</Meta>
          <View style={[styles.wrap, { gap: t.space.sm }]}>
            {recent.map(f => (
              <Chip
                key={f.key}
                label={f.name}
                small
                icon="plus"
                accessibilityLabel={FOOD_LINES.suggestA11y(f.name)}
                onPress={() => onChange(addFood(lines, f, fallbackUnit, foods, inherited))}
                testID={`${testID}.recent.${f.key}`}
              />
            ))}
          </View>
        </View>
      ) : null}

      {/* HOW IT WENT, once there is something to ask about — the owner's order: the foods, then
          the question. One answer for the meal; each food on its own when they went differently. */}
      {named.length === 0 ? null : (
        <View style={{ gap: t.space.sm }} testID={`${testID}.response`}>
          <Label>{FOOD_LINES.question}</Label>
          {responseChips(
            shared,
            r => onChange(setAllResponses(lines, r)),
            `${testID}.response`,
            false,
          )}
          {named.length > 1 ? (
            <Button
              label={each ? FOOD_LINES.sameForAll : FOOD_LINES.eachFood}
              variant="ghost"
              size="xs"
              onPress={() => {
                // back to one answer: foods that went differently are asked again (M3)
                if (each) onChange(sameForAll(lines));
                setEach(!each);
              }}
              style={styles.start}
              testID={`${testID}.response.each`}
            />
          ) : null}
          {each && named.length > 1
            ? named.map(l => (
                <View key={l.id} style={{ gap: t.space.xs }}>
                  <Meta ink="text">{l.name.trim()}</Meta>
                  {responseChips(
                    l.response,
                    r => update(l.id, x => ({ ...x, response: r })),
                    `${testID}.response.${foodKey(l.name)}`,
                    true,
                  )}
                </View>
              ))
            : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  // four equal tiles that share the row whatever the words' widths (`RESPONSE_TILE`)
  tile: { flex: 1, flexBasis: 0, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  grow: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  card: { borderWidth: StyleSheet.hairlineWidth },
  amount: { textAlign: 'center' },
  unit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
  },
  shrink: { flexShrink: 1 },
  remove: { alignItems: 'center', justifyContent: 'center' },
  addRow: { flexDirection: 'row', alignItems: 'center' },
  start: { alignSelf: 'flex-start' },
});
