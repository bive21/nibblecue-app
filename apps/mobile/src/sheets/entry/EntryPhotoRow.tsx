/**
 * THE PICTURE ON AN ENTRY, as a row in the editor (`entryPhotos` in the plan matrix).
 *
 * WHY IT LIVES ON THE EDITOR AND NOT ON THE QUICK SHEETS, which is a product decision and not a
 * convenience: a quick sheet exists to get a diaper logged in two taps at 3 a.m., and a photo
 * picker in the middle of it is a camera roll between a parent and the thing they came to do.
 * The editor is where a parent goes deliberately, having already saved the entry — which is also
 * the only order the upload queue permits (`data/entryPhotos.ts`: the entry must exist before
 * its picture can be queued against it).
 *
 * THE GATE LOOKS LIKE A GATE BEFORE IT IS TAPPED (CLAUDE.md §4). Without Plus the row still
 * shows its frame and its label, with a locked chip in place of the buttons — the shape of the
 * feature with the feature withheld, never an empty box and never a control that opens a paywall
 * with no warning.
 *
 * NOTHING HERE DESCRIBES THE PICTURE. `photoCopy.ts` has the whole vocabulary and the reason.
 */
import { BodySm, Button, Chip, Icon, Meta, Surface, useTheme } from '@nibblecue/ui';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useShell } from '../../app/shell';
import { useAuth } from '../../auth/AuthContext';
import { queueEntryPhoto, dequeueEntryPhoto } from '../../data/entryPhotos';
import { systemClock } from '../../data/repository';
import { openLocalDb } from '../../db';
import {
  forgetEntryPhoto,
  forgetStagedEntryPhoto,
  pickEntryPhoto,
  prepareEntryPhoto,
  readStagedEntryPhoto,
  stageEntryPhoto,
  type PhotoSource,
} from '../../media/entryPhoto';
import { ENTRY_PHOTOS_ENABLED } from '../../media/entryPhotoSwitch';
import { useEntryPhoto, type EntryPhotoRef } from '../../media/useEntryPhoto';
import { usePlan } from '../../plan/PlanProvider';
import { useToast } from '../../ui/toast';
import { ENTRY_PHOTO_COPY } from './photoCopy';

/** The staged-file operations the queue needs, in the one shape it takes them. */
const FILES = { read: readStagedEntryPhoto, forget: forgetStagedEntryPhoto };

export interface EntryPhotoRowProps {
  householdId: string;
  activityId: string;
  photoPath: string | null;
  photoUpdatedAt: string | null;
  /** The staged file, when the queue still holds one for this entry. */
  stagedUri: string | null;
  /** Re-read the row and the queue: a save or a removal changed both. */
  onChanged: () => void;
  /**
   * Somebody else's entry, open on a caregiver's phone: the picture is shown and nothing else — a
   * caregiver may change only their own entries (PRODUCT_SPEC §11), and the editor says so once.
   */
  readOnly?: boolean;
}

/** Tall enough that a detail is worth looking at, short enough not to own the sheet. */
const FRAME = 132 as const;

/**
 * OFF FOR NOW (`media/entryPhotoSwitch.ts`, the owner, 2026-09-26): no row at all, so the editor
 * has no door to a photo. A switch rather than a deletion: the row below is the feature as it
 * shipped, and it comes back as it was when the switch does.
 */
export function EntryPhotoRow(props: EntryPhotoRowProps) {
  return ENTRY_PHOTOS_ENABLED ? <EntryPhotoRowOn {...props} /> : null;
}

function EntryPhotoRowOn({
  householdId,
  activityId,
  photoPath,
  photoUpdatedAt,
  stagedUri,
  onChanged,
  readOnly = false,
}: EntryPhotoRowProps) {
  const t = useTheme();
  const plan = usePlan();
  const shell = useShell();
  const toast = useToast();
  const { api } = useAuth();
  const allowed = plan.can('entryPhotos');

  const ref: EntryPhotoRef = { activityId, stagedUri, photoPath, photoUpdatedAt };
  const photo = useEntryPhoto(ref, path => api.entryPhotoUrl(path));

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async (source: PhotoSource) => {
    if (busy || !allowed || readOnly) return;
    setError(null);
    const picked = await pickEntryPhoto(source);
    if (picked.kind === 'canceled') return;
    if (picked.kind === 'denied') {
      setError(
        source === 'camera' ? ENTRY_PHOTO_COPY.deniedCamera : ENTRY_PHOTO_COPY.deniedLibrary,
      );
      return;
    }
    setBusy(true);
    let bytes: Uint8Array;
    try {
      bytes = await prepareEntryPhoto(picked.uri);
    } catch {
      setBusy(false);
      setError(ENTRY_PHOTO_COPY.unreadable);
      return;
    }
    const localUri = stageEntryPhoto(activityId, bytes);
    if (localUri === null) {
      setBusy(false);
      setError(ENTRY_PHOTO_COPY.unreadable);
      return;
    }
    /*
      QUEUED, NOT UPLOADED. The next flush carries it (`WorkerHooks.drainPhotos`), which is what
      lets this button work on a phone with no signal — the picture is on the disk and the row
      that remembers it is in the local database, both of which survive a kill.
    */
    const db = await openLocalDb();
    await queueEntryPhoto(db, systemClock, { householdId, activityId, localUri });
    setBusy(false);
    onChanged();
    toast.show(ENTRY_PHOTO_COPY.added);
  };

  const remove = async () => {
    if (busy || readOnly) return;
    setBusy(true);
    setError(null);
    const db = await openLocalDb();
    // the queue first, so a picture that never left this phone takes its staged file with it
    await dequeueEntryPhoto(db, FILES, activityId);
    forgetEntryPhoto(activityId);
    if (photoPath !== null) {
      /*
        THE COLUMNS ARE NOT NULLED HERE. They are the entry's, so they go through the outbox like
        every other correction — the editor's own save does it, which is why this calls back
        rather than writing. The object is deleted after, and an orphan left by a failed delete
        is swept with the household; a phantom path is what must not happen.
      */
      await api.clearEntryPhoto(householdId, activityId);
    }
    setBusy(false);
    onChanged();
    toast.show(ENTRY_PHOTO_COPY.removed);
  };

  const has = photo.uri !== null;

  return (
    <View style={{ gap: t.space.sm }} testID="entry.photo">
      <Meta>{ENTRY_PHOTO_COPY.label}</Meta>
      <Surface radius="m" style={{ padding: t.space.md, gap: t.space.md }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={has ? ENTRY_PHOTO_COPY.change : ENTRY_PHOTO_COPY.add}
          disabled={!allowed || busy || readOnly}
          onPress={() => void add('library')}
          style={({ pressed }) => [
            styles.frame,
            {
              height: FRAME,
              borderRadius: t.radius.m,
              backgroundColor: t.color.surface2,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          testID="entry.photo.frame"
        >
          {has ? (
            <Image
              source={{ uri: photo.uri ?? '' }}
              // the whole picture, letterboxed, never cropped: the detail a parent kept it for
              // may be at any edge (`ENTRY_PHOTO_LONG_EDGE` says why it is not square either)
              resizeMode="contain"
              style={[StyleSheet.absoluteFill, { borderRadius: t.radius.m }]}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              testID="entry.photo.image"
            />
          ) : (
            <View style={[styles.empty, { gap: t.space.sm }]}>
              {/* `note` rather than a camera glyph: the icon set has none, and a note is what an
                  entry without a picture already carries */}
              <Icon name="note" size={24} color={t.color.text3} />
              <Meta>{allowed ? ENTRY_PHOTO_COPY.none : ENTRY_PHOTO_COPY.locked}</Meta>
            </View>
          )}
        </Pressable>

        {photo.pending ? (
          <Meta testID="entry.photo.pending">{ENTRY_PHOTO_COPY.pending}</Meta>
        ) : null}
        {error === null ? null : (
          <BodySm ink="crit" accessibilityRole="alert" testID="entry.photo.error">
            {error}
          </BodySm>
        )}

        {readOnly ? null : allowed ? (
          <View style={[styles.row, { gap: t.space.sm }]}>
            <Button
              label={
                busy
                  ? ENTRY_PHOTO_COPY.saving
                  : has
                    ? ENTRY_PHOTO_COPY.change
                    : ENTRY_PHOTO_COPY.choose
              }
              variant="secondary"
              onPress={() => void add('library')}
              disabled={busy}
              testID="entry.photo.choose"
            />
            <Button
              label={ENTRY_PHOTO_COPY.take}
              variant="ghost"
              onPress={() => void add('camera')}
              disabled={busy}
              testID="entry.photo.take"
            />
            {has ? (
              <Button
                label={ENTRY_PHOTO_COPY.remove}
                variant="ghost"
                onPress={() => void remove()}
                disabled={busy}
                testID="entry.photo.remove"
              />
            ) : null}
          </View>
        ) : (
          /* the shape of it, withheld — never a button that opens a paywall unannounced */
          <Chip
            label={ENTRY_PHOTO_COPY.add}
            small
            locked
            onPress={() => shell.openGate('entryPhotos')}
            testID="entry.photo.locked"
          />
        )}
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
});
