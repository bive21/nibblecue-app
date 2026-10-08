/**
 * EDITING AN ENTRY OPENS THE SHEET THAT LOGGED IT (the owner, 2026-09-26: "shouldnt editing from
 * today's log look the same as you would as if you want to entry (finished module for some with
 * timer)? why does it have a different UI? keep it the same").
 *
 * Every door to an entry — a row of Today's log or of the Log tab, a reading in the temperature or
 * growth history, the catch-up card — asks the shell for `openEntry(id)`, and this is what opens:
 * the module's own capture sheet (`ModuleSheetBody`, the body the + button opens), filled in from
 * the entry (`forms.ts`), under "Edit bottle". A timed module opens straight on its "Already
 * finished" form, with no Start now to choose between (`useTimerSheet`). The Save is the sheet's
 * own and ticks as it always does; in an edit it writes a CORRECTION of this entry through the one
 * write path an edit has always taken (`editEntry` — only what changed, stamped with who changed
 * it, refused before anything is written when it is not this person's to change), with the
 * editor's words and no Undo (§16: an edit's toast is a statement). It is felt once, as every save
 * is (`announce`), and answers no tour card: a correction is not a new entry.
 *
 * WHAT ONLY AN EDIT HAS sits around the sheet, where a slot's Skip sits around it for a slot
 * (`QuickEntrySheet`): whose entry it is ABOVE the fields (WP11 — a correction overwrites somebody's
 * record of what happened, so whose it is comes before the controls that change it), the entry's
 * photo row UNDER them (behind its switch, `media/entryPhotoSwitch.ts`), and at the sheet's foot
 * Delete — soft, with the 5.2 s Undo — or, on a caregiver's phone looking at someone else's entry,
 * the one line that says who can change it, with the sheet's Save off.
 *
 * The entry is read once per opening. A photo added or removed re-reads the photo alone, so a
 * correction half made on the sheet is never thrown away under the parent's thumb.
 */
import type { ModuleId } from '@nibblecue/core';
import {
  BodySm,
  BottomSheet,
  Button,
  formatClock,
  isTintModule,
  Meta,
  ModuleTheme,
  ModuleDisc,
  useTheme,
} from '@nibblecue/ui';
import { haptic } from '@nibblecue/ui/haptics';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../../auth/AuthContext';
import { editEntry, EntryNotYoursError } from '../../../data/entries';
import { systemClock, type WriteOutcome } from '../../../data/repository';
import { openLocalDb } from '../../../db';
import { entryById, type EntryRecord } from '../../../db/queries/today';
import { useModuleLabels } from '../../../modules/useModuleLabels';
import { entryDeleted } from '../../../screens/timeline/deleted';
import { failedPermission } from '../../../sync/copy';
import { canChangeEntry } from '../../entry/canChange';
import { EntryPhotoRow } from '../../entry/EntryPhotoRow';
import {
  attributionLine,
  bottleUpdated,
  ENTRY_READ_ONLY,
  ENTRY_UPDATED,
  whenPhrase,
} from '../../entry/editor';
import { useDeleteEntry } from '../../entry/useDeleteEntry';
import { CAPTURE_SHEETS, ModuleSheetBody } from '../modules';
import { deviceClock24, useTimeZone, useUnits } from '../prefs';
import { holdFor, inFlightSaves, runPressed, SaveTickContext, type SaveTick } from '../saveTick';
import { useWriteContext } from '../useWriteContext';
import { volumeLabel } from '../volume';
import { EditBindingContext, type EditBinding } from './binding';
import { EDIT_COPY } from './copy';
import { formStart, resolveEdit } from './forms';
import { PlainEntryForm } from './PlainEntryForm';

export interface EditEntrySheetProps {
  activityId: string | null;
  onClose: () => void;
}

/**
 * THE COMPLETED-LOG FORMS (the owner's Option 2, 2026-10-05): these draw their own Entry details,
 * Save changes and quiet Delete entry (`completedForm.tsx`), so the host hands them the byline and
 * the delete through the binding and draws neither itself. Every other module keeps the byline at
 * the top and the Delete button at the foot, as before.
 */
const OWN_FOOT: readonly string[] = ['diaper', 'breastfeed', 'sleep'];

/** One opening: the entry as it was read, and the instant the sheet opened on it. */
interface Opening {
  id: string;
  record: EntryRecord | null;
  openedAtMs: number;
}

/** The entry's picture as the row and the upload queue hold it (`EntryPhotoRow`). */
interface Photo {
  path: string | null;
  updatedAt: string | null;
  staged: string | null;
}

function EditEntrySheetBody({ activityId, onClose }: EditEntrySheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const labels = useModuleLabels();
  const write = useWriteContext();
  // the one delete: the same write, refusal and Undo as a swiped row's Delete (`deleteWithUndo`)
  const deleteOne = useDeleteEntry();
  const { account, session } = useAuth();
  const units = useUnits();
  const timeZone = useTimeZone();
  const clock24 = deviceClock24();
  const [opening, setOpening] = useState<Opening | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoReads, setPhotoReads] = useState(0);
  // the upward drag on the handle, per opening: a sheet with more to show opens it on this
  const [expanded, setExpanded] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /*
    A NEW OPENING STARTS EMPTY, decided as the sheet renders (React's pattern for state that follows
    a prop; `QuickEntrySheet` does the same). The last opening is kept while the sheet slides away,
    so nothing blanks mid-exit — but an entry opened again, perhaps just corrected, must never show
    the values it had last time for the moment its fresh read takes.
  */
  const [asked, setAsked] = useState<string | null>(activityId);
  if (asked !== activityId) {
    setAsked(activityId);
    if (activityId !== null) {
      setOpening(null);
      setPhoto(null);
      setExpanded(false);
    }
  }

  useEffect(() => {
    let live = true;
    if (activityId === null) return undefined;
    void openLocalDb()
      .then(db => entryById(db, activityId))
      .then(record => {
        if (live) setOpening({ id: activityId, record, openedAtMs: Date.now() });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [activityId]);

  /**
   * THE STAGED PICTURE, read beside the row rather than from it: a photo picked a minute ago is in
   * `photo_queue` and not yet in `activities` — the two columns are stamped only once the upload
   * lands — so a row read alone would show nothing while the picture is most likely looked at.
   */
  useEffect(() => {
    let live = true;
    if (activityId === null) return undefined;
    void openLocalDb()
      .then(async db => {
        const r = await entryById(db, activityId);
        const queued = await db.get<{ local_uri: string }>(
          "select local_uri from photo_queue where activity_id = ? and state != 'FAILED'",
          [activityId],
        );
        return {
          path: r?.activity.photo_path ?? null,
          updatedAt: r?.activity.photo_updated_at ?? null,
          staged: queued?.local_uri ?? null,
        };
      })
      .then(p => {
        if (live) setPhoto(p);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [activityId, photoReads]);

  // this opening's entry — or, while the sheet slides away, the last one, so nothing blanks mid-exit
  const current =
    opening !== null && (activityId === null || opening.id === activityId) ? opening : null;
  const record = current?.record ?? null;
  const openedAtMs = current?.openedAtMs ?? 0;
  const type = record?.activity.type ?? null;

  /**
   * WHETHER THIS PERSON MAY CHANGE THIS ENTRY: an owner or a parent any entry, a caregiver only
   * their own (PRODUCT_SPEC §11) — the server's rule, asked before Save or Delete is offered rather
   * than after the server refuses one (`editEntry`, `deleteEntry`). A role not loaded yet is not a
   * refusal: the server decides, as it always did. The rule is `canChangeEntry`, shared with the
   * Delete behind a swiped row of the log (2026-09-29), so a row offers Delete exactly where this
   * sheet does.
   */
  const role = account?.memberships[0]?.role;
  const canChange = canChangeEntry(
    role,
    record?.activity.created_by ?? null,
    session?.user.id ?? null,
  );

  /** One correction at a time: a second tap while the first is being written writes nothing. */
  const saving = useRef(false);
  const { context, announce, say } = write;
  const binding = useMemo<EditBinding | null>(() => {
    if (record === null) return null;
    return {
      record,
      form: formStart(record),
      canChange,
      save: async fields => {
        if (saving.current) return null;
        const resolved = resolveEdit(record, fields, {
          volume: units.volume,
          weight: units.weight,
          length: units.length,
          timeZone,
          nowMs: Date.now(),
        });
        // a time that cannot be, or a field the row cannot be saved without: said, never written
        if (resolved.error !== null) {
          haptic('warning');
          say(resolved.error);
          return null;
        }
        // NOTHING CHANGED: nothing is written, and the sheet simply closes
        if (!resolved.patch.changed) {
          onClose();
          return null;
        }
        const c = await context();
        if (c === null) return null;
        saving.current = true;
        try {
          const { db, ...w } = c;
          let outcome: WriteOutcome;
          try {
            outcome = await editEntry(db, systemClock, {
              ...w,
              activityId: record.activity.id,
              childId: record.activity.child_id,
              type: record.activity.type,
              patch: resolved.patch.patch,
              ...(resolved.patch.detailPatch ? { detailPatch: resolved.patch.detailPatch } : {}),
            });
          } catch (err) {
            // the same refusal as a delete's, before anything is written (`editEntry`)
            if (err instanceof EntryNotYoursError) {
              say(failedPermission);
              return null;
            }
            throw err;
          }
          // §16: a bottle says what it is now; everything else "Entry updated". Neither is undone
          // from the toast, and a correction answers no tour card (`announce`'s `correction`)
          announce(
            outcome,
            record.activity.type === 'bottle'
              ? bottleUpdated(
                  volumeLabel(resolved.draft.consumedMl ?? 0, units.volume),
                  formatClock(resolved.draft.startMs, clock24, timeZone),
                )
              : ENTRY_UPDATED,
            { undoable: false, correction: true },
          );
          return outcome;
        } finally {
          saving.current = false;
        }
      },
    };
  }, [record, canChange, units, timeZone, clock24, context, announce, say, onClose]);

  /*
    THE SAVE'S CHECK — the same handshake as `QuickEntrySheet`'s (`saveTick.ts`), for one opening:
    the form marks its Save in flight while the sheet's save runs, and a sheet that says it is done
    meanwhile has just written that save, so the Save shows its check and the sheet closes after
    the hold. Anything else that ends the sheet closes it at once.
  */
  const open = activityId !== null;
  const [tickedAt, setTickedAt] = useState<number | null>(null);
  const [saves] = useState(inFlightSaves);
  const live = useRef({ openedAtMs, open });
  const holding = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    live.current = { openedAtMs, open };
  });
  useEffect(() => saves.clear(), [openedAtMs, saves]);
  useEffect(
    () => () => {
      if (holding.current !== null) clearTimeout(holding.current);
    },
    [],
  );
  const ticked = tickedAt === openedAtMs;
  const tick = useMemo<SaveTick>(
    () => ({ ticked, pressed: run => runPressed(saves, run) }),
    [ticked, saves],
  );
  const done = () => {
    const hold = holdFor(saves.size);
    if (hold === 0) {
      onClose();
      return;
    }
    setTickedAt(openedAtMs);
    const mine = openedAtMs;
    if (holding.current !== null) clearTimeout(holding.current);
    holding.current = setTimeout(() => {
      holding.current = null;
      if (live.current.open && live.current.openedAtMs === mine) onClose();
    }, hold);
  };

  /*
    DELETE, SOFT, WITH ITS UNDO — the one delete every screen shares (`deleteWithUndo`): refused
    before anything is written when it is not this person's, `Entry deleted` with the 5.2 s Undo
    when it is. Only once it has landed does the Log under this sheet hear of it, to crumple the row
    once the sheet has gone (`screens/timeline/deleted.ts`), and the sheet close.
  */
  const remove = useCallback(async () => {
    if (record === null || deleting) return;
    try {
      await deleteOne(
        {
          activityId: record.activity.id,
          childId: record.activity.child_id,
          type: record.activity.type,
        },
        {
          before: () => setDeleting(true),
          written: () => {
            entryDeleted(record.activity.id);
            onClose();
          },
        },
      );
    } finally {
      setDeleting(false);
    }
  }, [record, deleting, deleteOne, onClose]);

  /**
   * THE BYLINE, read at open. `Date.now()` is called in render on purpose: the phrase only changes
   * across a midnight, and the sheet is open for a minute at a time.
   */
  const byline =
    record === null
      ? null
      : attributionLine(record.by, atMs =>
          whenPhrase(atMs, Date.now(), timeZone, ms => formatClock(ms, clock24, timeZone)),
        );

  const ownFoot = type !== null && OWN_FOOT.includes(type);
  const bound = useMemo<EditBinding | null>(
    () =>
      binding === null || !ownFoot
        ? binding
        : { ...binding, details: byline, remove: () => void remove(), deleting },
    [binding, ownFoot, byline, remove, deleting],
  );

  return (
    <BottomSheet
      visible={open}
      title={type === null ? EDIT_COPY.titleLoading : EDIT_COPY.title(labels.word(type))}
      {...(ownFoot && type !== null
        ? { titleIcon: <ModuleDisc moduleId={type as ModuleId} size={44} /> }
        : {})}
      onClose={onClose}
      detent="content"
      bottomInset={insets.bottom}
      onExpand={() => setExpanded(true)}
      footer={
        record === null || (ownFoot && canChange) ? undefined : canChange ? (
          <Button
            label={EDIT_COPY.delete}
            variant="danger"
            onPress={() => void remove()}
            disabled={deleting}
            testID="entry.delete"
          />
        ) : (
          <BodySm ink="text2" testID="entry.readOnly">
            {ENTRY_READ_ONLY}
          </BodySm>
        )
      }
      testID="entry"
    >
      {record !== null && bound !== null && type !== null ? (
        <View style={{ gap: t.space.lg }}>
          {byline && !ownFoot ? <Meta testID="entry.by">{byline}</Meta> : null}
          <EditBindingContext.Provider value={bound}>
            <SaveTickContext.Provider value={tick}>
              {CAPTURE_SHEETS[type as ModuleId] ? (
                <ModuleSheetBody
                  key={`${record.activity.id}:${openedAtMs}`}
                  moduleId={type as ModuleId}
                  openedAtMs={openedAtMs}
                  timeZone={timeZone}
                  clock24={clock24}
                  preset={null}
                  expanded={expanded}
                  onDone={done}
                />
              ) : (
                /* a module with no capture sheet of its own is still logged here, in its module's
                   color like every log sheet (`ModuleSheetBody` has the owner's decision) */
                <ModuleTheme module={isTintModule(type) ? type : null}>
                  <PlainEntryForm
                    key={`${record.activity.id}:${openedAtMs}`}
                    moduleId={type}
                    openedAtMs={openedAtMs}
                    timeZone={timeZone}
                    clock24={clock24}
                    onDone={done}
                  />
                </ModuleTheme>
              )}
            </SaveTickContext.Provider>
          </EditBindingContext.Provider>
          {/* LAST, under the form, because it is the one control here that opens another app */}
          <EntryPhotoRow
            householdId={record.activity.household_id}
            activityId={record.activity.id}
            photoPath={photo?.path ?? record.activity.photo_path}
            photoUpdatedAt={photo?.updatedAt ?? record.activity.photo_updated_at}
            stagedUri={photo?.staged ?? null}
            onChanged={() => setPhotoReads(n => n + 1)}
            readOnly={!canChange}
          />
        </View>
      ) : (
        <BodySm>{current !== null && record === null ? EDIT_COPY.gone : ''}</BodySm>
      )}
    </BottomSheet>
  );
}

/**
 * DRAWN AGAIN ONLY WHEN ITS OWN PROPS CHANGE (2026-09-28): the shell renders it among fifteen
 * overlays at every open and close, and with no entry open it has nothing to draw
 * (`ShellProvider.tsx` says why each overlay is memoised).
 */
export const EditEntrySheet = memo(EditEntrySheetBody);
