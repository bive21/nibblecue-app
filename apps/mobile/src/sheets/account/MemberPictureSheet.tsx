/**
 * YOUR PICTURE (the owner, 2026-09-30: *"we want to add the option to upload photo for parent
 * account to, this is for visual purposes as it look better than the letter initial it shows"*;
 * migration 0148). Opened from Account & privacy, which the profile picture in the top bar reaches.
 *
 * THREE CHOICES, the baby's photo sheet's pattern (`ChildPhotoSheet`): a photo, taken or chosen
 * (the frame at the top is the picker AND the preview, so what the person taps is what the top bar
 * shows a moment later); one of twelve drawings (`AdultAvatarGrid`); or the initial it always was.
 *
 * LOCAL FIRST, UNLIKE THE BABY'S PHOTO. A person's own picture is theirs alone to change, so there
 * is no role for the server to check before the phone can believe it: the choice is kept on this
 * phone and drawn at once, and sent now or as soon as there is a network (`MemberPictures.tsx`,
 * `pictureWaiting.ts`). The sheet says which: "Picture saved", or that it is saved here and goes to
 * the household once the phone is back online. Only a refusal the server would repeat is an error,
 * and the choice goes back to what the server has.
 *
 * Every member may change their own, whatever their role: it is the person's face, not the
 * household's settings.
 */
import { Avatar, BodySm, BodyStrong, BottomSheet, Button, useTheme } from '@nibblecue/ui';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../auth/AuthContext';
import { useMemberPictures } from '../../household/MemberPictures';
import type { PictureChoice } from '../../household/pictureWaiting';
import { AdultAvatarArt } from '../../media/avatars/AdultAvatarArt';
import { AdultAvatarGrid } from '../../media/avatars/AdultAvatarGrid';
import { adultAvatarById } from '../../media/avatars/adults';
import { pickChildPhoto, prepareChildPhoto, type PhotoSource } from '../../media/childPhoto';
import { useToast } from '../../ui/toast';
import { MEMBER_PICTURE_COPY, memberPictureFailure } from './pictureCopy';

export interface MemberPictureSheetProps {
  visible: boolean;
  onClose: () => void;
}

/** The preview: the size a face is worth looking at, as the baby's photo sheet draws it. */
const FRAME = 112 as const;

export function MemberPictureSheet({ visible, onClose }: MemberPictureSheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { account } = useAuth();
  const pictures = useMemberPictures();
  const name = account?.profile?.display_name ?? '';
  const choice = pictures.myChoice;
  const drawing = choice.kind === 'drawing' ? adultAvatarById(choice.id) : undefined;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setBusy(false);
    setError(null);
  }, [visible]);

  /** The one road for all three: kept here, drawn, sent; the sheet says which it came to. */
  const apply = async (next: PictureChoice) => {
    setBusy(true);
    setError(null);
    const r = await pictures.choose(next);
    setBusy(false);
    if (r.outcome === 'refused') {
      setError(memberPictureFailure(r.status));
      return;
    }
    onClose();
    toast.show(
      r.outcome === 'retry'
        ? MEMBER_PICTURE_COPY.savedHere
        : next.kind === 'initial'
          ? MEMBER_PICTURE_COPY.initialBack
          : MEMBER_PICTURE_COPY.saved,
    );
  };

  const photo = async (source: PhotoSource) => {
    if (busy) return;
    setError(null);
    // the baby's picker and its re-encode: one square crop, 512 px, EXIF gone
    const picked = await pickChildPhoto(source);
    if (picked.kind === 'canceled') return;
    if (picked.kind === 'denied') {
      setError(
        source === 'camera' ? MEMBER_PICTURE_COPY.deniedCamera : MEMBER_PICTURE_COPY.deniedLibrary,
      );
      return;
    }
    setBusy(true);
    let jpeg: Uint8Array;
    try {
      jpeg = await prepareChildPhoto(picked.uri);
    } catch {
      setBusy(false);
      setError(MEMBER_PICTURE_COPY.unreadable);
      return;
    }
    await apply({ kind: 'photo', jpeg });
  };

  const shows =
    choice.kind === 'photo'
      ? MEMBER_PICTURE_COPY.showsPhoto
      : choice.kind === 'drawing'
        ? MEMBER_PICTURE_COPY.showsDrawing
        : MEMBER_PICTURE_COPY.showsInitial;

  return (
    <BottomSheet
      visible={visible}
      title={MEMBER_PICTURE_COPY.title}
      onClose={onClose}
      bottomInset={insets.bottom}
      testID="picture.sheet"
    >
      <View style={{ gap: t.space.xl }}>
        <View style={[styles.head, { gap: t.space.lg }]}>
          {/* THE FRAME IS THE CONTROL, as on the baby's photo sheet: tapping the picture is what a
              person tries first, and the library is the common answer */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              choice.kind === 'initial' ? MEMBER_PICTURE_COPY.choose : MEMBER_PICTURE_COPY.change
            }
            disabled={busy}
            onPress={() => void photo('library')}
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1, borderRadius: FRAME / 2 })}
            testID="picture.frame"
          >
            {drawing !== undefined ? (
              // a drawing at this size is the vector itself, not the small kept file
              <View style={[styles.clip, { borderRadius: FRAME / 2 }]} testID="picture.preview">
                <AdultAvatarArt def={drawing} size={FRAME} />
              </View>
            ) : (
              <Avatar
                name={name}
                size={FRAME}
                {...(choice.kind === 'photo' && pictures.mine !== null
                  ? { photoUri: pictures.mine }
                  : {})}
                accessibilityLabel=""
                testID="picture.preview"
              />
            )}
          </Pressable>
          <View style={styles.words}>
            <BodyStrong>{shows}</BodyStrong>
            <BodySm>{MEMBER_PICTURE_COPY.lede}</BodySm>
          </View>
        </View>

        {error === null ? null : (
          <BodySm ink="crit" accessibilityRole="alert" testID="picture.error">
            {error}
          </BodySm>
        )}
        {pictures.waiting && error === null ? (
          <BodySm testID="picture.waiting">{MEMBER_PICTURE_COPY.waiting}</BodySm>
        ) : null}

        <View style={{ gap: t.space.sm }}>
          <Button
            label={busy ? MEMBER_PICTURE_COPY.saving : MEMBER_PICTURE_COPY.choose}
            onPress={() => void photo('library')}
            disabled={busy}
            testID="picture.choose"
          />
          <Button
            label={MEMBER_PICTURE_COPY.take}
            variant="secondary"
            onPress={() => void photo('camera')}
            disabled={busy}
            testID="picture.camera"
          />
          {choice.kind === 'initial' ? null : (
            <Button
              label={MEMBER_PICTURE_COPY.useInitial}
              variant="ghost"
              onPress={() => void apply({ kind: 'initial' })}
              disabled={busy}
              testID="picture.initial"
            />
          )}
          <AdultAvatarGrid
            chosen={choice.kind === 'drawing' ? choice.id : null}
            onPicked={def => {
              if (busy) return;
              void apply({ kind: 'drawing', id: def.id });
            }}
            disabled={busy}
            testID="picture.drawings"
          />
        </View>

        <BodySm testID="picture.privacy">{MEMBER_PICTURE_COPY.privacy}</BodySm>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center' },
  words: { flex: 1, minWidth: 0, gap: 2 },
  clip: { width: FRAME, height: FRAME, overflow: 'hidden' },
});
