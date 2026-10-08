/**
 * ONE LEGAL DOCUMENT, READ IN THE APP — the Terms of Use or the Privacy Policy, from the same
 * `TERMS` / `PRIVACY` objects the website renders (`packages/brand/src/legal.ts` says why there
 * is one source). It exists so that "read the terms" on the acceptance screen works with no
 * connection and without leaving the app; the link out to the web at the foot is for a parent
 * who wants a printable copy.
 *
 * Nothing here is typed: the title, the date, every sentence and the URL come from the brand
 * package, and the sheet is a plain reader — no editing, no acceptance, that is the screen's.
 */
import type { LegalDocument } from '@nibblecue/brand';
import { Body, BodySm, BodyStrong, BottomSheet, Meta, Row, Rows, useTheme } from '@nibblecue/ui';
import { Linking, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface LegalSheetProps {
  doc: LegalDocument | null;
  /** Where the same document lives on the web, for a printable copy. */
  url: string;
  onClose: () => void;
}

/** "September 21, 2026" from an ISO date, in the phone's own locale. */
const effectiveDateLabel = (iso: string): string =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

export function LegalSheet({ doc, url, onClose }: LegalSheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <BottomSheet
      visible={doc !== null}
      title={doc?.title ?? ''}
      onClose={onClose}
      detent="large"
      bottomInset={insets.bottom}
      testID="legal"
    >
      {doc ? (
        <View style={{ gap: t.space.lg }}>
          <Meta testID="legal.effective">
            {`Effective ${effectiveDateLabel(doc.effectiveDate)} · version ${doc.version}`}
          </Meta>
          <View style={{ gap: t.space.sm }}>
            {doc.summary.map(line => (
              <View key={line} style={[styles.bullet, { gap: t.space.sm }]}>
                <BodySm>•</BodySm>
                <BodySm style={styles.grow}>{line}</BodySm>
              </View>
            ))}
          </View>
          {doc.sections.map(section => (
            <View key={section.heading} style={{ gap: t.space.sm }}>
              <BodyStrong accessibilityRole="header">{section.heading}</BodyStrong>
              {section.paragraphs.map(p => (
                <Body key={p}>{p}</Body>
              ))}
            </View>
          ))}
          <Rows>
            <Row
              title="Open on the web"
              detail="A copy you can print or save"
              onPress={() => void Linking.openURL(url)}
              testID="legal.web"
            />
          </Rows>
        </View>
      ) : null}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  bullet: { flexDirection: 'row', alignItems: 'flex-start' },
  grow: { flex: 1 },
});
