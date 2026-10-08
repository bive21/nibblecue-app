/**
 * THE PAGE A CRASH LEAVES (docs/CRASH_REPORTS.md §3). Calm, on the paper ground every page sits on,
 * in the design system's own type and buttons: what happened, that nothing logged is lost, and one
 * thing to do about it. A stack trace is never the body of anything (packages/ui `ErrorState`): the
 * details go to the clipboard on a tap, as the report the phone keeps, and a development build also
 * prints them under the buttons.
 *
 * It renders under a ThemeProvider of its own, in the default look, which the error boundary mounts
 * (`app/ErrorScreen.tsx`): the app's appearance provider is inside the tree that broke, and a page
 * that needs the thing that broke is not one.
 */
import { Body, BodySm, Button, H1, Meta, useTheme } from '@nibblecue/ui';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CRASH_COPY } from './copy';

export interface CrashPageProps {
  onRetry: () => void;
  onCopy: () => void;
  copied: boolean;
  /** The report as text, shown only in a development build. */
  details: string | null;
}

export function CrashPage({ onRetry, onCopy, copied, details }: CrashPageProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: t.color.paper }}
      contentContainerStyle={[
        styles.page,
        {
          paddingTop: insets.top + t.space.xxl,
          paddingBottom: insets.bottom + t.space.xl,
          paddingHorizontal: t.space.xl,
          gap: t.space.lg,
        },
      ]}
      testID="error.screen"
    >
      <View style={{ gap: t.space.md }} accessibilityLiveRegion="polite">
        <H1>{CRASH_COPY.title}</H1>
        <Body>{CRASH_COPY.body}</Body>
        <BodySm>{CRASH_COPY.next}</BodySm>
      </View>
      <View style={{ gap: t.space.sm }}>
        <Button label={CRASH_COPY.retry} onPress={onRetry} testID="error.retry" />
        <Button
          label={copied ? CRASH_COPY.copied : CRASH_COPY.copy}
          onPress={onCopy}
          variant="ghost"
          testID="error.copy"
        />
      </View>
      {details !== null ? (
        <Meta selectable testID="error.details">
          {details}
        </Meta>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, justifyContent: 'center' },
});
