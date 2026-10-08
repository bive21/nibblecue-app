/**
 * About (docs/BRANDING.md §2 "About sheet"; the prototype's `SHEETS.about`): the legal and
 * support home — the wordmark, the tagline, the version, terms, privacy, licenses, contact,
 * and who is behind the listing. Every name, URL and address is read from the brand package;
 * nothing here is typed. The developer display name is the trading name on the "by" line;
 * the registered company (`BRAND.legalEntity`, decided 2026-09-21 when the state approved it)
 * is the legal line under it, because About is the legal home (BRANDING.md §2). Licenses are
 * not in this build yet and the row says exactly that, disabled, rather than promising a date.
 *
 * OWNER DECISION PENDING — the "On the store" card does NOT carry the store title. The
 * prototype's About override and the WP3 brief both render `BRAND.storeTitle` here, but
 * CLAUDE.md §7 and BRANDING.md §2 rule 1 say the full store title never appears inside the
 * app, and `store-listing.json`'s in-app note repeats it. When a brief and the standing rule
 * disagree, the rule wins until the owner amends it: the card keeps the subtitle and the
 * developer line (BRANDING.md §0 allows the developer name on About), and restoring the title
 * is a one-line change once §7 is amended. The subtitle's own table row reads "App Store
 * only"; it is kept because the brief and the prototype both ask for it and the reviewer did
 * not, but it is the same class of question and is listed for the owner alongside the title.
 *
 * THE WORDMARK HIDES THE CREDITS (the owner, 2026-09-25, of the "that's cool" list: *"might not
 * necessarily be useful, but it's cool … Let's try doing everything"*). Seven taps on it, each
 * within two seconds of the last (`countTap`), open a night sky of slowly drifting stars with the
 * name, who made it and a line of thanks (`StarfieldCredits`); a tap anywhere or Back closes it.
 * From the fourth tap each one is felt as a light tick — the only sign there is anything to find —
 * and the seventh as the arrival. The names are read from the brand package here, on the one
 * surface allowed to name the developer (BRANDING.md §0), and handed down; nothing is typed.
 * The wordmark stays an image to a screen reader, named as it always was; seven double taps on it
 * open the same page, which then reads out as one button whose name is the credits.
 *
 * WHO MADE IT, IN FULL, HERE AND NOWHERE ELSE (the owner, 2026-09-27: two new parents of 2026 who
 * built what helped them; Dad develops, Mom designs and drew the pictures, the baby approves; Plus
 * keeps the servers, the replies and the next update going). The sign-up page only hints at it and
 * the More footer carries one line; About is where a curious parent goes, so the whole story sits
 * right under the version (docs/BRANDING.md §2c). Every word is read from the brand strings.
 */
import { BRAND, IN_APP_STRINGS, TAGLINE } from '@nibblecue/brand';
import {
  Body,
  BodySm,
  BodyStrong,
  BottomSheet,
  Card,
  countTap,
  haptic,
  Label,
  Meta,
  Numeric,
  Row,
  Rows,
  StarfieldCredits,
  tapFeel,
  useTheme,
  type TapRun,
} from '@nibblecue/ui';
import Constants from 'expo-constants';
import { useRef, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WORDMARK_ASPECT, WORDMARK_SOURCE } from '../brand/assets';
import { runningUpdate } from '../app/updates';

export interface AboutSheetProps {
  visible: boolean;
  onClose: () => void;
}

const WORDMARK_HEIGHT = 28;

/** The credits' line of thanks: to the parent, for the company — never about the baby. */
const THANKS = 'Thank you for letting us keep you company, day and night.';

export function AboutSheet({ visible, onClose }: AboutSheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const version = Constants.expoConfig?.version ?? '0.0.0';
  // the hidden credits: the run of taps so far, and whether the sky is open
  const taps = useRef<TapRun | null>(null);
  const [stars, setStars] = useState(false);
  const onWordmark = () => {
    const tap = countTap(taps.current, Date.now());
    taps.current = tap.run;
    const feel = tapFeel(tap);
    if (feel !== null) haptic(feel);
    if (tap.fired) setStars(true);
  };
  /* WHICH UPDATE, when the phone runs one rather than what it was installed with (docs/RELEASES.md
     §4). A binary carries one version for its whole life and its updates arrive under it, so the
     version alone cannot say which fix a phone has; the update's own id and date can. */
  const update = runningUpdate();

  return (
    <BottomSheet
      visible={visible}
      title={IN_APP_STRINGS.aboutTitle}
      onClose={onClose}
      bottomInset={insets.bottom}
      testID="about"
    >
      <View style={{ gap: t.space.lg }}>
        <View style={[styles.center, { gap: t.space.sm, paddingVertical: t.space.lg }]}>
          {/* still an image to a screen reader, named as it was; the press is the hidden door */}
          <Pressable
            accessibilityRole="image"
            accessibilityLabel={BRAND.appDisplayName}
            onPress={onWordmark}
            hitSlop={Math.ceil((t.hit.min - WORDMARK_HEIGHT) / 2)}
            testID="about.egg"
          >
            <Image
              source={WORDMARK_SOURCE}
              style={{ height: WORDMARK_HEIGHT, width: WORDMARK_HEIGHT * WORDMARK_ASPECT }}
              resizeMode="contain"
              testID="about.wordmark"
            />
          </Pressable>
          <BodySm align="center">{TAGLINE}</BodySm>
          <Meta align="center">
            Version{' '}
            <Numeric variant="meta" ink="text2" testID="about.version">
              {version}
            </Numeric>
          </Meta>
          {update !== null ? (
            <Meta align="center" testID="about.update">
              Update{' '}
              <Numeric variant="meta" ink="text2">
                {update.id.slice(0, 8)}
              </Numeric>
              {update.createdAt !== null
                ? ` · ${update.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                : ''}
            </Meta>
          ) : null}
        </View>

        <Card testID="about.story">
          <View style={{ gap: t.space.sm }}>
            <Label>{IN_APP_STRINGS.aboutStoryTitle}</Label>
            <Body>{IN_APP_STRINGS.aboutStory}</Body>
            <BodyStrong testID="about.family">{IN_APP_STRINGS.familyLine}</BodyStrong>
            <BodySm>{IN_APP_STRINGS.aboutArt}</BodySm>
            <BodySm>{IN_APP_STRINGS.aboutPlus}</BodySm>
          </View>
        </Card>

        <Rows>
          <Row
            title="Terms of Use"
            onPress={() => void Linking.openURL(BRAND.termsUrl)}
            testID="about.terms"
          />
          <Row
            title="Privacy policy"
            onPress={() => void Linking.openURL(BRAND.privacyPolicyUrl)}
            testID="about.privacy"
          />
          <Row
            title="Open-source licenses"
            detail="Not in this build yet"
            disabled
            right="none"
            testID="about.licenses"
          />
          <Row
            title="Contact the team"
            detail={IN_APP_STRINGS.contactNote}
            value={BRAND.supportEmail}
            onPress={() => void Linking.openURL(`mailto:${BRAND.supportEmail}`)}
            testID="about.contact"
          />
        </Rows>

        <Card testID="about.store">
          <View style={{ gap: t.space.xs }}>
            <Label>On the store</Label>
            <BodyStrong>{BRAND.appleSubtitle}</BodyStrong>
            <Meta style={{ marginTop: t.space.xs }}>{`Developed by ${BRAND.developerName}`}</Meta>
            <Meta testID="about.legal">{`© ${BRAND.legalEntity}`}</Meta>
          </View>
        </Card>

        <BodySm>
          {`${BRAND.appDisplayName} keeps your family's record for you and sells nothing about it: no ads, no data brokers, and a download of everything you logged on every plan.`}
        </BodySm>
      </View>
      {/* a Modal of its own, opened from inside this sheet's, as the time picker's is */}
      <StarfieldCredits
        visible={stars}
        onClose={() => setStars(false)}
        title={BRAND.appDisplayName}
        lines={[`Made by ${BRAND.developerName}`, IN_APP_STRINGS.familyLine, THANKS]}
        hint="Tap anywhere to close"
        accessibilityHint="Double tap to close"
        testID="about.stars"
      />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
