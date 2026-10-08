/**
 * ONE MINUTE CLOCK FOR THE WHOLE APP (`time/useMinuteTick.ts`, 2026-09-28).
 *
 * A dozen readers each kept an interval of their own, started when they mounted, so a phone that
 * had opened three tabs re-drew in a dozen separate waves a minute. They read the app's one clock
 * now, and what that bought can only be lost silently — a new reader importing the old per-screen
 * tick, or a hook growing a `setInterval(…, 60_000)` of its own again. No renderer in this suite,
 * so the source is read, as `schedule/freshness.test.ts` reads the tick it replaces.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..');
const flat = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}
const rel = (path: string): string => relative(src, path).split(sep).join('/');

/**
 * THE FILES STILL ON THEIR OWN MINUTE, and why. There were two on the day the clock was shared —
 * Today's data hook, which defined the per-screen tick the rest of the app used, and the Reports
 * hook — and both moved to `time/useMinuteTick` the same day. The list can only shrink; it is kept
 * so a file that ever needs its own minute has to be named here, with its reason.
 */
const OWN_MINUTE: Record<string, string> = {};

describe('the one minute clock', () => {
  const hook = flat(readFileSync(join(here, 'useMinuteTick.ts'), 'utf8'));
  const clock = flat(readFileSync(join(here, 'useDayKey.ts'), 'utf8'));

  it('keeps no interval of its own: it reads the app’s one clock, and one listener on the commits', () => {
    expect(hook).not.toMatch(/setInterval|setTimeout/);
    expect(hook).toContain('const offMinute = subscribeToMinute(stamp);');
    expect(hook).toContain('const offWrite = onWrite ? subscribeToWrites(stamp) : null;');
    expect(hook).toContain('offWrites = subscribeKeys(store, tickStampKeys(true), () => {');
    // on unless a reader says otherwise, as the tick it replaces
    expect(hook).toContain('const onWrite = opts.onWrite !== false;');
    // and both are let go of
    expect(hook).toContain('offMinute(); offWrite?.();');
    // it waits on nothing remote: a commit is a local event (`freshness.test.ts`)
    expect(hook).not.toMatch(/fetch|await|push|pull/i);
  });

  it('is one interval for the day, the daytime and the minute, handing every minute reader one instant', () => {
    expect(clock.match(/setInterval\(/g)).toHaveLength(1);
    expect(clock).toContain('every = setInterval(everyMinute, MINUTE);');
    expect(clock).toContain('const at = Date.now(); for (const r of [...minuteReaders]) r(at);');
    // a minute reader is told the minute and nothing else: never the return to the foreground
    expect(clock).toContain("if (state === 'active') tell();");
    expect(clock).toContain('const tell = () => { for (const r of readers) r(); };');
  });

  it('is the tick every reader imports, Today and Reports included', () => {
    const offenders: string[] = [];
    for (const path of sources(src)) {
      const name = rel(path);
      if (name === 'time/useMinuteTick.ts' || OWN_MINUTE[name] !== undefined) continue;
      const text = readFileSync(path, 'utf8');
      // a call, not a mention: comments name the tick all over the app
      if (!/\buseMinuteTick\(/.test(flat(text))) continue;
      if (/import \{ useMinuteTick \} from '[./]+(time\/)?useMinuteTick';/.test(text)) continue;
      offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });

  it('has no reader keeping a minute interval of its own', () => {
    // the clocks that are not a reader's minute: the one clock itself, the evening dim's (which
    // measures how long the app was away, `useAutoDark.ts`), and the ones held by other hands
    const allowed = new Set([
      'time/useDayKey.ts',
      'appearance/useAutoDark.ts',
      ...Object.keys(OWN_MINUTE),
    ]);
    const offenders: string[] = [];
    for (const path of sources(src)) {
      const name = rel(path);
      if (allowed.has(name)) continue;
      const text = flat(readFileSync(path, 'utf8'));
      if (/setInterval\([^;]*(60_000|60000|MINUTE)\)/.test(text)) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });

  it('names only files that exist and still keep their own minute', () => {
    for (const name of Object.keys(OWN_MINUTE)) {
      const text = readFileSync(join(src, name), 'utf8');
      expect(text, name).toMatch(/useTodayData'|setInterval\(stamp, MINUTE\)/);
    }
  });
});
