/**
 * The outbox quarantine (docs/ACCOUNTS.md §6.3). A forced sign-out must honor "never lose a
 * log" (CLAUDE.md rule 7): ops still waiting to sync are moved to an encrypted file keyed by
 * the signing-out user's id, the database is deleted as usual, and the file is replayed only
 * when the SAME user signs in again. It expires after 30 days. The plaintext header carries only
 * what the signed-out AUTH screen shows — the count and the address to sign in as — never a
 * household, child or entry. A household leaving the phone keeps its unsynced ops here too, with
 * the person still signed in (`teardown.ts`, scope `household`), which is why a second write adds
 * to the first.
 *
 * ONE SHELF PER PERSON (2026-09-29). A different person signing in used to delete the file
 * unread, and a different person's sign-out replaced it. Both lost a log, and both became the
 * ordinary path the day a babysitter who helps two families was told to use one account for each
 * (docs/ACCOUNTS.md §7.4): sign out of the first family's account with the last entries still
 * queued (a shift that ended out of signal), sign in to the second, and the first family's
 * entries were gone. Now the file holds each person's ops apart, a sign-in takes back only the
 * signer's own, and a sign-out adds its person's shelf beside the others. Nobody else's ops are
 * ever decrypted for anything but being carried over into the next write, and nothing of theirs
 * is shown but the count and the address the AUTH screen already showed. Each shelf keeps its own
 * 30 days.
 *
 * THE FILE'S TWO SHAPES. Until 2026-09-29 the header was one person's (`QuarantineHeader`) and
 * the body one array; now the header lists the shelves (`{ v: 2, users }`) and the body is one
 * map from user id to ops. A phone updated with a file already waiting reads the old shape as a
 * one-shelf file, so an update never costs anyone their queue.
 */

export interface QuarantineHeader {
  user_id: string;
  email: string | null;
  count: number;
  written_at: string;
}

/** The header as stored: one person's (before 2026-09-29) or the list of shelves. */
export type StoredQuarantineHeader = QuarantineHeader | { v: 2; users: QuarantineHeader[] };

export interface QuarantineDeps {
  /** The file: header in clear, body encrypted. One per device. */
  file: {
    read(): Promise<{ header: StoredQuarantineHeader; body: string } | null>;
    write(header: StoredQuarantineHeader, body: string): Promise<void>;
    delete(): Promise<void>;
  };
  /** The key lives in the device keystore, never beside the file. */
  keychain: {
    get(): Promise<string | null>;
    set(key: string): Promise<void>;
    clear(): Promise<void>;
  };
  cipher: {
    newKey(): string;
    encrypt(key: string, plain: string): string;
    decrypt(key: string, cipherText: string): string;
  };
  now: () => number;
}

export const QUARANTINE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The op's idempotency key, when the blob carries one — what two copies of one op share. */
const opIdOf = (op: unknown): string | null => {
  if (typeof op !== 'object' || op === null) return null;
  const id = (op as { client_op_id?: unknown }).client_op_id;
  return typeof id === 'string' ? id : null;
};

/**
 * The ops already kept, then the new ones, with one copy of each op: the NEWER copy wins, in the
 * older one's place. Each set keeps its own order, which is all a replay needs — it sorts by `seq`,
 * stably, and a chain of ops never spans two databases.
 */
function merged(kept: readonly unknown[], fresh: readonly unknown[]): unknown[] {
  const at = new Map<string, number>();
  const out: unknown[] = [];
  for (const op of [...kept, ...fresh]) {
    const id = opIdOf(op);
    const seen = id === null ? undefined : at.get(id);
    if (seen !== undefined) {
      out[seen] = op;
      continue;
    }
    if (id !== null) at.set(id, out.length);
    out.push(op);
  }
  return out;
}

/** The shelves a stored header lists, whichever shape it was written in. */
const shelvesOf = (h: StoredQuarantineHeader): QuarantineHeader[] =>
  'v' in h ? (Array.isArray(h.users) ? h.users : []) : [h];

/** What the file holds, opened: each live person's header and ops. */
interface Opened {
  shelves: QuarantineHeader[];
  ops: Map<string, unknown[]>;
}

export class Quarantine {
  constructor(private readonly deps: QuarantineDeps) {}

  /**
   * Writes only when there is something to keep; an empty queue leaves no file behind.
   *
   * A SHELF ALREADY HERE FOR THE SAME PERSON IS ADDED TO, NEVER REPLACED (2026-09-25): a household
   * teardown keeps the unsynced ops and the session, the person joins another household, and the
   * sign-out that follows writes again. Replacing the shelf there would lose the first household's
   * entries. ANOTHER PERSON'S SHELF IS KEPT BESIDE IT (2026-09-29, the header says why). An
   * expired shelf is dropped, and a file that cannot be read is replaced: nobody could ever have
   * replayed it. The 30 days start again from this write, for this person's older ops too: the TTL
   * bounds how long a shelf waits for its person, and they have just been here.
   */
  async write(
    user: { id: string; email: string | null },
    ops: readonly unknown[],
  ): Promise<boolean> {
    if (ops.length === 0) return false;
    const open = (await this.open()) ?? { shelves: [], ops: new Map<string, unknown[]>() };
    const all = merged(open.ops.get(user.id) ?? [], ops);
    open.ops.set(user.id, all);
    const shelf: QuarantineHeader = {
      user_id: user.id,
      email: user.email,
      count: all.length,
      written_at: new Date(this.deps.now()).toISOString(),
    };
    await this.save([...open.shelves.filter(h => h.user_id !== user.id), shelf], open.ops);
    return true;
  }

  /**
   * What the signed-out AUTH screen may show: a count and an address, or nothing. With more than
   * one person waiting, the one who left most recently, who is the likeliest to be signing in.
   * Read from the header alone, so it never needs the key.
   */
  async pending(): Promise<QuarantineHeader | null> {
    const f = await this.deps.file.read();
    if (!f) return null;
    const live = shelvesOf(f.header).filter(h => !this.expired(h));
    if (live.length === 0) {
      await this.discard();
      return null;
    }
    return live.reduce((a, b) => (Date.parse(b.written_at) > Date.parse(a.written_at) ? b : a));
  }

  /**
   * Called when a user signs in. Their own ops come back once and their shelf is gone; anyone
   * else's shelf is left exactly as it was, for them. Never throws on a missing or unreadable file
   * — the sign-in proceeds and only a queue nobody could replay is lost, which is the documented,
   * bounded outcome.
   */
  async takeFor(userId: string): Promise<unknown[]> {
    const f = await this.deps.file.read();
    if (!f) return [];
    const mine = shelvesOf(f.header).find(h => h.user_id === userId);
    // nothing of theirs here (or theirs has expired): somebody else's shelf is not touched
    if (mine === undefined || this.expired(mine)) {
      if (mine !== undefined) await this.dropExpired();
      return [];
    }
    const open = await this.open();
    if (open === null) return [];
    const ops = open.ops.get(userId) ?? [];
    open.ops.delete(userId);
    await this.save(
      open.shelves.filter(h => h.user_id !== userId),
      open.ops,
    );
    return ops;
  }

  async discard(): Promise<void> {
    await this.deps.file.delete();
    await this.deps.keychain.clear();
  }

  /**
   * The file opened: the live shelves and their ops. Null for no file; a file that cannot be
   * decrypted or parsed is deleted, and null returned, since no sign-in could ever replay it.
   */
  private async open(): Promise<Opened | null> {
    const f = await this.deps.file.read();
    if (!f) return null;
    let body: unknown;
    try {
      const key = await this.deps.keychain.get();
      if (!key) throw new Error('no key');
      body = JSON.parse(this.deps.cipher.decrypt(key, f.body));
    } catch {
      await this.discard();
      return null;
    }
    const shelves = shelvesOf(f.header);
    const ops = new Map<string, unknown[]>();
    if (Array.isArray(body)) {
      // the one-person shape: the body is that person's array
      const only = shelves[0];
      if (only !== undefined) ops.set(only.user_id, body as unknown[]);
    } else if (typeof body === 'object' && body !== null) {
      for (const [id, list] of Object.entries(body as Record<string, unknown>)) {
        if (Array.isArray(list)) ops.set(id, list as unknown[]);
      }
    }
    const live = shelves.filter(h => !this.expired(h) && ops.has(h.user_id));
    for (const id of [...ops.keys()]) {
      if (!live.some(h => h.user_id === id)) ops.delete(id);
    }
    return { shelves: live, ops };
  }

  /** The shelves written back under a fresh key, or the file gone when none are left. */
  private async save(shelves: QuarantineHeader[], ops: Map<string, unknown[]>): Promise<void> {
    if (shelves.length === 0) {
      await this.discard();
      return;
    }
    const key = this.deps.cipher.newKey();
    await this.deps.keychain.set(key);
    const body: Record<string, unknown[]> = {};
    for (const h of shelves) body[h.user_id] = ops.get(h.user_id) ?? [];
    await this.deps.file.write(
      { v: 2, users: shelves },
      this.deps.cipher.encrypt(key, JSON.stringify(body)),
    );
  }

  /** Expired shelves let go, the live ones written back as they were. */
  private async dropExpired(): Promise<void> {
    const open = await this.open();
    if (open !== null) await this.save(open.shelves, open.ops);
  }

  private expired(h: QuarantineHeader): boolean {
    return this.deps.now() - Date.parse(h.written_at) > QUARANTINE_TTL_MS;
  }
}
