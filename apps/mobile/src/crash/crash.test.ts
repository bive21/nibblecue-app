/**
 * THE PHONE'S HALF OF A CRASH REPORT (docs/CRASH_REPORTS.md): recorded with the moment's facts and
 * nothing personal, kept on the phone in a small queue, sent on a later launch, and kept when the
 * send cannot land. The scrub itself is tested in core (`crash/report.test.ts`).
 */
import { crashReportFrom, type CrashReport } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import { memoryStore } from '../prefs';
import { noteCrashNames, noteCrashRoute } from './context';
import { CRASH_COPY } from './copy';
import { namesToScrub } from './names';
import { recordCrashWith, type RecordDeps } from './record';
import { crashAnswerOf, flushCrashes, type CrashSink } from './send';
import {
  CRASH_QUEUE_KEY,
  loadCrashes,
  MAX_AGE_MS,
  MAX_QUEUED,
  MAX_REPEATS,
  queueCrash,
} from './store';

const NOW = Date.parse('2026-10-08T12:00:00.000Z');

const device = () => ({
  appVersion: '0.2.1',
  runtime: 'production/embedded',
  platform: 'ios' as const,
  osVersion: '18.1',
});

const report = (message: string, at = NOW): CrashReport =>
  crashReportFrom({
    error: new Error(message),
    source: 'global',
    fatal: false,
    at,
    ...device(),
    route: 'Today',
    names: [],
  });

/** Lets the queue write `recordCrashWith` starts, and does not wait for, land. */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

afterEach(() => {
  noteCrashNames([]);
  noteCrashRoute(null);
});

describe('recording a crash', () => {
  it('builds the report from the moment and puts it on the queue', async () => {
    const store = memoryStore();
    const deps: RecordDeps = { device, store, now: () => NOW };
    noteCrashRoute('Schedule');
    noteCrashNames(['Emma']);
    const r = recordCrashWith(
      new TypeError('Emma has no bottle'),
      { source: 'render', fatal: true },
      deps,
    );
    expect(r).toMatchObject({
      error_name: 'TypeError',
      message: '[name] has no bottle',
      route: 'Schedule',
      platform: 'ios',
      source: 'render',
      fatal: true,
    });
    await settle();
    expect(await loadCrashes(store, NOW)).toEqual([r]);
  });

  it('never throws, even when the facts cannot be read', () => {
    const deps: RecordDeps = {
      device: () => {
        throw new Error('no constants');
      },
      store: memoryStore(),
      now: () => NOW,
    };
    expect(recordCrashWith(new Error('x'), { source: 'global', fatal: true }, deps)).toBeNull();
  });

  it('keeps the page up when the queue cannot be written', async () => {
    const store = { ...memoryStore(), set: () => Promise.reject(new Error('disk full')) };
    const r = recordCrashWith(
      new Error('x'),
      { source: 'global', fatal: true },
      {
        device,
        store,
        now: () => NOW,
      },
    );
    expect(r).not.toBeNull();
    await settle();
  });
});

describe('the queue', () => {
  it('holds at most a few of one crash, and at most MAX_QUEUED in all', async () => {
    const store = memoryStore();
    for (let i = 0; i < MAX_REPEATS + 3; i++) await queueCrash(store, report('same'), NOW);
    expect(await loadCrashes(store, NOW)).toHaveLength(MAX_REPEATS);
    for (let i = 0; i < MAX_QUEUED * 2; i++) await queueCrash(store, report(`crash ${i}`), NOW);
    expect(await loadCrashes(store, NOW)).toHaveLength(MAX_QUEUED);
  });

  it('drops a report older than two weeks, and anything that is not a report', async () => {
    const store = memoryStore({
      [CRASH_QUEUE_KEY]: JSON.stringify([
        report('old', NOW - MAX_AGE_MS - 1),
        { nope: 1 },
        report('new'),
      ]),
    });
    expect((await loadCrashes(store, NOW)).map(r => r.message)).toEqual(['new']);
  });

  it('reads a torn or foreign value as an empty queue', async () => {
    expect(await loadCrashes(memoryStore({ [CRASH_QUEUE_KEY]: '{oops' }), NOW)).toEqual([]);
    expect(await loadCrashes(memoryStore({ [CRASH_QUEUE_KEY]: '{}' }), NOW)).toEqual([]);
  });
});

describe('sending the queue', () => {
  async function queued(...messages: string[]) {
    const store = memoryStore();
    for (const m of messages) await queueCrash(store, report(m), NOW);
    return store;
  }

  it('sends each report and forgets what was stored or refused', async () => {
    const store = await queued('a', 'b', 'c');
    const seen: string[] = [];
    const sink: CrashSink = r => {
      seen.push(r.message);
      return Promise.resolve(r.message === 'b' ? 'refused' : 'stored');
    };
    expect(await flushCrashes(store, sink, NOW)).toEqual({ sent: 2, refused: 1, left: 0 });
    expect(seen).toEqual(['a', 'b', 'c']);
    expect(await store.get(CRASH_QUEUE_KEY)).toBeNull();
  });

  it('stops at the first send that fails and keeps the rest for the next launch', async () => {
    const store = await queued('a', 'b', 'c');
    const sink: CrashSink = r =>
      r.message === 'b' ? Promise.reject(new Error('offline')) : Promise.resolve('stored');
    expect(await flushCrashes(store, sink, NOW)).toEqual({ sent: 1, refused: 0, left: 2 });
    expect((await loadCrashes(store, NOW)).map(r => r.message)).toEqual(['b', 'c']);
  });

  it('keeps a report that arrived while the send was running', async () => {
    const store = await queued('a');
    const sink: CrashSink = async () => {
      await queueCrash(store, report('during'), NOW);
      return 'stored';
    };
    await flushCrashes(store, sink, NOW);
    expect((await loadCrashes(store, NOW)).map(r => r.message)).toEqual(['during']);
  });
});

describe("the server's answer", () => {
  it('reads stored, the daily limit, a refusal and the network apart', () => {
    expect(crashAnswerOf({ data: 'stored', error: null })).toBe('stored');
    expect(crashAnswerOf({ data: 'rate_limited', error: null })).toBe('refused');
    expect(crashAnswerOf({ data: null, error: { code: 'CC422', message: 'too big' } })).toBe(
      'refused',
    );
    expect(crashAnswerOf({ data: null, error: { code: '23514', message: 'check' } })).toBe(
      'refused',
    );
    // not about the report: it waits for a later launch
    expect(() =>
      crashAnswerOf({ data: null, error: { code: '', message: 'Network request failed' } }),
    ).toThrow();
    expect(() =>
      crashAnswerOf({ data: null, error: { code: 'PGRST202', message: 'no function' } }),
    ).toThrow();
    expect(() =>
      crashAnswerOf({ data: null, error: { code: 'PGRST301', message: 'jwt expired' } }),
    ).toThrow();
  });
});

describe('the names to scrub', () => {
  it('are the account’s, the families’ and the babies’, each once', () => {
    const names = namesToScrub(
      {
        profile: { id: 'u', display_name: 'Dana', email: 'dana@example.test', terms_version: 1 },
        memberships: [
          { household_name: 'The Iversens' } as never,
          { household_name: 'Grandma’s' } as never,
        ],
        children: [{ name: 'Emma' } as never, { name: '' } as never],
        modules: [],
        entitlement: null,
        serverNow: 0,
        deletionPending: null,
      },
      {
        user: { id: 'u', email: 'dana@example.test', emailVerified: true },
        accessToken: 'a',
        refreshToken: 'r',
        expiresAt: null,
      },
    );
    expect(names).toEqual(['dana@example.test', 'Dana', 'The Iversens', 'Grandma’s', 'Emma']);
  });

  it('are none before anyone has signed in', () => {
    expect(namesToScrub(null, null)).toEqual([]);
  });
});

describe('the error page', () => {
  it('says nothing logged is lost, plainly, with no dash in a sentence', () => {
    expect(CRASH_COPY.body).toMatch(/Nothing you logged is lost/);
    for (const line of Object.values(CRASH_COPY)) {
      expect(line).not.toMatch(/ [-–—] /);
      expect(line[0]).toBe(line[0]?.toUpperCase());
    }
  });
});
