/**
 * YOUR NAME, from Account & privacy. The row used to show the name and do nothing. The sheet
 * writes the caller's own profile (`setDisplayName`, the same call the join confirmation uses)
 * and reads the account again, then asks for a pull so this phone's copy of the roster follows
 * without waiting for the next one.
 *
 * A toast is said after the sheet closes: a toast under an open sheet is drawn in the window
 * behind it, where nobody can read it (the download sheet's note).
 */
import { DisplayNameSchema } from '@nibblecue/core';
import { BodySm, BottomSheet, Button, Input, useTheme } from '@nibblecue/ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { FormError } from '../../screens/first-run/Sections';
import { syncRuntime } from '../../sync/status';
import { useToast } from '../../ui/toast';
import { YOUR_NAME } from './nameCopy';

export interface NameSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function NameSheet({ visible, onClose }: NameSheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { account, api, actions } = useAuth();
  const current = account?.profile?.display_name?.trim() ?? '';
  const [name, setName] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(current);
    setError(null);
    setBusy(false);
  }, [visible, current]);

  const save = async () => {
    if (busy) return;
    const wanted = name.trim();
    if (wanted === current) {
      onClose();
      return;
    }
    if (!DisplayNameSchema.safeParse(wanted).success) {
      setError(YOUR_NAME.rule);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await api.setDisplayName(wanted);
      if (!r.ok) {
        setError(YOUR_NAME.failed);
        return;
      }
      await actions.refreshAccount().catch(() => null);
      void syncRuntime()
        ?.pullNow()
        .catch(() => undefined);
      onClose();
      toast.show(YOUR_NAME.saved);
    } catch {
      setError(YOUR_NAME.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      title={YOUR_NAME.title}
      onClose={onClose}
      bottomInset={insets.bottom}
      testID="account.name.sheet"
      footer={
        <Button
          label={YOUR_NAME.save}
          onPress={() => void save()}
          loading={busy}
          testID="account.name.save"
        />
      }
    >
      <View style={{ gap: t.space.lg }}>
        <Input
          label={YOUR_NAME.label}
          value={name}
          onChangeText={v => {
            setName(v);
            setError(null);
          }}
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
          maxLength={40}
          testID="account.name.input"
        />
        <BodySm>{YOUR_NAME.help}</BodySm>
        {error ? <FormError testID="account.name.error">{error}</FormError> : null}
      </View>
    </BottomSheet>
  );
}
