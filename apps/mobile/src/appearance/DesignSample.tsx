/**
 * WHAT A DESIGN TILE SHOWS (the owner, 2026-09-25: *"separate it into 2 sections options, left and
 * right; and then has a 'preview' of what it is"*): a card holding the first three of the
 * household's own Quick tiles, on the app's ground. It is rendered inside `SkinTile`, which draws it
 * in the tile's own design and scales it into the tile's window, so everything here is laid out at
 * a phone's size in `SKIN_TILE.sample` and reads its tokens through the tile's provider.
 *
 * WHY A CARD WITH TILES IN IT. A design is a MATERIAL — what a panel is made of, how round, how it
 * lifts off the page (skins.ts) — and the app has two kinds of panel: the plain card that every
 * list, row group and summary sits in, and the tinted tile a module is logged from. A card holding
 * tiles shows both in one small block: on Glass a frosted panel with tinted glass in it, floating
 * over the soft orbs of the lit ground; on Paper a flat white card, hairline-ruled, with flat tinted
 * tiles and nothing behind them. They are the real `Card` and the real `QuickAction`, made by the
 * same `Surface` every card in the app is made by — which is also what makes the Glass picture on
 * an Android phone the no-blur material that phone really paints (Surface.tsx says why), and its
 * pebbles the Log tile's liquid glass there (2026-10-01, ui's theme/tileGlass.ts) with nothing to
 * keep in step by hand.
 *
 * THE TILES ARE ALWAYS PEBBLES, whatever shape the household chose. The pebble is the one shape
 * whose tile is a panel of the design's material from edge to edge — a bubble's disc is opaque in
 * every design, and a capsule is a pill two to a row — and the tile is here to show the material,
 * not the shape; the pinned preview at the top of the sheet shows the household's own shape.
 *
 * THEY ARE THE HOUSEHOLD'S OWN MODULES, in the pinned preview's order (`quickRow`, first three),
 * with no times and no counts on them: a picture of a look must not carry numbers a parent could
 * read as their baby's. Before the household's module rows arrive, the registry's defaults stand in,
 * as they do for the preview.
 *
 * NO DOODLES. The app's own pages carry the doodle pattern over their ground, but it is the same on
 * both designs — it would be the one thing in the two pictures that says nothing about the choice —
 * and at this scale it is noise; `SkinTile` draws the design's own ground (Glass's washes and orbs,
 * nothing on Paper), which is the half of the ground a design decides.
 *
 * INERT, like the preview it stands beside: nothing in it takes a touch or a screen reader's focus
 * (the tile is the one control), and every handler in it does nothing on purpose.
 */
import { MODULE_BY_ID, MODULES, quickRow } from '@nibblecue/core';
import { Card, MODULE_ICON, QuickAction, useTheme } from '@nibblecue/ui';
import { StyleSheet, View } from 'react-native';
import { useAuth } from '../auth/AuthContext';

/** How many Quick tiles the card holds: three across fill a phone-width card, as they do on Today. */
export const DESIGN_SAMPLE_TILES = 3;

const noop = () => undefined;

export function DesignSample() {
  // the TILE's theme: this renders inside SkinTile's provider, in the tile's own design
  const t = useTheme();
  const { account } = useAuth();
  const household = account?.memberships[0];
  const enabled = (account?.modules ?? [])
    .filter(m => m.household_id === household?.household_id && m.enabled)
    .map(m => m.module_id);
  const source =
    enabled.length > 0 ? enabled : MODULES.filter(m => m.defaultEnabled).map(m => m.id);
  const ids = quickRow(source).slice(0, DESIGN_SAMPLE_TILES);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.center, { paddingHorizontal: t.space.xxl }]}
    >
      <Card>
        <View style={[styles.row, { gap: t.space.sm }]}>
          {ids.map(id => (
            <View key={id} style={styles.cell}>
              <QuickAction
                moduleId={id}
                label={MODULE_BY_ID[id].label}
                icon={MODULE_ICON[MODULE_BY_ID[id].icon] ?? 'note'}
                onPress={noop}
                shape="pebble"
              />
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center' },
  row: { flexDirection: 'row' },
  cell: { flex: 1 },
});
