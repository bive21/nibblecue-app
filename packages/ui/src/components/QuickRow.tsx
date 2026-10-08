/**
 * The Quick row in the household's shape (docs/DESIGN_SYSTEM.md §16; docs/PRODUCT_SPEC.md §3.4).
 *
 * TWO LAYOUTS, AND THE SHAPE PICKS ONE. A bubble or a pebble is a small tile, so a row of them
 * SLIDES: three fit the width and the rest are further along (`tileWidth` says why the peek is
 * the affordance). A CAPSULE IS A WIDE BAR — two across and already most of the screen — so it
 * never slides; it wraps, left column and right column, and every tile the household chose is
 * on the page at once (the owner, 2026-09-16: "for capsule shape design, it should not be a
 * slider. only for capsule you can show everything you selected that comes in 2 columns (left
 * and right)"). A slider of full-width bars hides most of the row behind a swipe for no gain,
 * which is the complaint; wrapping costs a taller section and shows the lot.
 *
 * `cards` was a third layout — a fixed 136 pt grid three across with spacer cells — and it is
 * gone with the shape (QuickAction.tsx records why).
 */
import { Children, cloneElement, isValidElement, useState, type ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import type { QuickShape } from '../theme/appearance';
import { useTheme } from '../theme/ThemeProvider';
import {
  QUICK_BUBBLE_GRID_PAD,
  QUICK_GRID_PAD,
  QuickAction,
  type QuickActionProps,
} from './QuickAction';
import { tileStride, tileWidth } from './quickScale';

/**
 * The screen gutter this row assumes for its FIRST frame only, before `onLayout` reports the
 * real width (`Screen.tsx` pads `space.xxl` each side). Getting it wrong costs nothing but a
 * tile a pixel or two off on one frame; measuring is what the tiles actually use.
 */
const ASSUMED_GUTTER = 18;

/**
 * The room a tile's shadow needs on every side of the scrolling row.
 *
 * A ScrollView clips its content to its own bounds. A tile's shadow is drawn OUTSIDE the tile,
 * so with the tiles flush to those bounds every shadow was sheared off square — which is what
 * a dark band under a row of cards actually is (`shadows.ts` records the class). Twelve is the
 * QuickAction card's own shadow radius rounded up; the scroller takes it back with a negative
 * margin so nothing moves on the screen.
 */
export const QUICK_ROW_SHADOW_ROOM = 12;
const SHADOW_ROOM = QUICK_ROW_SHADOW_ROOM;

export interface QuickRowProps {
  /** Either `items` or `children` (QuickAction elements). */
  items?: QuickActionProps[];
  children?: ReactNode;
  /** Overrides the household's shape. */
  shape?: QuickShape;
  /** Pebble only: 3 on Today, 4 in the Quick Log sheet. */
  columns?: 3 | 4;
  /**
   * THE ROW SCROLLS SIDEWAYS instead of wrapping (the owner, 2026-09-16: "the log needs redesign
   * since it's very inconvenient, make it into a horizontal slider instead"). Opt-in, because it
   * only makes sense where the tiles are one row of a longer screen: the appearance preview
   * draws four to show a shape, and the Quick Log sheet is a grid you already scroll down.
   */
  scroll?: boolean;
  /**
   * WHAT TO PUT ROUND EACH TILE, and the reason this is a render prop rather than a flag: the
   * first-run tour outlines the tiles one by one and its `<TourSpot>` lives in the app, which
   * `packages/ui` may not import (docs/ARCHITECTURE.md — the design system knows nothing about
   * the product's features). The row knows where a tile begins and ends; the caller knows what
   * that is worth wrapping in.
   *
   * It is applied INSIDE the cell the row lays out, so a wrapper cannot change the grid.
   */
  wrap?: (tile: ReactNode, index: number) => ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function QuickRow({
  items,
  children,
  shape,
  columns,
  scroll = false,
  wrap,
  style,
  testID,
}: QuickRowProps) {
  const t = useTheme();
  const win = useWindowDimensions();
  const resolvedShape: QuickShape = shape ?? t.shape;
  /**
   * THE ROW'S OWN WIDTH, measured rather than derived. The tiles are sized so exactly `cols` of
   * them fit it, which is what keeps a scrolling row looking like the grid it replaced — and the
   * gutter between the screen's edge and this row belongs to the screen, not to us. Until the
   * first layout, the window less a typical gutter is close enough that no tile jumps visibly.
   */
  const [rowWidth, setRowWidth] = useState(0);
  const onRowLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (Math.abs(w - rowWidth) > 0.5) setRowWidth(w);
  };
  // the row's override reaches the children form too — otherwise the container lays out for
  // one shape (the Quick Log sheet's grid) while each child renders the household's
  const kids = items
    ? items.map((it, i) => (
        <QuickAction key={`${it.moduleId}-${i}`} {...it} {...(shape ? { shape } : {})} />
      ))
    : Children.toArray(children).map(k =>
        shape &&
        isValidElement<QuickActionProps>(k) &&
        k.type === QuickAction &&
        k.props.shape === undefined
          ? cloneElement(k, { shape })
          : k,
      );

  // A CAPSULE NEVER SLIDES — see the header. Two wide bars already fill the row.
  const wraps = resolvedShape === 'capsule';
  const gridCols = resolvedShape === 'bubble' ? 4 : wraps ? 2 : (columns ?? 3);
  // a bubble gives its gutter to its disc: four discs across a phone have nothing to spare
  const gridPad = resolvedShape === 'bubble' ? QUICK_BUBBLE_GRID_PAD : QUICK_GRID_PAD;

  /**
   * THE SLIDER, for the two small shapes — `cols` tiles fit the row exactly, so the first
   * screen is the grid it has always been and the rest is further along.
   *
   * `snapToInterval` is what makes it a row of tiles rather than a strip of pixels: a swipe
   * lands on a tile, never half of one.
   */
  if (scroll && !wraps) {
    const gap = 2 * gridPad;
    const width = rowWidth > 0 ? rowWidth : Math.max(0, win.width - 2 * ASSUMED_GUTTER);
    const tile = tileWidth(width, gridCols, gap);
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={tileStride(width, gridCols, gap)}
        snapToAlignment="start"
        decelerationRate="fast"
        onLayout={onRowLayout}
        accessibilityRole="list"
        contentContainerStyle={{
          gap,
          // EVERY TILE THE SAME HEIGHT: the row is as tall as its tallest tile and the rest
          // stretch to it, so More and a module with nothing logged yet are not short boxes
          alignItems: 'stretch',
          // ROOM FOR THE SHADOWS. A ScrollView clips to its bounds, and a tile's shadow — an
          // Android `elevation`, drawn from a rectangular outline — was being cut at the edge
          // into a dark band under the row (the owner, 2026-09-16: "there is a different color
          // (darker) to the background"). The gutters below give every shadow somewhere to
          // fall, and the negative margin on the scroller itself keeps the first tile on the
          // content column's edge rather than indented by them.
          paddingTop: SHADOW_ROOM,
          paddingBottom: SHADOW_ROOM,
          paddingHorizontal: SHADOW_ROOM,
        }}
        style={[styles.scroller, { marginHorizontal: -SHADOW_ROOM }, style]}
        {...(testID ? { testID } : {})}
      >
        {kids.map((k, i) => (
          <View key={i} style={[styles.tile, tile > 0 ? { width: tile } : null]}>
            {wrap ? wrap(k, i) : k}
          </View>
        ))}
      </ScrollView>
    );
  }

  const cols = gridCols;
  const pad = gridPad;

  return (
    <View
      style={[styles.grid, { marginHorizontal: -pad }, style]}
      accessibilityRole="list"
      {...(testID ? { testID } : {})}
    >
      {kids.map((k, i) => (
        <View key={i} style={{ width: `${100 / cols}%`, padding: pad }}>
          {wrap ? wrap(k, i) : k}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch' },
  // the scroller draws nothing of its own: whatever is behind the page shows through the gaps
  scroller: { backgroundColor: 'transparent', overflow: 'visible' },
  tile: { alignSelf: 'stretch' },
});
