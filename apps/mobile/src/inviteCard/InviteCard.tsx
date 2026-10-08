/**
 * LOG TOGETHER, AS ONE CARD IN TODAY'S BANNER SLOT (docs/SHARED_CARE.md §6, docs/IN_APP_MESSAGES.md
 * §1): the slot's last card, drawn only when nothing above it did.
 *
 * THE CATCH-UP CARD'S SHAPE, KEPT TO THE SLOT'S BUDGET (`screens/today/layout.ts`
 * `INVITE_CARD_MAX_HEIGHT`, no taller than the welcome card the fold is measured with): a one-line
 * title, three lines of small type, and one line of three text links, each of which reaches the
 * 44 pt target through its hit slop, as the welcome and catch-up cards' links do.
 *
 * THREE ANSWERS OF EQUAL WEIGHT. *Invite* is not a filled button beside two faint links: the card
 * asks a question about a family, and a nudge toward one answer would be the pressure the app never
 * puts on a parent. *Not now* and *Just me* are the card's dismissal, so there is no X to guess at:
 * which of the two an X meant is exactly what a parent should not have to wonder.
 *
 * A CARD, NEVER A MODAL. Nothing is over the FAB or the Quick row, and a bottle can be logged
 * without touching it.
 */
import { BodySm, Card, H2, useTheme } from '@nibblecue/ui';
import { Pressable, StyleSheet, View } from 'react-native';
import { INVITE_CARD_COPY } from './copy';

export interface InviteCardProps {
  onInvite: () => void;
  onNotNow: () => void;
  onJustMe: () => void;
}

export function InviteCard({ onInvite, onNotNow, onJustMe }: InviteCardProps) {
  const t = useTheme();
  // a 19 px text link reaches the 44 pt target through its hit slop, as the welcome card's do
  const slop = Math.ceil((t.hit.min - t.type.bodySm.lineHeight) / 2);
  const link = (label: string, hint: string, onPress: () => void, testID: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      hitSlop={slop}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      testID={testID}
    >
      <BodySm ink="accent2" style={styles.link} numberOfLines={1}>
        {label}
      </BodySm>
    </Pressable>
  );
  return (
    <Card tint={t.color.accentSoft} testID="today.invite_card">
      <View style={{ gap: t.space.sm }}>
        <H2 numberOfLines={1}>{INVITE_CARD_COPY.title}</H2>
        <BodySm ink="text" numberOfLines={3}>
          {INVITE_CARD_COPY.body}
        </BodySm>
        {/* the links sit a slop apart (xxxl is twice it), so no two targets overlap */}
        <View style={[styles.links, { gap: t.space.xxxl }]}>
          {link(
            INVITE_CARD_COPY.invite,
            INVITE_CARD_COPY.inviteHint,
            onInvite,
            'today.invite_card.invite',
          )}
          {link(
            INVITE_CARD_COPY.notNow,
            INVITE_CARD_COPY.notNowHint,
            onNotNow,
            'today.invite_card.not_now',
          )}
          {link(
            INVITE_CARD_COPY.justMe,
            INVITE_CARD_COPY.justMeHint,
            onJustMe,
            'today.invite_card.just_me',
          )}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  links: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  link: { fontWeight: '700' },
});
