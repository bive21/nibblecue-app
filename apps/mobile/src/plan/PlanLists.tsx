/**
 * WHAT PLUS ADDS AND WHAT STAYS FREE, AS TWO CARDS OF SHORT NAMES — the one place the plan lists
 * are drawn, rendered by the Plan page and by the paywall alike, so the two cannot drift (the
 * owner, 2026-09-27: *"the plan where it lists the plus and free are looking very crowded with
 * text, how else would we do it to make it cleaner?"*).
 *
 * They were two lists of whole sentences, a row and an icon chip each: thirteen and nineteen of
 * them, most on two lines. Now each list is a card — its title, then a grid of a glyph and the
 * feature's `short` name from the matrix, two across: a star in `accent2` on a card washed with
 * `accentSoft` for what Plus adds, a check in `good` on a plain card for what every plan keeps.
 * The sentence is not thrown away. It is each item's accessibility label, so a screen reader
 * still hears "Grandparents, a nanny or a night nurse · each with their own login" where the eye
 * reads "Extra caregivers". Every item is shown, free ones included: the free plan's generosity
 * is part of the pitch, and the grid is short enough not to need a fold.
 *
 * FIT (`planGrid.ts`, held in node by `planGridFit.test.ts`): two across while every name sets on
 * two lines in half the card at the reader's text size, one across when one would not, and never
 * a word broken or a line cut. The grid measures its own width; the first frame guesses it from
 * the window, as `ModuleCardGrid` does. Both cards take the same number of columns, so the two
 * grids line up one above the other.
 *
 * NOT A CONTROL: nothing here takes a tap, so an item is a line of text with a picture, not a
 * 44 pt row. Nothing is said by color alone — each card has its title and its own glyph.
 *
 * AND UNDER WHAT PLUS ADDS, ONE QUIET LINE ABOUT WHERE THE MONEY GOES (the owner, 2026-09-27: *"the
 * subscription fee is too maintain the app, customer service, and server so we can keep it going"*;
 * `planWhy`, docs/BRANDING.md §2c). The moment of paying is the moment "where does it go" is asked,
 * so it is said here, on the Plan page and the paywall alike, in the secondary ink, and never as a
 * plea: what Plus pays for, and nothing about the family, which beside it read as too obvious (the
 * owner, the same day); the story itself is told on About.
 */
import { IN_APP_STRINGS } from '@nibblecue/brand';
import { AppText, BodySm, BodyStrong, Card, Icon, useTheme } from '@nibblecue/ui';
import { useState } from 'react';
import {
  StyleSheet,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { PlanLine } from './gate';
import {
  PLAN_GRID,
  planGridColumns,
  planGridGuess,
  planGridRows,
  planGridScaleCap,
} from './planGrid';

/** The Free card's title. The Plus card's is the tier's name from brand.json, and "adds". */
export const FREE_ALWAYS = 'Free, always';

export interface PlanListsProps {
  /** What Plus adds and what every plan keeps, from `planLists` or `gateCopy`. */
  plus: readonly PlanLine[];
  free: readonly PlanLine[];
  /**
   * The two cards' test ids: `plan.adds` and `plan.keeps` on the Plan page, `gate.plus` and
   * `gate.free` on the paywall. An item's is its card's and its feature's key: `plan.adds.history`.
   */
  testIDs: { plus: string; free: string };
  style?: StyleProp<ViewStyle>;
}

export function PlanLists({ plus, free, testIDs, style }: PlanListsProps) {
  const t = useTheme();
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  const gridWidth = measured > 0 ? measured : planGridGuess(windowWidth);
  const names = [...plus, ...free].map(line => line.short);
  const cap = planGridScaleCap(gridWidth, names);
  const scale = Math.min(fontScale > 0 ? fontScale : 1, cap);
  const columns = planGridColumns(gridWidth, scale, names);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - measured) >= 0.5) setMeasured(w);
  };

  const list = (
    title: string,
    lines: readonly PlanLine[],
    glyph: 'star' | 'check',
    ink: string,
    testID: string,
    tint?: string,
    footnote?: string,
  ) => (
    <Card {...(tint ? { tint } : {})} testID={testID}>
      <BodyStrong accessibilityRole="header">{title}</BodyStrong>
      <View style={styles.grid} onLayout={onLayout}>
        {planGridRows(lines, columns).map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map(line => (
              <View
                key={line.key}
                accessible
                accessibilityRole="text"
                accessibilityLabel={line.full}
                style={styles.item}
                testID={`${testID}.${line.key}`}
              >
                {/* the glyph sits on the name's first line, at whatever size the name is drawn */}
                <View style={[styles.glyph, { height: PLAN_GRID.lineHeight * scale }]}>
                  <Icon name={glyph} size={PLAN_GRID.glyph} color={ink} />
                </View>
                <AppText variant="bodySm" maxFontSizeMultiplier={cap} style={styles.name}>
                  {line.short}
                </AppText>
              </View>
            ))}
            {/* an odd last item keeps its column rather than stretching across the row */}
            {row.length < columns ? <View style={styles.item} /> : null}
          </View>
        ))}
      </View>
      {footnote !== undefined ? (
        <BodySm ink="text2" testID={`${testID}.why`} style={styles.footnote}>
          {footnote}
        </BodySm>
      ) : null}
    </Card>
  );

  return (
    <View style={[{ gap: t.space.lg }, style]}>
      {list(
        `${IN_APP_STRINGS.paywallTitle} adds`,
        plus,
        'star',
        t.color.accent2,
        testIDs.plus,
        t.color.accentSoft,
        IN_APP_STRINGS.planWhy,
      )}
      {list(FREE_ALWAYS, free, 'check', t.color.good, testIDs.free)}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { alignSelf: 'stretch', marginTop: PLAN_GRID.rowGap, gap: PLAN_GRID.rowGap },
  // a row's items start level, whichever of them takes two lines
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: PLAN_GRID.columnGap },
  item: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: PLAN_GRID.glyphGap,
  },
  glyph: { width: PLAN_GRID.glyph, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, minWidth: 0 },
  footnote: { marginTop: PLAN_GRID.rowGap * 2 },
});
