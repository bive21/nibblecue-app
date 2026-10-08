/**
 * THE FIRST MORNING SOMEWHERE ELSE — the card Today shows once a trip, the first time this phone's
 * clock reads differently from home's (the owner, 2026-09-23: "use the phone's time zone while
 * traveling").
 *
 * Every time on the phone has just moved, and a parent who did not expect it would reasonably
 * wonder whether their log moved with it. So the card names the clock now in use and says the one
 * reassuring thing, and it offers the one way back — keeping home time, for a parent away from a
 * baby who stayed home. It is the welcome card's shape and size (`screens/today/layout.ts` budgets
 * the banner slot for exactly one of them): a title beside the dismiss, one body line, one link.
 * It never comes back on the same trip; More's "Time zone" row is where the choice lives after.
 */
import { BodySm, Card, H2, IconButton, useTheme } from '@nibblecue/ui';
import { Pressable, StyleSheet, View } from 'react-native';
import { useToast } from '../ui/toast';
import { ZONE_COPY } from './copy';
import type { ZonesView } from './useZone';

export function TravelCard({ zones }: { zones: ZonesView }) {
  const t = useTheme();
  const toast = useToast();
  const home = zones.home;
  if (!zones.showNotice || home === null) return null;
  // a 19 px text link reaches the 44 pt target through its hit slop, as the welcome card's do
  const slop = Math.ceil((t.hit.min - t.type.bodySm.lineHeight) / 2);
  const keepHome = () => {
    zones.setKeepHome(true);
    toast.show(ZONE_COPY.keptToast(home), { undo: () => zones.setKeepHome(false) });
  };
  return (
    <Card tint={t.color.accentSoft} testID="today.travel_card">
      <View style={{ gap: t.space.sm }}>
        <View style={[styles.titleRow, { gap: t.space.md }]}>
          <H2 style={styles.title}>{ZONE_COPY.cardTitle(zones.device)}</H2>
          <IconButton
            icon="x"
            accessibilityLabel={ZONE_COPY.dismiss}
            onPress={zones.dismissNotice}
            testID="today.travel_card.dismiss"
          />
        </View>
        <BodySm>{ZONE_COPY.cardBody}</BodySm>
        <View style={[styles.links, { marginTop: -t.space.xs }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ZONE_COPY.keepHome(home)}
            onPress={keepHome}
            hitSlop={slop}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            testID="today.travel_card.keep_home"
          >
            <BodySm ink="accent2" style={styles.link}>
              {ZONE_COPY.keepHome(home)}
            </BodySm>
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { flex: 1, minWidth: 0 },
  links: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  link: { fontWeight: '700' },
});
