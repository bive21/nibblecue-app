/**
 * Which child the screens are about (docs/DESIGN_SYSTEM.md §14: the child chip is the first
 * element of every screen's top bar, and the switcher — with "Both" for multiples — is one
 * tap away). The choice is remembered per account (`last_child_id:<uid>`), so a relaunch
 * lands on the same baby; it is not a device-level key, so signing out clears it (prefs).
 * A remembered id that no longer exists (a child removed on another device) falls back to
 * the first child rather than an empty screen.
 */
import {
  ageLabel,
  allChildrenLabel,
  bornChildren,
  canSetChildPhoto,
  childPhotoBelongsTo,
  expectedChildren,
} from '@nibblecue/core';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { crumb } from '../app/boot';
import { useAuth } from '../auth/AuthContext';
import type { ChildRow } from '../auth/providers/types';
import type { BabyAvatarDef } from '../media/avatars/art';
import { drawnBabyFile } from '../media/avatars/render';
import {
  cacheChildPhoto,
  cachedChildPhoto,
  cachedPhotoBytes,
  fetchChildPhoto,
} from '../media/childPhoto';
import { lookAtChildPhoto, mendChildPhoto, type LookDeps, type MendDeps } from '../media/photoMend';
import { oneChildInView } from './childScope';
import type { KeyValueStore } from '../prefs';
import { prefsStore } from '../prefs/async-storage';
import { useDayKey } from '../time/useDayKey';
import { dueChip } from '../expecting/copy';

export const ALL_CHILDREN = 'both' as const;
export type ChildSelectionId = string | typeof ALL_CHILDREN;

/** A child whose birth is recorded: what the app logs for, counts an age from and reminds about. */
export type BornChild = ChildRow & { birth_date: string };

export interface ChildValue {
  /**
   * The signed-in household's BORN children, in server order: every log, age, month-day, visit and
   * reminder is one of theirs. A baby on the way is in `expecting` instead (migration 0150), so
   * nothing that counts from a birth ever meets one without a birth date.
   */
  children: BornChild[];
  /** The household's babies on the way: a due date, no birth date, nothing logged for them yet. */
  expecting: ChildRow[];
  /**
   * Waiting for the first baby: a baby on the way and none born yet (core `householdExpecting`).
   * The household works with what needs no baby until then (`modulesInUse`).
   */
  householdExpecting: boolean;
  /** The selection: a child id, or `both` (only meaningful with two or more children). */
  selectedId: ChildSelectionId | null;
  /** The selected child, or null when viewing all of them or when there are none. */
  child: BornChild | null;
  isAll: boolean;
  /** What the chip reads: the name or "Both" / "All n"; a baby on the way's name while waiting. */
  chipName: string;
  /** "4 months", or "2 children" when viewing all; "Due Oct 12" while waiting for the first. */
  chipAge: string;
  /**
   * THE BABY'S PICTURE, for whichever child a surface is drawing (the owner, 2026-09-20).
   *
   * It is resolved HERE and not by each avatar, and that is the whole reason it is on this
   * context: the top bar, the switcher and the Family list draw the same children at the same
   * moment, and three independent hooks would mean three signed-URL requests and three writes
   * of the same file. This provider already owns the list; it owns the one resolution of it.
   *
   * Null is a real answer and the common one — most households never set a photo, and the
   * generated initial is a first-class default, not a placeholder (docs/MEDIA.md §1).
   */
  photoOf(childId: string): string | null;
  /** The selected child's, or null when viewing all of them. */
  photoUri: string | null;
  select(id: ChildSelectionId): void;
}

const ChildContext = createContext<ChildValue | null>(null);
const LAST_CHILD_KEY = (uid: string) => `last_child_id:${uid}`;

/**
 * THE CLOCK, ONE FUNCTION FOR THE APP'S LIFE (2026-09-28). A default written inline is a new
 * function on every render of the provider, and `now` is in the value's memo below — so every
 * render handed all forty-odd readers of `useChild` a new value (the top bar of every open page
 * among them) whatever had changed: a token refresh, the network coming back, a photo landing.
 */
const systemNow = (): number => Date.now();

export function ChildProvider({
  children: content,
  store = prefsStore,
  now = systemNow,
}: {
  children: ReactNode;
  store?: KeyValueStore;
  now?: () => number;
}) {
  const { account, session, api, actions } = useAuth();
  const uid = session?.user.id ?? null;
  const household = account?.memberships[0];
  // the household's children, born and on the way: the pictures are resolved for all of them
  const all = useMemo(
    () =>
      (account?.children ?? []).filter(
        c => !household || c.household_id === household.household_id,
      ),
    [account, household],
  );
  const children = useMemo(() => bornChildren(all), [all]);
  const expecting = useMemo(() => expectedChildren(all), [all]);
  const [stored, setStored] = useState<ChildSelectionId | null>(null);
  const [photos, setPhotos] = useState<Readonly<Record<string, string>>>({});

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void store.get(LAST_CHILD_KEY(uid)).then(v => {
      if (!cancelled && v) setStored(v);
    });
    return () => {
      cancelled = true;
    };
  }, [store, uid]);

  const selectedId = useMemo<ChildSelectionId | null>(() => {
    if (children.length === 0) return null;
    if (stored === ALL_CHILDREN)
      return children.length > 1 ? ALL_CHILDREN : (children[0]?.id ?? null);
    if (stored && children.some(c => c.id === stored)) return stored;
    return children[0]?.id ?? null;
  }, [children, stored]);

  /**
   * ONE PASS OVER THE CHILDREN, whenever the rows change — which includes the moment the other
   * parent's change arrives, because `photo_updated_at` is part of the row and a new stamp
   * makes this effect's key different.
   *
   * The cached file is preferred and checked FIRST, so a cold start with no network still shows
   * the picture that is already on the phone; only a stamp with no file behind it costs a
   * signed URL. A path that does not belong to this household and this child is skipped rather
   * than requested (`childPhotoBelongsTo`) — the server would refuse it, and an initial is a
   * better answer than a 403 nobody can act on.
   *
   * AND WHAT THE PICTURE SHOWS IS LOOKED AT, ONCE PER VERSION (2026-09-29, `media/photoMend.ts`).
   * A drawn baby picked on an iPhone before that day's fix was stored with nothing in its circle,
   * and every phone drew an empty circle, with the month-day hat on it. Such a picture is never
   * drawn: the drawn baby in its corner is drawn in its place (or the initial, when the corner is
   * not one of the app's babies), and once, from a phone whose person may change the picture, the
   * redrawn baby is sent as the child's photo so the stored picture is right everywhere. The verdict
   * is remembered per version on the phone, so a picture is read once, not on every pass.
   */
  const photoKey = all.map(c => `${c.id}:${c.photo_updated_at ?? ''}`).join('|');
  const role = household?.role ?? null;
  useEffect(() => {
    let live = true;
    const rows = all;
    const look: LookDeps = { store, read: cachedPhotoBytes, drawn: drawnBabyFile, crumb };
    const mend: MendDeps = {
      store,
      mayChange: canSetChildPhoto(role),
      // the stamp as the server has it NOW: a picture changed since it was judged is not replaced
      stampNow: async id => {
        const row = (await api.bootstrapState()).children.find(c => c.id === id);
        return row === undefined ? undefined : row.photo_updated_at;
      },
      bytes: async def => {
        const uri = await drawnBabyFile(def);
        return uri === null ? null : cachedPhotoBytes(uri);
      },
      upload: (h, c, jpeg) => api.setChildPhoto(h, c, jpeg),
      cache: (id, at, bytes) => {
        cacheChildPhoto(id, at, bytes);
      },
      refresh: () => actions.refreshAccount(),
      crumb,
    };
    void (async () => {
      const next: Record<string, string> = {};
      const redrawn: { child: ChildRow; baby: BabyAvatarDef }[] = [];
      for (const c of rows) {
        if (!childPhotoBelongsTo(c.photo_path, c.household_id, c.id)) continue;
        const cached = cachedChildPhoto(c.id, c.photo_updated_at);
        let file = cached;
        if (file === null) {
          const signed = await api.childPhotoUrl(c.photo_path as string);
          if (signed === null) continue;
          file = await fetchChildPhoto(c.id, c.photo_updated_at, signed);
          if (file === null) continue;
        }
        const seen = await lookAtChildPhoto(look, c, file);
        if (seen.show !== null) next[c.id] = seen.show;
        if (seen.redrawn !== null) redrawn.push({ child: c, baby: seen.redrawn });
      }
      if (!live) return;
      setPhotos(next);
      // after the faces are up: a send is a network round trip nobody should wait on
      for (const r of redrawn) await mendChildPhoto(mend, r.child, r.baby);
    })();
    return () => {
      live = false;
    };
    // `all`, `api`, `actions`, `store` and `role` are read through the closure on purpose: the
    // rows are a fresh array every render, and `photoKey` is what actually changes when a photo does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKey]);

  /*
    THE CHIP'S AGE TURNS OVER AT MIDNIGHT (2026-09-26). It is computed here once per change of the
    rows, so an app left open overnight — or a parent back in it on a new day — read yesterday's
    age until something else changed, beside a month-day party hat saying the new one. The day on
    the phone's own clock (the one `ageLabel` counts on) is now one of the things that changes it.
  */
  const day = useDayKey(null);

  const select = useCallback(
    (id: ChildSelectionId) => {
      setStored(id);
      if (uid) void store.set(LAST_CHILD_KEY(uid), id);
    },
    [store, uid],
  );

  const value = useMemo<ChildValue>(() => {
    const isAll = selectedId === ALL_CHILDREN;
    const child = isAll ? null : (children.find(c => c.id === selectedId) ?? null);
    // waiting for the first baby: the chip names the baby on the way and its due date
    const waiting = children.length === 0 ? (expecting[0] ?? null) : null;
    return {
      children,
      expecting,
      householdExpecting: waiting !== null,
      selectedId,
      child,
      isAll,
      chipName: isAll
        ? allChildrenLabel(children.length)
        : (child?.name ?? waiting?.name ?? 'Baby'),
      chipAge: isAll
        ? `${children.length} children`
        : child
          ? ageLabel(child.birth_date, now())
          : waiting?.due_date
            ? dueChip(waiting.due_date)
            : '',
      photoOf: (childId: string) => photos[childId] ?? null,
      photoUri: child === null ? null : (photos[child.id] ?? null),
      select,
    };
    // `day` is read through `now()`: it is here so a new day recomputes the age, not as an input
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children, expecting, selectedId, select, now, photos, day]);

  return <ChildContext.Provider value={value}>{content}</ChildContext.Provider>;
}

/**
 * THE SAME HOUSEHOLD, WITH ONE BABY IN VIEW, for what is under it: the widgets, which always draw
 * one baby (`oneChildInView` says why). On Both it is the first baby, named and read as that baby
 * alone; any other selection passes through unchanged. Its `select` is the app's own — nothing
 * under it picks a child.
 */
export function OneChildInView({ children: content }: { children: ReactNode }) {
  const outer = useChild();
  const value = useMemo<ChildValue>(() => {
    const one = oneChildInView(outer);
    if (one === outer || one.child === null) return outer;
    return {
      ...one,
      chipName: one.child.name,
      chipAge: ageLabel(one.child.birth_date, Date.now()),
      photoUri: outer.photoOf(one.child.id),
    };
  }, [outer]);
  return <ChildContext.Provider value={value}>{content}</ChildContext.Provider>;
}

export function useChild(): ChildValue {
  const v = useContext(ChildContext);
  if (!v) throw new Error('useChild outside ChildProvider');
  return v;
}
