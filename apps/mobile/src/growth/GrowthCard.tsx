/**
 * THE GROWTH PROMPT, AS ONE CARD IN THE BANNER SLOT (docs/GROWTH_PROMPTS.md §1).
 *
 * The same slot, the same look and the same one-card rule as every other message on Today. It is
 * a CARD and never a modal: nothing is over the FAB, nothing is over the Quick row, and nothing
 * has to be dismissed before a bottle can be logged. Dismissing is one tap at the full row
 * width, which is comfortably past 44 dp.
 *
 * THERE IS NO REVIEW CARD (§2.3, since 2026-09-28). The rating ask is the platform's own prompt,
 * asked by `useGrowthPrompt` straight after a good moment, because both stores forbid what a card
 * would be: a question before their prompt, and a button that calls it.
 *
 * THE CROSS-PROMOTION CARD CANNOT RENDER WITHOUT A CAMPAIGN. Its name, its line and its store
 * links are campaign fields; with none published the whole branch returns null, which is the
 * shipped state today (§3.3, "the mechanism ships, the campaign does not").
 */
import { BRAND } from '@nibblecue/brand';
import { BodySm, BodyStrong, Button, Card, IconButton, Meta, useTheme } from '@nibblecue/ui';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { GROWTH_COPY } from './copy';
import type { GrowthPromptView } from './useGrowthPrompt';

export interface GrowthCardProps {
  prompt: GrowthPromptView;
}

/**
 * WHETHER THE CARD BELOW DRAWS ANYTHING: the cross-promotion, with a campaign, and nothing else.
 * `GrowthPromptSlot` asks it too, to hand the slot on to the card after this one (Log together)
 * only when this one is empty, so the two can never stand in the slot together.
 */
export const growthCardDraws = (prompt: GrowthPromptView): boolean =>
  prompt.kind === 'PROMO' && prompt.campaign !== null;

export function GrowthCard({ prompt }: GrowthCardProps) {
  const t = useTheme();
  if (!growthCardDraws(prompt)) return null;

  if (prompt.kind === 'PROMO') {
    const campaign = prompt.campaign;
    if (campaign === null) return null; // inert without one, by construction
    const url = Platform.OS === 'ios' ? campaign.appStoreUrl : campaign.playStoreUrl;
    return (
      <Card testID="growth.promo">
        <View style={{ gap: t.space.sm }}>
          <View style={[styles.head, { gap: t.space.sm }]}>
            {/* labelled, so it reads as the maker rather than as an advertisement */}
            <Meta>{GROWTH_COPY.promo.from(BRAND.developerName)}</Meta>
            <IconButton
              icon="x"
              accessibilityLabel={GROWTH_COPY.promo.dismiss}
              onPress={() => prompt.resolve('DISMISS')}
              testID="growth.promo.dismiss"
            />
          </View>
          <BodyStrong>{campaign.appName}</BodyStrong>
          <BodySm ink="text2">{campaign.line}</BodySm>
          {url === null ? null : (
            <Button
              label={
                Platform.OS === 'ios' ? GROWTH_COPY.promo.seeIos : GROWTH_COPY.promo.seeAndroid
              }
              variant="secondary"
              onPress={() => {
                prompt.resolve('ACCEPT');
                // OUT of the app: nothing is installed, purchased or deep-linked from in here
                void Linking.openURL(url);
              }}
              testID="growth.promo.open"
            />
          )}
        </View>
      </Card>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
