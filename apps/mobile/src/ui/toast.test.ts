/**
 * THE EMPTY WHITE BOX.
 *
 * The owner reported it twice, on two different toasts carrying two different messages (first
 * on starting a pump, then 2026-09-17: "It didn't show anything the save toast. Just an empty
 * white box"). The decisive detail is that NEITHER the sentence NOR the Undo button was on
 * screen — an empty message alone would still have drawn Undo — so the box itself had no width
 * to put them in.
 *
 * It did not: the host centred the toast with `alignItems: 'center'`, which shrink-wraps a child
 * to its content, and the toast's content is a `flex: 1` message with nothing to flex against.
 * The prototype — which CLAUDE.md §1 makes the specification — pins it `left:12px; right:12px`,
 * full width, and never had the problem.
 *
 * Two rules come out of that and are held here, because a renderer this workspace does not have
 * is the only other way to catch them (`packages/ui/components/interaction.test.ts` records why
 * a source tripwire is the honest instrument):
 *
 *   1. The toast always has a DEFINITE width — in the component itself, so a host that forgets
 *      cannot reproduce it, and in the host, which also caps it.
 *   2. A toast with no sentence in it never draws at all. A box that says something happened and
 *      refuses to say what is worse than silence, because it reads as a failure.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const host = readFileSync(join(here, 'toast.tsx'), 'utf8');
const component = readFileSync(
  join(here, '../../../../packages/ui/src/components/Toast.tsx'),
  'utf8',
);

describe('the toast always has a width to put its sentence in', () => {
  it('stretches by default, before any host style is applied', () => {
    // the base style comes FIRST in the array so a host can still cap the width after it
    expect(component).toContain("alignSelf: 'stretch'");
    const style = component.slice(component.indexOf('style={[{ opacity: progress'));
    expect(style.indexOf("alignSelf: 'stretch'")).toBeLessThan(style.indexOf(', style]'));
  });

  it('is given a definite width and a cap by the host as well', () => {
    expect(host).toContain('style={styles.toast}');
    expect(host).toContain("toast: { width: '100%', maxWidth: TOAST_MAX_WIDTH }");
  });

  it('never lets the actions shrink away with it', () => {
    // the message takes the slack; Undo keeps its box whatever the sentence does
    expect(component).toContain('message: { flex: 1, flexShrink: 1 }');
    expect(component).toContain('flexShrink: 0,');
  });
});

describe('an empty toast never draws', () => {
  it('is refused by the host before an id is even minted', () => {
    const show = host.slice(host.indexOf('const show = useCallback('));
    const guard = show.indexOf('if (message.trim().length === 0) return;');
    const mint = show.indexOf('seq.current += 1;');
    expect(guard).toBeGreaterThan(-1);
    expect(mint).toBeGreaterThan(guard);
  });

  it('has no caller left that passes an empty sentence', () => {
    // `announce(result, '')` in StashSaveSheet was the one, and it also meant a save that did
    // not commit explained nothing at all
    const sheets = join(here, '../sheets');
    const files = walk(sheets);
    // the scan is worthless if it walked nothing; the sheets are where every save toast lives
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.filter(f => {
      const src = readFileSync(f, 'utf8');
      return (
        /(?:announce|say|toast\.show)\(\s*[^,)]*,\s*''\s*[,)]/.test(src) ||
        /(?:say|toast\.show)\(\s*''\s*[,)]/.test(src)
      );
    });
    expect(offenders).toEqual([]);
  });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name) && !name.includes('.test.')) out.push(p);
  }
  return out;
}
