/**
 * THE BABY'S PICTURE (the owner, 2026-09-20: *"Also add the feature to add baby's picture saved
 * to everyone in household"*; docs/MEDIA.md; the prototype's `SHEETS.child` photo block).
 *
 * One photo per child, in a private bucket only the household can read. The frame at the top is
 * the picker AND the preview, so what a parent taps is what they will see in the top bar a
 * second later; the generated initial shows through until there is one, because most households
 * never set a photo and none of these surfaces may look unfinished without one (MEDIA.md §1).
 *
 * THE UPLOAD NEEDS THE NETWORK, AND THE SHEET SAYS SO RATHER THAN PRETENDING. `children` is an
 * account-level table written through the API — the same boundary `AddChildSheet` works inside,
 * and for the same reason: the server owns who may write a child, and the row has to exist on it
 * before another phone can see it. So there is no optimistic local photo here. That is NOT a
 * breach of "never lose a log" (CLAUDE.md §2 rule 7): a photo is a setting a parent can re-pick
 * in two taps, not an observation that only existed once, and a picture that silently looked
 * saved on one phone and was never on the other is the worse failure of the two.
 *
 * A CAREGIVER SEES THE FACE AND NO BUTTONS. `child_photo_write` is `app.can_admin`, so their tap
 * would be a 403 whatever this screen believed (CLAUDE.md §2 rule 9) — and a control that always
 * fails is worse than one that is not there, which is the argument FamilyScreen already makes
 * about "Add a child". The name and the date of birth sit on the same role (`children_write`).
 *
 * THE NAME AND THE DATE (the owner, 2026-10-03). A date typed wrong at setup has to be fixable,
 * from Family and from the child chip. The photo still saves on its own tap. The name and the
 * date are one Save, and only once they differ from the row: a button that writes nothing is
 * not drawn. A baby on the way can be renamed here. Their date of birth is Today's "The baby is
 * here", which is what starts the 14 days, so this sheet does not set one.
 */
import { canSetChildPhoto, checkChildCorrection, ChildNameSchema } from '@nibblecue/core';
import {
  Avatar,
  Body,
  BodySm,
  BodyStrong,
  BottomSheet,
  Button,
  Input,
  Label,
  useTheme,
} from '@nibblecue/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bornOn } from '../../app/childSwitcher';
import { useAuth } from '../../auth/AuthContext';
import { keys, store } from '../../data/store';
import { openLocalDb } from '../../db';
import { useChild } from '../../household/ChildContext';
import { todayIso } from '../../lib/locale';
import {
  cacheChildPhoto,
  forgetChildPhoto,
  pickChildPhoto,
  prepareChildPhoto,
  type PhotoSource,
} from '../../media/childPhoto';
import { AvatarGrid } from '../../media/avatars/AvatarGrid';
import { DateField } from '../../ui/DateField';
import { useToast } from '../../ui/toast';
import { useTimeZone } from '../quick/prefs';
import {
  CHILD_DETAILS,
  CHILD_PHOTO_COPY,
  childDetailFailure,
  childDetailReason,
  childPhotoFailure,
  childPhotoTitle,
} from './childPhotoCopy';

export interface ChildPhotoSheetProps {
  /** The child whose photo this is, or null while the sheet is closed. */
  childId: string | null;
  onClose: () => void;
}

/** The preview: the same circle the top bar draws, at the size a face is worth looking at. */
const FRAME = 112 as const;

/**
 * The picker's Date is a local calendar day. `toISOString` would move it to the day before in
 * any zone behind UTC, which is exactly the wrong date of birth.
 */
const isoDay = (d: Date): string => {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};
/** Local noon, so the wheel shows the calendar day and not the day before or after it. */
const fromIso = (s: string | null): Date | null => {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0);
};

/** This phone's copy of the row, so the date is not the old one until the next pull. */
async function mirrorChild(
  householdId: string,
  childId: string,
  nextName: string,
  nextBirth: string | null,
  preterm: number | null,
): Promise<void> {
  try {
    const db = await openLocalDb();
    await db.run(
      `update children set name = ?, birth_date = ?, preterm_weeks = ?, updated_at = ?
       where id = ? and household_id = ?`,
      [nextName, nextBirth, preterm, new Date().toISOString(), childId, householdId],
    );
    store.invalidate(keys.children(householdId), keys.household(householdId));
  } catch {
    // the screens read the account, which refreshAccount has just rewritten
  }
}

export function ChildPhotoSheet({ childId, onClose }: ChildPhotoSheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { account, api, actions } = useAuth();
  const { children: born, expecting, photoOf } = useChild();
  const children = useMemo(() => [...born, ...expecting], [born, expecting]);
  const timeZone = useTimeZone();

  const child = children.find(c => c.id === childId) ?? null;
  const household = account?.memberships[0];
  const canEdit = canSetChildPhoto(household?.role ?? null);
  const photoUri = child === null ? null : photoOf(child.id);
  const hasPhoto = photoUri !== null;

  const [busy, setBusy] = useState<'save' | 'remove' | 'details' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [birth, setBirth] = useState<string | null>(null);
  /** Which child the fields were filled from, so a refresh does not wipe a name being typed. */
  const filledFor = useRef<string | null>(null);

  useEffect(() => {
    if (childId === null) {
      filledFor.current = null;
      return;
    }
    if (filledFor.current === childId) return;
    const c = children.find(x => x.id === childId);
    if (c === undefined) return;
    filledFor.current = childId;
    setBusy(null);
    setError(null);
    setName(c.name);
    setBirth(c.birth_date);
  }, [childId, children]);

  const save = async (source: PhotoSource) => {
    if (!child || !household || busy !== null) return;
    setError(null);
    const picked = await pickChildPhoto(source);
    if (picked.kind === 'canceled') return;
    if (picked.kind === 'denied') {
      setError(
        source === 'camera' ? CHILD_PHOTO_COPY.deniedCamera : CHILD_PHOTO_COPY.deniedLibrary,
      );
      return;
    }
    setBusy('save');
    let bytes: Uint8Array;
    try {
      bytes = await prepareChildPhoto(picked.uri);
    } catch {
      setBusy(null);
      setError(CHILD_PHOTO_COPY.unreadable);
      return;
    }
    await upload(bytes);
  };

  /**
   * THE ONE UPLOAD, whether the picture was picked, shot or chosen from the illustrations — so a
   * pre-made baby reaches the other parent's phone by exactly the road a photo does.
   */
  const upload = async (bytes: Uint8Array) => {
    if (!child || !household) return;
    setBusy('save');
    const r = await api.setChildPhoto(household.household_id, child.id, bytes);
    if (!r.ok) {
      setBusy(null);
      setError(childPhotoFailure(r.status));
      return;
    }
    // cached BEFORE the account is re-read, so the row's new stamp finds its file already
    // there and the avatar never blinks through a fetch it does not need
    cacheChildPhoto(child.id, r.photo.photo_updated_at, bytes);
    await actions.refreshAccount();
    setBusy(null);
    onClose();
    toast.show(CHILD_PHOTO_COPY.saved);
  };

  /**
   * The name and the date, after the photo's own writes. The local mirror is updated with the
   * same values so this phone does not keep the old date until the next pull. The server row is
   * what the other phones read.
   */
  const saveDetails = async () => {
    if (!child || !household || busy !== null) return;
    const today = todayIso(new Date(), timeZone);
    if (child.birth_date === null) {
      const named = ChildNameSchema.safeParse(name);
      if (!named.success) {
        setError(
          named.error.issues[0]?.code === 'too_big'
            ? CHILD_DETAILS.nameLong
            : CHILD_DETAILS.nameNeeded,
        );
        return;
      }
      if (named.data === child.name) return;
      setError(null);
      setBusy('details');
      const r = await api.updateChild(household.household_id, child.id, {
        name: named.data,
        birth_date: null,
      });
      if (!r.ok) {
        setBusy(null);
        setError(r.status === 422 ? CHILD_DETAILS.nameNeeded : childDetailFailure(r.status));
        return;
      }
      await mirrorChild(household.household_id, child.id, r.child.name, null, null);
      await actions.refreshAccount();
      setBusy(null);
      onClose();
      toast.show(CHILD_DETAILS.saved);
      return;
    }
    if (birth === null) {
      setError(CHILD_DETAILS.birthNeeded);
      return;
    }
    const check = checkChildCorrection(
      { name, birth_date: birth, due_date: child.due_date },
      today,
    );
    if (!check.ok) {
      setError(childDetailReason(check.reason));
      return;
    }
    if (check.value.name === child.name && check.value.birth_date === child.birth_date) return;
    setError(null);
    setBusy('details');
    const r = await api.updateChild(household.household_id, child.id, {
      name: check.value.name,
      birth_date: check.value.birth_date,
    });
    if (!r.ok) {
      setBusy(null);
      setError(childDetailFailure(r.status));
      return;
    }
    await mirrorChild(
      household.household_id,
      child.id,
      r.child.name,
      r.child.birth_date,
      check.value.preterm_weeks,
    );
    await actions.refreshAccount();
    setBusy(null);
    onClose();
    toast.show(CHILD_DETAILS.saved);
  };

  const remove = async () => {
    if (!child || !household || busy !== null) return;
    setError(null);
    setBusy('remove');
    const r = await api.clearChildPhoto(household.household_id, child.id);
    if (!r.ok) {
      setBusy(null);
      setError(childPhotoFailure(r.status));
      return;
    }
    forgetChildPhoto(child.id);
    await actions.refreshAccount();
    setBusy(null);
    onClose();
    toast.show(CHILD_PHOTO_COPY.removed);
  };

  return (
    <BottomSheet
      visible={childId !== null}
      title={childPhotoTitle(child?.name ?? '')}
      onClose={onClose}
      detent="large"
      bottomInset={insets.bottom}
      testID="childphoto"
    >
      <View style={{ gap: t.space.xl }}>
        <View style={[styles.head, { gap: t.space.lg }]}>
          {/* THE FRAME IS THE CONTROL. Tapping the picture is what a parent tries first, and a
              preview that is not tappable is a control the screen is hiding from them. It is the
              library rather than the camera because that is the common answer — the photo of
              their baby they want is one they already took. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hasPhoto ? CHILD_PHOTO_COPY.change : CHILD_PHOTO_COPY.choose}
            disabled={!canEdit || busy !== null}
            onPress={() => void save('library')}
            style={({ pressed }) => ({
              opacity: pressed ? 0.8 : 1,
              borderRadius: FRAME / 2,
            })}
            testID="childphoto.frame"
          >
            <Avatar
              name={child?.name ?? ''}
              size={FRAME}
              {...(photoUri !== null ? { photoUri } : {})}
              accessibilityLabel=""
              testID="childphoto.preview"
            />
          </Pressable>
          <View style={styles.words}>
            {/* a title and its hint, as a row draws them (2026-09-30, docs/DESIGN_SYSTEM.md §4.1):
                they were BodySm over a caption, and the read-only and privacy lines under the
                buttons were captions too, where every hint in the app is BodySm */}
            <BodyStrong>{hasPhoto ? CHILD_PHOTO_COPY.set : CHILD_PHOTO_COPY.none}</BodyStrong>
            <BodySm>{CHILD_PHOTO_COPY.lede}</BodySm>
          </View>
        </View>

        {canEdit ? (
          <View style={{ gap: t.space.md }}>
            <Input
              label={CHILD_DETAILS.name}
              value={name}
              onChangeText={v => {
                setName(v);
                setError(null);
              }}
              autoCapitalize="words"
              testID="childphoto.name"
            />
            {child?.birth_date === null ? (
              <BodySm ink="text2" testID="childphoto.birth_later">
                {CHILD_DETAILS.expectingBirth}
              </BodySm>
            ) : (
              <DateField
                label={CHILD_DETAILS.birth}
                value={fromIso(birth)}
                onChange={d => {
                  setBirth(isoDay(d));
                  setError(null);
                }}
                maximumDate={new Date()}
                testID="childphoto.birth"
              />
            )}
            {child !== null &&
            (name.trim() !== child.name ||
              (child.birth_date !== null && birth !== child.birth_date)) ? (
              <Button
                label={busy === 'details' ? CHILD_DETAILS.saving : CHILD_DETAILS.save}
                onPress={() => void saveDetails()}
                disabled={busy !== null}
                testID="childphoto.save"
              />
            ) : null}
          </View>
        ) : child === null ? null : (
          <View style={{ gap: t.space.sm }} testID="childphoto.facts">
            <View style={{ gap: 2 }}>
              <Label>{CHILD_DETAILS.name}</Label>
              <Body>{child.name}</Body>
            </View>
            {child.birth_date === null ? (
              <BodySm>{CHILD_DETAILS.expectingBirth}</BodySm>
            ) : (
              <View style={{ gap: 2 }}>
                <Label>{CHILD_DETAILS.birth}</Label>
                <Body>{bornOn(child.birth_date)}</Body>
              </View>
            )}
          </View>
        )}

        {error === null ? null : (
          <BodySm ink="crit" accessibilityRole="alert" testID="childphoto.error">
            {error}
          </BodySm>
        )}

        {canEdit ? (
          <View style={{ gap: t.space.sm }}>
            <Button
              label={busy === 'save' ? CHILD_PHOTO_COPY.saving : CHILD_PHOTO_COPY.choose}
              onPress={() => void save('library')}
              disabled={busy !== null}
              testID="childphoto.choose"
            />
            <Button
              label={CHILD_PHOTO_COPY.take}
              variant="secondary"
              onPress={() => void save('camera')}
              disabled={busy !== null}
              testID="childphoto.camera"
            />
            {hasPhoto ? (
              <Button
                label={busy === 'remove' ? CHILD_PHOTO_COPY.removing : CHILD_PHOTO_COPY.remove}
                variant="ghost"
                onPress={() => void remove()}
                disabled={busy !== null}
                testID="childphoto.remove"
              />
            ) : null}
            <AvatarGrid
              onPicked={async bytes => {
                if (busy !== null) return;
                setError(null);
                await upload(bytes);
              }}
              onFailed={setError}
              disabled={busy !== null}
              testID="childphoto.illustrations"
            />
          </View>
        ) : (
          <BodySm testID="childphoto.read_only">{CHILD_PHOTO_COPY.readOnly}</BodySm>
        )}

        <BodySm testID="childphoto.privacy">{CHILD_PHOTO_COPY.privacy}</BodySm>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center' },
  words: { flex: 1, minWidth: 0, gap: 2 },
});
