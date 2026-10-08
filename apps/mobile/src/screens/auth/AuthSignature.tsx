/**
 * THE DOOR'S SIGNATURE (the owner, 2026-09-28: the mark, then by the developer, then the tagline).
 * Sign in and create account carry it, and so does Choose a new password (the owner, 2026-10-03):
 * that page is the same door, reached again to change a password, and it should say who made the
 * app in the same sentence. The developer name is the one a person sees (`developerName`), never
 * the legal one. One element for a screen reader: one sentence, not three fragments.
 */
import { BRAND, IN_APP_STRINGS } from '@nibblecue/brand';
import { Meta, useTheme } from '@nibblecue/ui';
import { Image, StyleSheet, View } from 'react-native';
import { MARK_ASPECT, MARK_SOURCE } from '../../brand/assets';

const SIGNATURE_MARK = 22;

export function AuthSignature() {
  const t = useTheme();
  return (
    <View
      style={[styles.signature, { gap: t.space.xs, paddingTop: t.space.lg }]}
      accessible
      accessibilityLabel={`${BRAND.appDisplayName} by ${BRAND.developerName}. ${IN_APP_STRINGS.footerLine}`}
      testID="auth.signature"
    >
      <View style={[styles.signatureRow, { gap: t.space.sm }]}>
        <Image
          source={MARK_SOURCE}
          style={{ height: SIGNATURE_MARK, width: SIGNATURE_MARK * MARK_ASPECT }}
          resizeMode="contain"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID="auth.signature.mark"
        />
        <Meta ink="text2" testID="auth.signature.by">{`by ${BRAND.developerName}`}</Meta>
      </View>
      <Meta ink="text2" align="center" testID="auth.signature.line">
        {IN_APP_STRINGS.footerLine}
      </Meta>
    </View>
  );
}

const styles = StyleSheet.create({
  signature: { alignItems: 'center' },
  signatureRow: { flexDirection: 'row', alignItems: 'center' },
});
