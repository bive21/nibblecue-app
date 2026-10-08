import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BRAND } from '@nibblecue/brand';
import { volumeText } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import * as copy from './copy';
import { BACKFILL_NOTE } from './phases';

describe('the sync copy, byte for byte (docs/OFFLINE_SYNC.md §6)', () => {
  it('says the reconnect toast with the right number and the right noun', () => {
    expect(copy.backOnline(1)).toBe('Back online. 1 queued entry synced, one server record each.');
    expect(copy.backOnline(3)).toBe(
      'Back online. 3 queued entries synced, one server record each.',
    );
    // 0 is a plural in English and the toast is never raised for it, but the switch must not
    // invent "0 queued entry"
    expect(copy.backOnline(0)).toBe(
      'Back online. 0 queued entries synced, one server record each.',
    );
  });

  it('says the offline and duplicate toasts', () => {
    expect(copy.firstOfflineWrite).toBe('Offline. Logging keeps working and queues for sync.');
    expect(copy.duplicateBottle).toBe('Just logged that bottle. No duplicate created.');
    expect(copy.duplicateChange).toBe('Just logged that change. No duplicate created.');
    expect(copy.duplicateOneTap).toBe('Double tap ignored. One diaper, not two.');
  });

  it('says the two conflict toasts with the values the worker hands up', () => {
    expect(copy.timerMerged('9:05 am', 'Dana')).toBe('Timer merged. Started 9:05 am by Dana.');
    // the amount arrives written by the app's one writer, in the household's unit and symbol
    expect(copy.stashAdjusted('Dana', volumeText(90, 'ml'))).toBe(
      'Stash updated. This container was already used by Dana. Adjusted to 90 mL.',
    );
    expect(copy.stashAdjusted('Dana', volumeText(90, 'oz'))).toBe(
      'Stash updated. This container was already used by Dana. Adjusted to 3 oz.',
    );
  });

  it('says the four banner sentences', () => {
    expect(copy.failedValidation).toBe(
      "This entry couldn't be saved to the household. It's still on your phone. Tap to review.",
    );
    expect(copy.failedPermission).toBe(
      "Your role can't save this. Nothing was lost; ask an owner or parent to change your access.",
    );
    // the address is the brand's, read from @nibblecue/brand and never typed (CLAUDE.md §1)
    expect(copy.failedServer).toBe(
      `Some entries couldn't be saved to the server. They're safe on this phone. Try again, and if it keeps happening, tell us at ${BRAND.supportEmail}.`,
    );
    expect(copy.serverDown).toBe(
      "We can't reach the server. Your entries are safe on this phone and will sync automatically.",
    );
  });

  /**
   * THE SERVER'S OWN REFUSAL IS NOT "WE CAN'T REACH THE SERVER" (the owner on staging, 2026-09-28:
   * an online phone was told the server could not be reached, and that its entries would sync by
   * themselves, about ops the server had answered ten times and would never take). That sentence
   * is for the network; a refusal gets one that is true about it.
   */
  it('tells the server’s refusal plainly: safe here, not saved there, Try again, tell us', () => {
    const s = copy.failedServer;
    expect(s).not.toBe(copy.serverDown);
    expect(s).not.toMatch(/reach|automatically/i);
    expect(s).toMatch(/safe on this phone/);
    expect(s).toMatch(/couldn't be saved to the server/);
    expect(s).toContain('Try again');
    expect(s).toContain(BRAND.supportEmail);
    // no dashes, and sentence case: a capital to open, and none that is not a sentence's own
    expect(s).not.toMatch(/[—–]| - /);
    expect(s[0]).toBe(s[0]?.toUpperCase());
    const words = s.replace(BRAND.supportEmail, '').split(/\s+/);
    const capitals = words.filter(
      (w, i) => /^[A-Z]/.test(w) && i > 0 && !/[.!?]$/.test(words[i - 1] ?? ''),
    );
    expect(capitals).toEqual([]);
  });

  /**
   * NOT "YOUR ROLE" FOR A HOUSEHOLD THE PERSON IS NO LONGER IN (the owner on staging, 2026-09-29:
   * "your role can't save this. (I am parent)"). Entries a sign-in brought back from a household
   * the account has left are refused whatever the role here; the sentence says where they belong
   * and where they are, and asks nothing of anybody.
   */
  it('tells a refusal of another household’s entries without blaming a role', () => {
    const s = copy.failedElsewhere;
    expect(s).toBe(
      "Some entries were made in a household you're no longer part of. They're safe on this phone.",
    );
    expect(s).not.toBe(copy.failedPermission);
    expect(s).not.toMatch(/role|access|owner|Try again/i);
    expect(s).toMatch(/safe on this phone/);
    // no dashes, and sentence case: a capital to open, and none that is not a sentence's own
    expect(s).not.toMatch(/[—–]| - /);
    const words = s.split(/\s+/);
    const capitals = words.filter(
      (w, i) => /^[A-Z]/.test(w) && i > 0 && !/[.!?]$/.test(words[i - 1] ?? ''),
    );
    expect(capitals).toEqual([]);
    expect(copy.failureBanner('elsewhere')).toBe(s);
  });

  it('says the two capture bylines and the backfill note', () => {
    expect(copy.captureBylineOffline).toBe('Saved on this phone, queued for sync');
    expect(copy.captureBylineOnline).toBe('Saves immediately, syncs to the household');
    expect(copy.backfillNote).toBe('Still loading older entries');
    // the phase module is where the note is decided; the two may not drift
    expect(copy.backfillNote).toBe(BACKFILL_NOTE);
  });

  it('routes a rejection to the sentence that matches who can fix it', () => {
    expect(copy.failureClassOf('FORBIDDEN')).toBe('permission');
    expect(copy.failureClassOf('VALIDATION')).toBe('validation');
    expect(copy.failureClassOf('CONFLICT')).toBe('validation');
    expect(copy.failureClassOf('SERVER')).toBe('server');
    expect(copy.failureBanner('permission')).toBe(copy.failedPermission);
    expect(copy.failureBanner('validation')).toBe(copy.failedValidation);
    // the SERVER label is the server's own refusal; the network has its own sentence
    expect(copy.failureBanner('server')).toBe(copy.failedServer);
    expect(copy.failureBanner('unreachable')).toBe(copy.serverDown);
  });

  it('is US English everywhere a parent reads (docs/DESIGN_SYSTEM.md §18)', () => {
    const british = /\b(cancelled|colour|favourite|grey|centre|analyse|customise|synchronise)\b/i;
    for (const [name, value] of Object.entries(copy)) {
      // the exported builders take (n) or (by, n, unit); one loose call covers both
      const call = value as unknown as (...args: unknown[]) => unknown;
      const text = typeof value === 'function' ? String(call('Dana', 90, 'ml')) : String(value);
      expect(british.test(text), name).toBe(false);
    }
    expect(british.test('the colour is grey')).toBe(true);
  });
});

/* ------------------------------------------------------------------ the forbidden scan */

/**
 * §6's forbidden copy, scanned over the running sync layer and the two surfaces that show it.
 *
 * IT SCANS STRING LITERALS, NOT FILE TEXT, and that is not a convenience. `pull.ts` contains the
 * words `private async failed(` — which holds "sync failed" as a substring — and `sqlstate.ts`
 * holds SQLSTATEs as values, because classifying a SQLSTATE is its job. A raw-text scan flags
 * both and is then either switched off or riddled with exemptions; a literal scan asks the only
 * question that matters, which is whether any of those words can reach a screen.
 */
const SRC = __dirname;
const SHEET = join(SRC, '..', 'sheets', 'SyncInspectorSheet.tsx');
const BANNER = join(SRC, '..', 'app', 'SyncBanner.tsx');

const FORBIDDEN_PHRASE = /sync failed|data lost|unknown error|re-?enter/i;
/** A bare code: a SQLSTATE, an HTTP status or one of `app.fail`'s `CCnnn`, loose in a sentence. */
const BARE_CODE = /\b(CC\d{3}|\d{5}|[45]\d{2})\b/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/**
 * Every string literal in a file, with its 1-based line — COMMENTS EXCLUDED.
 *
 * A hand-written walker rather than a regex, because a regex cannot tell a quote inside a
 * comment from a quote that opens a string, and this very file's header quotes the forbidden
 * phrases in order to name them. A comment is not copy; a scan that could not tell the
 * difference would have to be weakened until it stopped finding anything.
 */
export function literalsOf(source: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  const lineAt = (i: number) => source.slice(0, i).split('\n').length;
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '/' && next === '/') {
      const nl = source.indexOf('\n', i);
      i = nl === -1 ? source.length : nl + 1;
      continue;
    }
    if (c === '/' && next === '*') {
      const close = source.indexOf('*/', i + 2);
      i = close === -1 ? source.length : close + 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      const line = lineAt(i);
      let j = i + 1;
      let text = '';
      while (j < source.length) {
        const ch = source[j];
        if (ch === '\\') {
          text += source.slice(j, j + 2);
          j += 2;
          continue;
        }
        if (ch === quote) break;
        // an unterminated ' or " cannot cross a line; a template may
        if (ch === '\n' && quote !== '`') break;
        text += ch;
        j += 1;
      }
      out.push({ text, line });
      i = j + 1;
      continue;
    }
    i += 1;
  }
  return out;
}

/**
 * Prose: something a person could read as a sentence. Three words of three letters or more,
 * and not a SQL statement — SQL is the other long multi-word literal in this tree, and it is
 * never rendered.
 */
export function isProse(text: string): boolean {
  if (/^\s*(select|insert|update|delete|create|with|pragma|begin|savepoint)\b/i.test(text)) {
    return false;
  }
  return (text.match(/[A-Za-z]{3,}/g) ?? []).length >= 3;
}

export function offendersIn(source: string): string[] {
  const out: string[] = [];
  for (const { text, line } of literalsOf(source)) {
    if (FORBIDDEN_PHRASE.test(text)) out.push(`${line}: ${text}`);
    if (isProse(text) && BARE_CODE.test(text)) out.push(`${line}: ${text}`);
  }
  return out;
}

describe('the forbidden copy scan', () => {
  const files = [
    ...walk(SRC).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')),
    SHEET,
    BANNER,
  ];

  it('is looking at the files it claims to be looking at', () => {
    expect(files.length).toBeGreaterThan(10);
    for (const required of [join(SRC, 'copy.ts'), join(SRC, 'worker.ts'), SHEET, BANNER]) {
      expect(files).toContain(required);
    }
    // and at real content, not an empty read
    expect(readFileSync(BANNER, 'utf8').length).toBeGreaterThan(200);
  });

  it('finds no forbidden phrase and no bare error code in anything a parent can read', () => {
    const offenders = files.flatMap(f =>
      offendersIn(readFileSync(f, 'utf8')).map(o => `${f} ${o}`),
    );
    expect(offenders).toEqual([]);
  });

  it('is not vacuous: the scanner fires on an injected fixture (docs/PREFLIGHT.md:60-66)', () => {
    const fixture = [
      "const a = 'Sync failed — please re-enter the feed';",
      "const b = 'Something went wrong: data lost';",
      "const c = 'An unknown error occurred';",
      "const d = 'We could not save this entry (CC422)';",
      "const e = 'The server refused this write, code 42501, sorry';",
    ].join('\n');
    const hits = offendersIn(fixture);
    expect(hits).toHaveLength(5);
    expect(hits[0]).toContain('Sync failed');
    expect(hits[3]).toContain('CC422');
    expect(hits[4]).toContain('42501');
  });

  it('does not fire on the two shapes that are not copy: a SQLSTATE value and async failed()', () => {
    // sqlstate.ts's job is to name these, and `private async failed(` holds "sync failed"
    expect(offendersIn("const INSUFFICIENT_PRIVILEGE = '42501';")).toEqual([]);
    expect(offendersIn('private async failed(outcome: PullOutcome) {}')).toEqual([]);
  });
});
