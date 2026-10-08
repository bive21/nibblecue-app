/**
 * EVERY MEMBER'S PICTURE, RESOLVED ONCE FOR EVERY SURFACE THAT DRAWS A PERSON (the owner,
 * 2026-09-30: *"we want to add the option to upload photo for parent account to, this is for visual
 * purposes as it look better than the letter initial it shows"*; migration 0148).
 *
 * The top bar's profile button, Account & privacy, Family's member rows and who's on draw the same
 * people at the same moment (and only where an initial was: a byline stays words, see
 * `memberPicture.test.ts`), so the pictures are resolved HERE, once, as the
 * babies' are in `ChildProvider`: three independent hooks would be three signed-URL requests and
 * three writes of the same file. `pictureOf(userId)` is a file this phone can draw, or null, and
 * null is the initial — a first-class default, since most people will never set a picture.
 *
 * WHERE A PICTURE COMES FROM (`picturePeople.ts` has the rules):
 *   a drawing  its id → the drawing kept as a file (`drawnAdultFile`): offline, nothing fetched
 *   a photo    its stamp → the cached file (`memberPhoto.ts`), or a signed URL fetched once
 *   nothing    the initial
 * and the people are the household's live seats in the mirror, the rows a screen read itself
 * (`learn`, the Family page's roster), and the viewer's own account read. Anyone else — a member
 * who left, a seat that ended — is drawn with the initial, and their picture is swept off the phone.
 *
 * THE VIEWER'S OWN CHANGE IS LOCAL FIRST (`pictureWaiting.ts`): `choose` keeps the choice on this
 * phone before anything else, draws it at once, and sends it now — and again on the reconnect, when
 * the app comes back, and on a short backoff, until the server has it or refuses it for good.
 * Nothing chosen offline is lost, and nothing is half set: the file goes up before the row names it.
 */
import { memberPictureOf, type MemberPictureColumns } from '@nibblecue/core';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
import { crumb } from '../app/boot';
import { useAuth } from '../auth/AuthContext';
import { randomUuid } from '../data/ids';
import { keys } from '../data/store';
import { useSharedLocalQuery } from '../data/useSharedLocalQuery';
import { memberPictureSeats, type MemberPictureSeat } from '../db/queries/memberPictures';
import { bytesOfBase64 } from '../lib/base64';
import { drawnAdultFile } from '../media/avatars/adultFile';
import { adultAvatarById } from '../media/avatars/adults';
import {
  cachedMemberPhoto,
  cacheMemberPhoto,
  fetchMemberPhoto,
  forgetWaitingPhoto,
  sweepMemberPhotos,
  waitingPhotoFile,
} from '../media/memberPhoto';
import type { KeyValueStore } from '../prefs';
import { prefsStore } from '../prefs/async-storage';
import {
  myPicture,
  pictureKey,
  picturePeople,
  type LearnedPicture,
  type MyPicture,
} from './picturePeople';
import {
  clearWaitingPicture,
  loadWaitingPicture,
  saveWaitingPicture,
  sendWaitingPicture,
  waitingOf,
  type PictureChoice,
  type SendOutcome,
  type WaitingPicture,
} from './pictureWaiting';

export interface MemberPicturesValue {
  /** The picture to draw for a person: a file this phone holds, or null for the initial. */
  pictureOf(userId: string | null | undefined): string | null;
  /** The viewer's own, as `pictureOf(viewer)`. */
  mine: string | null;
  /** Which of the three the viewer's picture is, the waiting choice first: what the sheet marks. */
  myChoice: MyPicture;
  /** True while a change of the viewer's picture waits for the network. */
  waiting: boolean;
  /**
   * CHANGE THE VIEWER'S PICTURE. Kept on this phone first and drawn at once, then sent: `sent` is
   * on the server, `retry` waits for the network (it is sent by itself), `refused` is a no the
   * server would repeat (the choice is dropped, and the sheet says so).
   */
  choose(choice: PictureChoice): Promise<{ outcome: SendOutcome; status?: number }>;
  /** Rows a screen read itself, fresher than the mirror: the Family page's roster. */
  learn(rows: readonly LearnedPicture[]): void;
}

const EMPTY_SEATS: MemberPictureSeat[] = [];

/** When a send that met no network is tried again, besides the reconnect and the app coming back. */
const RETRY_MS = [15_000, 30_000, 60_000, 120_000] as const;

const MemberPicturesContext = createContext<MemberPicturesValue | null>(null);

export function MemberPicturesProvider({
  children,
  store = prefsStore,
}: {
  children: ReactNode;
  store?: KeyValueStore;
}) {
  const { account, session, api, actions, online } = useAuth();
  const viewer = session?.user.id?.toLowerCase() ?? null;
  const householdId = account?.memberships[0]?.household_id ?? null;
  const profile = account?.profile ?? null;
  const own: MemberPictureColumns | null = useMemo(
    () =>
      profile === null
        ? null
        : {
            avatar_path: profile.avatar_path ?? null,
            avatar_preset: profile.avatar_preset ?? null,
            avatar_updated_at: profile.avatar_updated_at ?? null,
          },
    [profile],
  );

  // the household's seats and their pictures, re-read whenever a pull brings a profile or a member
  const watch = useMemo(
    () => (householdId === null ? [] : [keys.household(householdId)]),
    [householdId],
  );
  const seats = useSharedLocalQuery<MemberPictureSeat[]>(
    `member-pictures/${householdId ?? ''}`,
    watch,
    async db => (householdId === null ? EMPTY_SEATS : memberPictureSeats(db, householdId)),
    EMPTY_SEATS,
  );

  const [learned, setLearned] = useState<Readonly<Record<string, LearnedPicture>>>({});
  useEffect(() => setLearned({}), [householdId, viewer]);
  const learn = useCallback((rows: readonly LearnedPicture[]) => {
    setLearned(prev => {
      let changed = false;
      const next = { ...prev };
      for (const r of rows) {
        const id = r.user_id.toLowerCase();
        const was = prev[id];
        if (
          was === undefined ||
          was.avatar_path !== r.avatar_path ||
          was.avatar_preset !== r.avatar_preset ||
          was.avatar_updated_at !== r.avatar_updated_at
        ) {
          next[id] = {
            user_id: id,
            avatar_path: r.avatar_path ?? null,
            avatar_preset: r.avatar_preset ?? null,
            avatar_updated_at: r.avatar_updated_at ?? null,
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  /* ------------------------------------------------------------- the viewer's waiting choice */

  const [waiting, setWaiting] = useState<WaitingPicture | null>(null);
  useEffect(() => {
    setWaiting(null);
    if (viewer === null) return;
    let live = true;
    void loadWaitingPicture(store, viewer).then(w => {
      if (live) setWaiting(w);
    });
    return () => {
      live = false;
    };
  }, [store, viewer]);

  // the newest API and refresh, read by each send: a send outlives the render that started it
  const apiRef = useRef(api);
  apiRef.current = api;
  const refreshRef = useRef(actions.refreshAccount);
  refreshRef.current = actions.refreshAccount;

  /** One send at a time, in the order asked: each reads the record as it is when its turn comes. */
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const send = useCallback((): Promise<{ outcome: SendOutcome; status?: number }> => {
    const who = viewer;
    if (who === null) return Promise.resolve({ outcome: 'nothing' });
    const run = chain.current
      .catch(() => undefined)
      .then(() =>
        sendWaitingPicture({
          load: () => loadWaitingPicture(store, who),
          clear: token => clearWaitingPicture(store, who, token),
          api: apiRef.current,
          cache: (updatedAt, bytes) => {
            cacheMemberPhoto(who, updatedAt, bytes);
          },
          refresh: () => refreshRef.current(),
        }),
      )
      .then(async r => {
        // whatever is kept now is what this phone draws: a newer choice, or nothing
        setWaiting(await loadWaitingPicture(store, who));
        if (r.outcome === 'refused') crumb(`member picture: refused (${r.status ?? '?'})`);
        return r;
      });
    chain.current = run;
    return run;
  }, [store, viewer]);

  const choose = useCallback(
    async (choice: PictureChoice): Promise<{ outcome: SendOutcome; status?: number }> => {
      if (viewer === null) return { outcome: 'refused', status: 401 };
      const record = waitingOf(choice, randomUuid());
      // kept first: a phone killed a moment from now still has the choice
      await saveWaitingPicture(store, viewer, record);
      setWaiting(record);
      return send();
    },
    [send, store, viewer],
  );

  // sent when it can be: at launch, on the reconnect, when the app comes back, and on a backoff
  const waitingToken = waiting?.token ?? null;
  useEffect(() => {
    if (viewer === null || waitingToken === null || !online) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const attempt = () => {
      if (!cancelled) void send();
    };
    attempt();
    for (const ms of RETRY_MS) timers.push(setTimeout(attempt, ms));
    const woke = AppState.addEventListener('change', s => {
      if (s === 'active') attempt();
    });
    return () => {
      cancelled = true;
      woke.remove();
      for (const id of timers) clearTimeout(id);
    };
  }, [viewer, waitingToken, online, send]);

  /* -------------------------------------------------------------------- the one resolution */

  const people = useMemo(
    () =>
      picturePeople({
        viewer,
        account: own,
        seats,
        learned: Object.values(learned),
        nowMs: Date.now(),
      }),
    [viewer, own, seats, learned],
  );
  const key = pictureKey(people, viewer, waiting);
  const [pictures, setPictures] = useState<Readonly<Record<string, string>>>({});

  useEffect(() => {
    let live = true;
    const rows = people;
    const mineWaiting = waiting;
    const who = viewer;
    const seated = seats !== EMPTY_SEATS;
    void (async () => {
      const next: Record<string, string> = {};
      for (const [id, columns] of rows) {
        try {
          if (id === who && mineWaiting !== null) {
            // the viewer's choice, drawn from this phone until the server has it
            if (mineWaiting.kind === 'photo') {
              const file = waitingPhotoFile(id, mineWaiting.token, bytesOfBase64(mineWaiting.jpeg));
              if (file !== null) next[id] = file;
            } else if (mineWaiting.kind === 'drawing') {
              const def = adultAvatarById(mineWaiting.id);
              const file = def === undefined ? null : await drawnAdultFile(def);
              if (file !== null) next[id] = file;
            }
            continue;
          }
          const picture = memberPictureOf(id, columns);
          if (picture.kind === 'drawing') {
            const def = adultAvatarById(picture.id);
            const file = def === undefined ? null : await drawnAdultFile(def);
            if (file !== null) next[id] = file;
          } else if (picture.kind === 'photo') {
            let file = cachedMemberPhoto(id, picture.updatedAt);
            if (file === null) {
              const signed = await apiRef.current.memberPhotoUrl(picture.path);
              if (signed !== null) file = await fetchMemberPhoto(id, picture.updatedAt, signed);
            }
            if (file !== null) next[id] = file;
          }
        } catch (err: unknown) {
          // no network (the in-app backend throws), a file the OS took: the initial stands in
          crumb(`member picture: ${err instanceof Error ? err.message : 'not drawn'}`);
        }
      }
      if (!live) return;
      // the waiting copy goes once nothing waits; the people who are not here take theirs with them
      if (who !== null && (mineWaiting === null || mineWaiting.kind !== 'photo'))
        forgetWaitingPhoto(who);
      if (seated) sweepMemberPhotos(new Set(rows.keys()));
      setPictures(next);
    })();
    return () => {
      live = false;
    };
    // `people`, `waiting`, `viewer` and `seats` are read through the closure on purpose: `key` is
    // what changes when any picture does, and a fresh array each render is not a change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const value = useMemo<MemberPicturesValue>(() => {
    const pictureOf = (userId: string | null | undefined): string | null =>
      userId === null || userId === undefined ? null : (pictures[userId.toLowerCase()] ?? null);
    return {
      pictureOf,
      mine: pictureOf(viewer),
      myChoice:
        viewer === null ? { kind: 'initial' } : myPicture(viewer, people.get(viewer), waiting),
      waiting: waiting !== null,
      choose,
      learn,
    };
  }, [pictures, viewer, people, waiting, choose, learn]);

  return <MemberPicturesContext.Provider value={value}>{children}</MemberPicturesContext.Provider>;
}

/** Outside the provider (a test, a story, the auth screens) every person is their initial. */
const NONE: MemberPicturesValue = {
  pictureOf: () => null,
  mine: null,
  myChoice: { kind: 'initial' },
  waiting: false,
  choose: () => Promise.resolve({ outcome: 'refused', status: 0 }),
  learn: () => undefined,
};

export function useMemberPictures(): MemberPicturesValue {
  return useContext(MemberPicturesContext) ?? NONE;
}
