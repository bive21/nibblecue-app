/**
 * SyncChip (docs/DESIGN_SYSTEM.md §14, §12 rules 6 and 7, docs/BRANDING.md §2b): the sync state
 * in the top bar. It is a STATUS, not a button (§14) — it opens nothing, and the thing that IS
 * tappable is WP4.9's banner, which is where a failure gets a sentence and a way in. It "said
 * SYNCED 99% of the time and therefore said nothing", so it appears only when there is something
 * to report: syncing, offline, entries queued, or a sync error. The caller hides it for `ok`;
 * this renders null for `ok` too, so a state passed through cannot paint a chip that says nothing.
 *
 * The regular bold face at the badge's size (mono until the schedule handoff of 2026-09-19 asked
 * for the regular font on every status word) on a pill with a 1px border: offline is `text2` on
 * `surface2`, syncing the accent ink on the accent tint, queued the warn ink on the amber tint,
 * error the crit ink on the rose tint — the pairs badge-tone.ts measures, because a chip with a
 * NUMBER in it needs 4.5:1, not the 3:1 a glyph gets (§12 rule 6). The border takes the ink so
 * the state has an edge even where the tint is faint. Status is never color alone: each state
 * carries its word (./sync-chip-copy.ts), and the accessible name says it in a sentence a screen
 * reader can read at 3 a.m. — the count of queued entries is a count, so it is `Numeric`.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { CHROME_FONT_SCALE_CAP, useTheme } from '../theme/ThemeProvider';
import { Icon } from '../icons/Icon';
import { badgeColors, type BadgeTone } from './badge-tone';
import { syncChipLabel, syncChipText, type SyncState } from './sync-chip-copy';
import { AppText } from './Text';

export { syncChipLabel, syncChipText, type SyncState };

export interface SyncChipProps {
  state: SyncState;
  /** Entries waiting to sync; shown for `queued`. */
  count?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** The tone each state borrows from badge-tone.ts, which is where the pairs are measured. */
const TONE: Record<Exclude<SyncState, 'ok'>, BadgeTone> = {
  syncing: 'accent',
  offline: 'neutral',
  queued: 'warn',
  error: 'crit',
};

export function SyncChip({ state, count, style, testID }: SyncChipProps) {
  const t = useTheme();
  if (state === 'ok') return null;
  const { fill, ink } = badgeColors(t.color, TONE[state]);
  const border = state === 'offline' ? t.color.line2 : ink;
  return (
    <View
      accessible
      accessibilityLabel={syncChipLabel(state, count)}
      accessibilityLiveRegion="polite"
      style={[
        styles.pill,
        {
          gap: t.space.xs,
          backgroundColor: fill,
          borderColor: border,
          borderRadius: t.radius.pill,
          paddingHorizontal: t.space.lg,
          paddingVertical: t.space.xs,
          minHeight: 32,
        },
        style,
      ]}
      {...(testID ? { testID } : {})}
    >
      {/*
        AN ALERT MARK ON THE ONE STATE THAT NEEDS AN EYE (the owner, 2026-09-19). The others are
        weather — syncing, offline, queued all pass on their own — and this one is the only one
        a parent can act on, so it is the only one that gets a glyph. Decorative: the chip's own
        accessible name is a sentence and already says it (§12 rule 7 — never color alone, and
        never a glyph alone either).
      */}
      {state === 'error' ? <Icon name="flag" size={12} color={ink} /> : null}
      {/* THE REGULAR FACE, NOT MONO (the schedule handoff, 2026-09-19: "anything currently
          monospace … switches to the app's regular font with letter-spacing"). The bar is
          shared, so every screen's chip changes with it; the word is the `bodyStrong` role at
          the badge's size with a little tracking, and the pill grew to a 32pt line. */}
      {/* CAPPED LIKE THE CHILD CHIP'S NAME (`CHROME_FONT_SCALE_CAP`): the bar is chrome, and at the
          largest text sizes an uncapped word could outgrow the right group on its own */}
      <AppText
        variant="bodyStrong"
        color={ink}
        numberOfLines={1}
        maxFontSizeMultiplier={CHROME_FONT_SCALE_CAP}
        style={[styles.word, { fontSize: 12.5, letterSpacing: 0.2 }]}
      >
        {syncChipText(state, count)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  /*
    THE UI FACE, NOT THE MONOSPACE (the owner, 2026-09-19: the badge "does not look nice").
    `badge` is a mono role — tabular figures earn their place where digits line up in a column,
    and this is one word in a pill. The role's own uppercase and its letter-spacing stay, which
    is what made it read as a badge in the first place; only the face changes, so `2 QUEUED`
    keeps its shape and loses the terminal look. Digits here never line up with anything.
  */
  word: { fontWeight: '600' },
});
