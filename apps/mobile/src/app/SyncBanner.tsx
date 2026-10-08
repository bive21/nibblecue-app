/**
 * The sync banner (docs/OFFLINE_SYNC.md §6; docs/UX_AUDIT.md §7 R-4; docs/DESIGN_SYSTEM.md §5).
 *
 * THE BANNER IS THE TAP TARGET; THE CHIP IS NOT. The chip is a status (§14) — it says what is
 * happening in two words and opens nothing. When something needs a person, the words do not fit
 * in a pill and the person needs somewhere to go, so a second surface appears under the bar with
 * the sentence and a way in. Splitting them is what lets the chip stay small enough to live
 * beside a child's name.
 *
 * Three rules, all from §6's last paragraph, and each of them is a thing this component does NOT
 * do rather than something it does:
 *
 *   * **Never a modal.** It sits in the layout under the top bar; the screen beneath it stays
 *     usable and scrollable, and logging keeps working while it is up. A sync problem never
 *     stops a parent recording a feed.
 *   * **Never takes focus.** `accessibilityLiveRegion="polite"` announces it when it appears and
 *     nothing is stolen mid-sentence from whatever the parent was reading.
 *   * **Always dismissible.** The dismiss is a real 44 px control of its own, outside the card's
 *     press target, so "make this go away" and "show me" are never the same tap.
 *
 * It carries no color-only meaning: the tone tints the ground, and the sentence says the thing.
 */
import { Body, Button, Card, IconButton, useTheme } from '@nibblecue/ui';
import { StyleSheet, View } from 'react-native';

export interface SyncBannerProps {
  message: string;
  /** Opens the queue. Omitted when there is nothing useful to show — then it is a statement. */
  onPress?: (() => void) | undefined;
  onDismiss: () => void;
  /**
   * TRY AGAIN — the thing a banner about a stuck queue has to offer and did not.
   *
   * Without it the only control was Dismiss, which hides the sentence and changes nothing: the
   * rows stay FAILED, the chip keeps saying so, and the parent's only real cure was signing out
   * (`status.ts` `SyncRuntime.retry` has the account). Pressing it is safe however many times —
   * an op the server already applied answers `duplicate`, which counts as a success.
   */
  onRetry?: (() => void) | undefined;
  /** `crit` for something a person must resolve, `warn` for something that resolves itself. */
  tone?: 'warn' | 'crit';
  testID?: string;
}

export function SyncBanner({
  message,
  onPress,
  onDismiss,
  onRetry,
  tone = 'crit',
  testID = 'sync.banner',
}: SyncBannerProps) {
  const t = useTheme();
  const tint = tone === 'crit' ? t.color.roseSoft : t.color.milkSoft;
  const hue = tone === 'crit' ? t.color.crit : t.color.warn;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.host, { paddingHorizontal: t.space.xxl, paddingBottom: t.space.sm }]}
    >
      <Card
        tint={tint}
        hue={hue}
        radius="s"
        {...(onPress ? { onPress, accessibilityLabel: `${message} Opens the sync queue.` } : {})}
        testID={testID}
      >
        <View style={[styles.row, { gap: t.space.md }]}>
          <View style={styles.message}>
            <Body testID={`${testID}.message`}>{message}</Body>
            {onRetry ? (
              <Button
                label="Try again"
                variant="secondary"
                size="sm"
                onPress={onRetry}
                style={styles.retry}
                testID={`${testID}.retry`}
              />
            ) : null}
          </View>
          <IconButton
            icon="x"
            size={44}
            accessibilityLabel="Dismiss"
            onPress={onDismiss}
            testID={`${testID}.dismiss`}
          />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  message: { flex: 1, gap: 8 },
  retry: { alignSelf: 'flex-start' },
});
