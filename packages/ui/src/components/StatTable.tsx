/**
 * StatTable — the day's figures as ONE striped table, three across (docs/DESIGN_SYSTEM.md §5).
 *
 * THE SIX TINTED CARDS ARE GONE (the owner, 2026-09-18: *"redesign the 6 cards on today. i dont
 * really like how it looks as a whole. you can try making it into a 2x3 table with alternating
 * color"*).
 *
 * `SummaryRow` drew milk, sleep, diapers, pumped, sessions and feeds as six separate tinted
 * cells, three across. Each was defensible on its own and together they were a mosaic: six
 * background hues, six rounded rectangles, six shadows, in a column of the page that is already
 * carrying a timer card, a tile grid, a care strip and two lists. Nothing in it was wrong and
 * the whole of it was loud.
 *
 * A TABLE IS THE HONEST FORM for six labelled numbers that belong to one heading. One surface,
 * one radius, one shadow, hairlines between the cells — and ONE FILL (the owner, 2026-09-18:
 * "just show one color not alternating, and middle aligned"). The stripe was there to help the
 * eye track a row across, which is a problem a wide table has and this one does not: three cells
 * a thumb wide, read as a block. Alternating them made a six-number card look like a
 * spreadsheet, and the hairlines already do the dividing.
 *
 * THE HUE STAYS ON THE NUMERAL. Losing the category color would lose real information — milk is
 * the accent, sleep is the sleep hue, diapers the diaper hue — and a parent reads those without
 * reading the labels. It moves from the cell's background to the value itself, where the palette
 * already guarantees a large numeral clears 3:1 on the surface (§8) and where it competes with
 * nothing. A cell with two figures (`also`) gives each its own module's hue; the units after them
 * say which is which, so the hue is never the only thing that does.
 *
 * AN ODD LAST CELL SPANS THE ROW rather than sitting beside a hole. Three figures is a real
 * household — one that does not pump — and a table with a blank cell in the corner reads as a
 * rendering fault.
 *
 * THREE ACROSS, TWO DOWN (the owner, 2026-09-18: "in today's new table, i like it, but make it
 * 2 row 3 columns, instead of 3 rows 2 column"). It is the shape the six figures already came
 * in — `totalsRows` groups them as milk/sleep/diapers and pumped/sessions/feeds, which is two
 * sentences rather than three pairs — and it costs a third of the height on a screen that is
 * already long. The narrower cell is why the side padding steps down at three: `StatCard` made
 * the same trade for the same reason, and the numeral keeps its size while the cell gives up
 * the room.
 *
 * EVERY LINE IS ONE LINE (the owner, 2026-09-26: *"in today's report, keep the information in one
 * line"*). The label, the figure and the note of every cell are each drawn on a single line, and a
 * line that would be wider than its cell is DRAWN SMALLER rather than wrapped or cut: the table
 * measures its own width, and `statTable.ts` says how wide each line is and how far it has to give
 * (`statFit`), at every phone width and every text size. The diaper kinds, which were a list of
 * one short line each so that none was cut (2026-09-24), are one line of counts and glyphs now
 * (`noteParts`) — "1 [drop] 2 [pile] 3 [pile][drop]" — and a figure's units are small beside its
 * digits, a length's letters included, which is what keeps a newborn's "15h 20m" whole on the
 * narrowest phone. `adjustsFontSizeToFit` stays on each text line as the insurance the other
 * one-line words in this design system carry.
 *
 * A FIGURE IS NOT DRAWN UNDER ITS FLOOR TO STAY ONE LINE (2026-09-26): where its digits would fall
 * under `STAT_FIGURE_FLOOR`, a figure with a short form (`short`) is drawn in it instead
 * (`statFigureLine`). The cell's spoken label keeps the exact amount.
 *
 * A MIXED-FEEDING DAY IS THREE LINES TOO (the owner, 2026-09-27: *"feeding in today home page
 * reeport is way too long when having both bottle and breastfeed, making the text to small"*). The
 * ounces and the minutes shared one line after a middle dot, and on most phones that line was drawn
 * at about 13 pt. Now the label carries the day's feeds in the Quick tiles' own count chip
 * ("FEEDING [15×]", `badge`), the ounces are the figure in their golden hue, and the minutes at the
 * breast are the third line — where the neighbors' notes are, in breastfeeding's hue, a size under
 * the figure (`also`, `STAT_SECOND_SIZES`) — so the three cells keep one height and level lines.
 * Each of the two is led by its module's own picture, the Quick tile's (`figureIcon`; the owner, the
 * same day: *"add a small icon on the left size before showing the oz, and breastfeeding icon
 * before on the left (before) how many minutes"*), at the one size at which it is still the owner's
 * picture (`STAT_FIGURE_ICON`). Its room comes out of the cell's padding (`STAT_FIGURE_BLEED`), so
 * the figure beside it is drawn exactly as large as it would be alone, on the narrowest phone too.
 *
 * THE DROP IS BLUE AND THE PILE IS BROWN (the owner, 2026-09-26: *"the iccon in diapers need to be
 * colored, blue for water drop, brown for the poo"*): each glyph wears its own ink from
 * `theme/diaperKinds.ts` — the water's blue, the diaper sheet's brown lifted on a dark card, the
 * night palette's own two in the amber theme — measured at 3:1 or more on this card in every
 * design, scheme and theme. SOLID since 2026-09-27 (the owner: *"make the icon solid with color
 * instead, it looks too similar"*), and a mixed diaper's pile and drop touch as one mark
 * (`STAT_PAIR_GAP`). The counts beside them stay the note's quiet ink, and any other glyph a note
 * could carry keeps it too.
 */
import { useState, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/paths';
import { diaperGlyphInk, diaperGlyphInks } from '../theme/diaperKinds';
import { categoryColors, useTheme } from '../theme/ThemeProvider';
import {
  statBadgeText,
  statFigureLine,
  statHeaderFit,
  statNoteWidth,
  statPartsWidth,
  statSecondLine,
  STAT_BADGE,
  STAT_FIGURE_BLEED,
  STAT_FIGURE_ICON,
  STAT_FIGURE_ICON_GAP,
  STAT_FIGURE_SIZES,
  STAT_FIT_INSURANCE,
  STAT_GAP_SIZE,
  STAT_GLYPH,
  STAT_GLYPH_GAP,
  STAT_HEADER_BLEED,
  STAT_LINE,
  STAT_PAIR_GAP,
  STAT_PART_GAP,
  STAT_SECOND_LINE,
  STAT_SECOND_SIZES,
  STAT_TYPE,
  statCellPad,
  statCellRoom,
  statColumns,
  statFigureIconInset,
  statFit,
  statRows,
  type StatFigureSizes,
  type StatFigureSpec,
  type StatRun,
} from './statTable';
import { Surface } from './Surface';
import { AppText, Label, Numeric } from './Text';
import type { StatTone } from './StatCard';

/** A second figure, on a line of its own under the first, in its own module's hue. */
export interface StatTableFigure {
  value: string;
  unit?: string;
  tone?: StatTone;
  /** Its module's picture before it, as the cell's `figureIcon` is before the first figure. */
  figureIcon?: IconName;
}

/** One part of a note drawn as counts and glyphs: `2` and the glyphs that say what of. */
export interface StatTableNotePart {
  count: string;
  icons: readonly IconName[];
}

export interface StatTableCell {
  value: string;
  unit?: string;
  label: string;
  tone?: StatTone;
  /**
   * THE DAY'S COUNT BESIDE THE LABEL — "FEEDING [15×]" (the owner, 2026-09-27: *"change them from
   * "FEEDING" to "FEEDING (15x)" … and circle them or highlight"*). Drawn as the Quick tiles' own
   * count chip (`STAT_BADGE`), the label and the chip drawn smaller together where they must be
   * (`statHeaderFit`). Nothing is drawn for none or for zero, as a tile draws no chip for a module
   * with nothing today. `accessibilityLabel` says the count in words.
   */
  badge?: number;
  /**
   * A SECOND FIGURE, ON A LINE OF ITS OWN — the minutes at the breast under the ounces of a
   * household that gives bottles and breastfeeds (the owner, 2026-09-27: *"then row 1, x oz …
   * then row 2 the breastfeeding 1h 37m"*). Drawn where a note would be, in its own tone, a size
   * under the figure (`STAT_SECOND_SIZES`), never shortened; `accessibilityLabel` says both.
   */
  also?: StatTableFigure;
  /**
   * THE MODULE'S PICTURE BEFORE THE FIGURE — the bottle before a mixed-feeding day's ounces, and
   * breastfeeding's picture before its minutes (`also.figureIcon`; the owner, 2026-09-27: *"add a
   * small icon on the left size before showing the oz, and breastfeeding icon before on the left
   * (before) how many minutes (both icons same like the main icon we use)"*). The Quick tile's own
   * name, drawn by `Icon` at `STAT_FIGURE_ICON`, the size at which it is still the owner's picture,
   * centered on the figure's line. It never gives, and its room comes out of the cell's padding
   * (`STAT_FIGURE_BLEED`), so the figure is drawn as large as it would be without it. Decoration to
   * a screen reader: `accessibilityLabel` already says which figure is which. A figure without one
   * is drawn as it always was.
   */
  figureIcon?: IconName;
  /**
   * THE FIGURE IN FEWER DIGITS — `30` `oz` for `29.75` `oz` (2026-09-26) — drawn in place of `value`
   * and `unit` only where they would be drawn under the figure floor (`statFigureLine`,
   * `STAT_FIGURE_FLOOR`). Wherever the exact figure fits it stays, and `accessibilityLabel` always
   * says the exact amount.
   */
  short?: StatFigureSpec;
  /**
   * The small line under the figure — "3 oz more than yesterday", "2 wet, 4 mixed" — the
   * comparison that makes a total mean something (the owner, 2026-09-18: "Instead of showing
   * only totals, add small comparisons"). Arithmetic on the household's own log, never a
   * verdict on the number; `rows.ts` in the app writes it.
   */
  note?: string;
  /**
   * THE NOTE AS COUNTS AND GLYPHS, ON ONE LINE — the diaper kinds, `1 [drop] 2 [pile]` (the owner,
   * 2026-09-26: *"just make it into an icon for wet, dirty, and mixed … this way description can be
   * in oneline"*). Drawn INSTEAD of `note`, which stays the sentence in words; the glyphs are
   * decoration to a screen reader, which hears the cell's `accessibilityLabel`. A drop and a pile
   * are drawn in their own colors (`theme/diaperKinds.ts`), the counts in the note's quiet ink, and
   * a part's glyphs touch (`STAT_PAIR_GAP`): a mixed diaper is the pile and the drop as one mark.
   *
   * It replaces `noteLines`, the one-line-per-kind list of 2026-09-24 that kept "1 wet · 1 dirty ·
   * 1 mixed" from being cut at the cost of a cell three lines taller than its neighbors.
   */
  noteParts?: readonly StatTableNotePart[];
  /**
   * THE FIGURE'S GLYPH, in a disc of its category tint, and the thing that turns the cell from a
   * centered column of type into a LED card: glyph top-left, then the label, the figure and its
   * note under it, all left-aligned (the owner's mockup of Today, 2026-09-19: "add icons to
   * today's module"). Cells without one keep the centered form Reports uses.
   */
  icon?: IconName;
  /**
   * Which way the note points, drawn as an arrow before it. `up` is the green the mockup drew;
   * `down` is the note's own gray, because a smaller number is a fact and not a fault (CLAUDE.md
   * §2 rule 6: nothing here may describe a problem).
   */
  trend?: 'up' | 'down';
  accessibilityLabel?: string;
}

export interface StatTableProps {
  cells: StatTableCell[];
  /**
   * THE SHORT FORM (the Today polish brief, 2026-09-20: "roughly 40% shorter"): no glyph disc, the
   * note held to one line. The label, the figure and its note are the cell; a cell is about the
   * value block and one line under it and nothing else. Today draws its three totals this way;
   * Reports keeps the full cell.
   */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function StatTable({ cells, compact = false, style, testID }: StatTableProps) {
  const t = useTheme();
  const scale = t.fontScale.chrome;
  const columns = statColumns(scale);
  const rows = statRows(cells, columns);
  /*
    THE TABLE MEASURES ITSELF, and the first frame guesses from the window: the Screen's own
    gutter either side (`space.xxl`), which is where Today draws it. The guess is what the first
    frame fits to, the measurement is what every frame after it fits to — the budget is measured,
    not remembered (QuickAction's lesson, docs/DESIGN_SYSTEM.md §23.2.1).
  */
  const { width: windowWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState(0);
  const tableWidth = measured > 0 ? measured : windowWidth - 2 * t.space.xxl;
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && Math.abs(w - measured) >= 0.5) setMeasured(w);
  };
  const smallFace = t.fontsReady ? { fontFamily: t.type.numeric.fontFamily } : null;
  // a diaper's drop and pile in their own inks, for the theme this table is painted in
  const glyphInks = diaperGlyphInks(t.color, t.theme);
  /*
    A FIGURE LINE AS TEXT: the digits in the figure's hue, the units and a length's letters small in
    the quiet ink (StepReadout's own drawing of a length), all inside the one Text a line is, so a
    shrink shrinks the whole line together.
  */
  const drawRuns = (
    runs: readonly StatRun[],
    ink: string,
    sizes: StatFigureSizes,
    fit: number,
  ): ReactNode[] =>
    runs.map((run, n) =>
      run.kind === 'big' ? (
        <Text key={n} style={{ color: ink }}>
          {run.text}
        </Text>
      ) : (
        <Text
          key={n}
          style={[
            smallFace,
            {
              // a gap is one space at the size that makes it the gap's width
              fontSize: (run.kind === 'gap' ? STAT_GAP_SIZE : sizes.small) * fit,
              letterSpacing: 0,
              color: t.color.text2,
            },
          ]}
        >
          {run.text}
        </Text>
      ),
    );
  /*
    A FIGURE LINE LED BY ITS MODULE'S PICTURE (`figureIcon`): the picture and the line side by side,
    centered as one and allowed into the padding by half the picture's room (`STAT_FIGURE_BLEED`), so
    the figure keeps the room it had. The picture keeps its size and is centered on the line,
    overhanging a line box lower than itself rather than growing it (`statFigureIconInset`); the line
    has already been fitted to what the picture leaves it (`statFigureRoom`), and gives further only
    as the insurance any line does. No label: a screen reader hears the cell's, which says which
    figure is which.
  */
  const pictured = (
    figureIcon: IconName | undefined,
    box: number,
    ink: string,
    line: ReactNode,
  ): ReactNode =>
    figureIcon === undefined ? (
      line
    ) : (
      <View
        style={[
          styles.pictured,
          { gap: STAT_FIGURE_ICON_GAP, marginHorizontal: -STAT_FIGURE_BLEED },
        ]}
      >
        <View style={{ marginVertical: statFigureIconInset(box, scale) }}>
          <Icon name={figureIcon} size={STAT_FIGURE_ICON} color={ink} />
        </View>
        {line}
      </View>
    );

  return (
    <View style={style} onLayout={onLayout}>
      <Surface
        radius="m"
        style={{ borderRadius: t.radius.m, overflow: 'hidden' }}
        {...(testID ? { testID } : {})}
      >
        {rows.map((row, r) => (
          <View
            key={r}
            style={[
              styles.row,
              {
                borderTopWidth: r === 0 ? 0 : StyleSheet.hairlineWidth,
                borderTopColor: t.color.line,
              },
            ]}
          >
            {row.map((c, i) => {
              const cat =
                c.tone === undefined || c.tone === 'neutral'
                  ? null
                  : categoryColors(t.color, c.tone);
              const alsoCat =
                c.also?.tone === undefined || c.also.tone === 'neutral'
                  ? null
                  : categoryColors(t.color, c.also.tone);
              // each figure's hue, which its digits wear (a picture keeps its own colors)
              const figureInk = cat?.fg ?? t.color.text;
              const secondInk = alsoCat?.fg ?? cat?.fg ?? t.color.text;
              // what this cell leaves its lines, and how far each line gives to stay one line
              const room = statCellRoom(tableWidth, row.length, columns);
              // the day's count beside the label, as a Quick tile's chip: none for none
              const badge = c.badge !== undefined && c.badge > 0 ? c.badge : undefined;
              const labelFit = statHeaderFit(room, c.label, badge, scale);
              // the exact figure, or its short form where the exact one would fall under the floor
              const { runs, fit: figureFit } = statFigureLine(c, room, scale);
              // a mixed-feeding day's minutes, on the line a note would take
              const second = c.also ? statSecondLine(c.also, room, scale) : null;
              const parts =
                c.noteParts && c.noteParts.length > 0
                  ? c.noteParts.map(p => ({ count: p.count, glyphs: p.icons.length }))
                  : null;
              // counts and glyphs are one line in either form; a sentence note is held to one line
              // only in the compact form, and the full cell still gives it two
              const noteFit = parts
                ? statFit(room, statPartsWidth(parts), scale)
                : compact && c.note
                  ? statFit(room, statNoteWidth(c.note, c.trend !== undefined), scale)
                  : 1;
              // a gap or a glyph is drawn at the size the text beside it is: the scale, then the fit
              const px = (n: number) => n * scale * noteFit;
              // every line keeps its box when it is drawn smaller, so the cells' lines stay level
              const label = (
                <Label
                  align="center"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={STAT_FIT_INSURANCE}
                  style={{
                    lineHeight: STAT_LINE.label,
                    ...(labelFit < 1
                      ? {
                          fontSize: STAT_TYPE.label * labelFit,
                          letterSpacing: STAT_TYPE.labelTracking * labelFit,
                        }
                      : {}),
                  }}
                >
                  {c.label}
                </Label>
              );
              return (
                <View
                  key={`${c.label}-${i}`}
                  accessible
                  accessibilityLabel={
                    c.accessibilityLabel ?? `${c.label}, ${c.value}${c.unit ? ` ${c.unit}` : ''}`
                  }
                  style={[
                    styles.cell,
                    {
                      paddingVertical: t.space.lg,
                      paddingHorizontal: statCellPad(columns),
                      gap: t.space.xs,
                      borderLeftWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                      borderLeftColor: t.color.line,
                    },
                  ]}
                  testID={testID ? `${testID}.${r * columns + i}` : undefined}
                >
                  {c.icon && !compact ? (
                    <View
                      style={[styles.disc, { backgroundColor: cat ? cat.soft : t.color.surface2 }]}
                    >
                      <Icon name={c.icon} size={20} color={cat ? cat.fg : t.color.text2} />
                    </View>
                  ) : null}
                  {badge === undefined ? (
                    label
                  ) : (
                    /* THE LABEL AND ITS COUNT, ONE LINE: centered as one, allowed a few points into
                       the cell's padding (`STAT_HEADER_BLEED`), and no taller than a label — the
                       chip overhangs the line above and below, as it overhangs a tile's corner. */
                    <View style={[styles.header, { marginHorizontal: -STAT_HEADER_BLEED }]}>
                      {label}
                      <View
                        style={[
                          styles.badge,
                          {
                            marginLeft: STAT_BADGE.gap,
                            // as tall, margins and all, as the label's line
                            marginVertical:
                              -(
                                (STAT_BADGE.line * labelFit - STAT_LINE.label) * scale +
                                2 * (STAT_BADGE.padV + STAT_BADGE.border)
                              ) / 2,
                            borderWidth: STAT_BADGE.border,
                            paddingHorizontal: STAT_BADGE.pad,
                            paddingVertical: STAT_BADGE.padV,
                            backgroundColor: t.color.surfaceSolid,
                            borderColor: t.color.line,
                            borderRadius: t.radius.s,
                          },
                        ]}
                      >
                        <Numeric
                          variant="meta"
                          ink="text"
                          numberOfLines={1}
                          style={{
                            fontSize: STAT_BADGE.size * labelFit,
                            lineHeight: STAT_BADGE.line * labelFit,
                            fontWeight: '700',
                          }}
                        >
                          {statBadgeText(badge)}
                        </Numeric>
                      </View>
                    </View>
                  )}
                  {/* ONE TEXT: the digits at the figure's size in their module's hue, the units
                      and a length's letters small in the quiet ink, so a shrink shrinks the whole
                      line together — led by its module's picture where the cell gives one. */}
                  {pictured(
                    c.figureIcon,
                    STAT_LINE.figure,
                    figureInk,
                    <Numeric
                      variant="statValue"
                      ink="text"
                      align="center"
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={STAT_FIT_INSURANCE}
                      style={[
                        { fontSize: STAT_TYPE.figure * figureFit, lineHeight: STAT_LINE.figure },
                        c.figureIcon ? styles.besidePicture : null,
                      ]}
                    >
                      {drawRuns(runs, figureInk, STAT_FIGURE_SIZES, figureFit)}
                    </Numeric>,
                  )}
                  {second
                    ? pictured(
                        c.also?.figureIcon,
                        STAT_SECOND_LINE,
                        secondInk,
                        <Numeric
                          variant="statValue"
                          ink="text"
                          align="center"
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={STAT_FIT_INSURANCE}
                          style={[
                            {
                              fontSize: STAT_SECOND_SIZES.big * second.fit,
                              lineHeight: STAT_SECOND_LINE,
                            },
                            c.also?.figureIcon ? styles.besidePicture : null,
                          ]}
                        >
                          {drawRuns(second.runs, secondInk, STAT_SECOND_SIZES, second.fit)}
                        </Numeric>,
                      )
                    : null}
                  {parts && c.noteParts ? (
                    <View style={[styles.parts, { gap: px(STAT_PART_GAP) }]}>
                      {c.noteParts.map((p, n) => (
                        <View key={n} style={[styles.part, { gap: px(STAT_GLYPH_GAP) }]}>
                          <Numeric
                            variant="meta"
                            ink="text2"
                            numberOfLines={1}
                            style={{
                              fontSize: STAT_TYPE.note * noteFit,
                              lineHeight: STAT_LINE.note,
                            }}
                          >
                            {p.count}
                          </Numeric>
                          {/* a part's glyphs TOUCH: each after the first is pulled back over the
                              one before it (`STAT_PAIR_GAP` is negative), so a mixed diaper's
                              pile and drop are one mark */}
                          <View style={styles.part}>
                            {p.icons.map((name, g) => (
                              <View
                                key={`${name}-${g}`}
                                style={g === 0 ? null : { marginLeft: px(STAT_PAIR_GAP) }}
                              >
                                <Icon
                                  name={name}
                                  size={px(STAT_GLYPH)}
                                  color={diaperGlyphInk(glyphInks, name) ?? t.color.text2}
                                />
                              </View>
                            ))}
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : c.note ? (
                    <View style={[styles.noteRow, { gap: t.space.xs }]}>
                      {c.trend ? (
                        <Icon
                          name={c.trend === 'up' ? 'arrowUp' : 'arrowDown'}
                          size={14}
                          color={c.trend === 'up' ? t.color.good : t.color.text2}
                        />
                      ) : null}
                      <AppText
                        variant="meta"
                        ink="text2"
                        align="center"
                        numberOfLines={compact ? 1 : 2}
                        {...(compact
                          ? { adjustsFontSizeToFit: true, minimumFontScale: STAT_FIT_INSURANCE }
                          : {})}
                        style={[
                          styles.noteText,
                          { lineHeight: STAT_LINE.note },
                          noteFit < 1 ? { fontSize: STAT_TYPE.note * noteFit } : null,
                        ]}
                      >
                        {c.note}
                      </AppText>
                    </View>
                  ) : null}
                </View>
              );
            })}
            {/* the odd cell takes the whole row: a table with a hole in the corner reads as a bug */}
          </View>
        ))}
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'stretch' },
  /**
   * CENTERED, EVERY CELL, glyph included: three short columns read as a block rather than as a
   * ledger to scan down, and a glyph is one more thing to line up on the same axis.
   *
   * The glyph arrived left-aligned, on the reading that a disc over left-hung type is how a
   * dashboard tile is built. On a three-column table it is not: the cells are a thumb wide, so
   * "left" and "center" are a few points apart and the eye reads the difference as a mistake
   * rather than as an alignment (the owner, 2026-09-19: "today new table feels off, because it
   * is not middle centered").
   *
   * CENTERED ACROSS, TOP-ALIGNED DOWN (2026-09-24). Centering down as well kept every cell's
   * block in the middle of the row, which was invisible while every cell was one note tall; the
   * diaper kinds as a list made one cell taller, and centered blocks dropped Milk's and Sleep's
   * labels below Diapers'. The list is one line again (2026-09-26), and the rule stays: from the
   * top, the labels share a line and so do the figures, whatever hangs under any of them.
   */
  cell: { flex: 1, justifyContent: 'flex-start', alignItems: 'center' },
  disc: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  /** The label and its count: one centered line across the cell and its bleed. */
  header: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** QuickAction's `chip`, in the flow of the header rather than a tile's corner. */
  badge: { flexShrink: 0 },
  /** A figure and its picture: one centered line across the cell and its bleed. */
  pictured: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * The figure beside its picture may be narrowed by the row, never the picture: where the bound was
   * short (a face that has not loaded yet), the line's box is what the insurance shrinks it into.
   */
  besidePicture: { flexShrink: 1 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
  noteText: { flexShrink: 1 },
  /** Counts and glyphs on one line, never wrapped: `statFit` has made room for all of them. */
  parts: { flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center' },
  part: { flexDirection: 'row', alignItems: 'center' },
});
