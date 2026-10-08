/**
 * THE SWITCH'S ORDER (0153), read from the code that runs it (`auth/AuthContext.tsx`). Each step
 * is a promise: what the family owes the server is sent before anything changes, a queue that does
 * not empty stops the switch, the old engine stops before another file is selected, and the other
 * family is focused only then. Out of order, a family off screen could hold the last copy of a log,
 * or one family's pull could land in the other's file.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const flat = (p: string) =>
  readFileSync(join(here, p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s+/g, ' ');
const auth = flat('../auth/AuthContext.tsx');
const body = auth.slice(auth.indexOf('const switchHousehold = useCallback('));
const sw = body.slice(0, body.indexOf('switchRef.current = switchHousehold;'));

describe('a switch between families', () => {
  it('sends the queue, stops on what is left, stops the engine, then shows the other family', () => {
    const flush = sw.indexOf("r.flush('manual')");
    const owed = sw.indexOf("if (owed > 0) return { kind: 'owed', count: owed, name: leaving };");
    const stop = sw.indexOf('r.stopForTeardown();');
    const remember = sw.indexOf('ACTIVE_HOUSEHOLD(cur.session.user.id)');
    const focus = sw.indexOf('await adopt(read)');
    for (const [name, at] of Object.entries({ flush, owed, stop, remember, focus }))
      expect(at, name).toBeGreaterThan(-1);
    expect(flush).toBeLessThan(owed);
    expect(owed).toBeLessThan(stop);
    expect(stop).toBeLessThan(remember);
    expect(remember).toBeLessThan(focus);
  });

  it('counts every entry the server has not accepted, failed ones too', () => {
    // a failed entry is still the only copy of a log: it stops the switch as a queued one does
    // a row the server refused for good is not waiting: it never blocks a switch (2026-10-08)
    expect(sw).toContain(
      "const owed = (await r.pending().catch(() => [])).filter( row => row.state !== 'FAILED', ).length;",
    );
  });

  it('selects the family’s file before the latch lifts and before the account is written', () => {
    const adopt = auth.slice(auth.indexOf('const adopt = useCallback('));
    const select = adopt.indexOf('await selectLocalDbHousehold(showing);');
    expect(select).toBeGreaterThan(-1);
    expect(select).toBeLessThan(adopt.indexOf('allowReopen();'));
    expect(select).toBeLessThan(adopt.indexOf('setAccount(state);'));
    // and the tree remounts only when ANOTHER family comes on screen, never for a first one
    expect(adopt).toContain(
      'if (before !== null && showing !== null && showing !== before) setHouseholdEpoch(e => e + 1);',
    );
  });

  it('remounts everything below the account on the switch', () => {
    const app = flat('../../App.tsx');
    expect(app.indexOf('<AuthProviderRoot>')).toBeLessThan(app.indexOf('<HouseholdKey>'));
    expect(app.indexOf('<HouseholdKey>')).toBeLessThan(app.indexOf('<PlanProvider>'));
    expect(flat('./HouseholdKey.tsx')).toContain('<Fragment key={householdEpoch}>');
  });

  it('deletes every family’s file at a sign-out, and only the family’s own when it leaves', () => {
    const teardown = flat('../auth/teardown.ts');
    expect(teardown).toContain(
      'await step(8, () => (deps.db.closeAndDeleteEvery ?? deps.db.closeAndDelete)());',
    );
    expect(teardown).toContain('await step(8, () => deps.db.closeAndDelete());');
    expect(flat('../auth/bindings.ts')).toContain(
      'db: { closeAndDelete: closeAndDeleteLocalDb, closeAndDeleteEvery: closeAndDeleteEveryLocalDb },',
    );
  });

  it('asks before leaving a family this person is on for, and hands the night back only on a yes', () => {
    // the duty step comes before anything is sent or stopped (`switchDuty.ts`)
    const duty = sw.indexOf(
      'const duty = await dutyStep(cur.session.user.id, opts.handBackDuty === true);',
    );
    expect(duty).toBeGreaterThan(-1);
    expect(duty).toBeLessThan(sw.indexOf("r.flush('manual')"));
    expect(sw).toContain(
      "if (duty.kind === 'on_duty') return { kind: 'on_duty', name: leaving, ...duty.duty };",
    );
    expect(sw).toContain(
      "if (duty.kind === 'offline') return { kind: 'on_duty_offline', name: leaving };",
    );
    expect(sw).toContain("if (duty.kind === 'failed') return { kind: 'failed' };");
    // the hand-back is the list "End now" writes, replacing the one this phone holds
    const step = auth.slice(auth.indexOf('const dutyStep = useCallback('));
    expect(step).toContain('await saveDuty(db, systemClock, {');
    expect(step).toContain('replacing: here.list,');
    // the switcher asks while it is still open, and passes the yes on
    const list = flat('./HouseholdsList.tsx');
    expect(list).toContain('const duty = await actions.dutyHere();');
    // asked first, and only a family with nothing to ask about goes straight to the switch
    const show = list.slice(list.indexOf('const show = async'));
    expect(show.indexOf('const duty = await actions.dutyHere();')).toBeLessThan(
      show.indexOf('await go(householdId, false);'),
    );
    expect(list.indexOf('await beforeSwitch?.();')).toBeLessThan(
      list.indexOf('await actions.switchHousehold('),
    );
    expect(list).toContain('void go(target, true);');
    expect(list).toContain(
      'await actions.switchHousehold(householdId, handBackDuty ? { handBackDuty } : {});',
    );
  });

  it('says "You joined" only once the joined family is on screen (2026-10-08)', () => {
    const settle = auth.slice(
      auth.indexOf('const settleJoin = useCallback('),
      auth.indexOf('const redeemHeld = useCallback('),
    );
    const sw2 = settle.indexOf('const out = await switchRef');
    const off = settle.indexOf(
      'const off = second ? joinedOffScreenOf(note.household_name, leaving, out) : null;',
    );
    expect(sw2).toBeGreaterThan(-1);
    expect(off).toBeGreaterThan(sw2);
    // off screen: the note is held, the reason said, and nothing else written
    expect(settle).toContain(
      'if (off !== null) { owedJoinNoteRef.current = note; setJoinedOffScreen(off); return; }',
    );
    // and the switch that brings that family on screen writes it then
    expect(sw).toContain(
      "if (owedNote?.kind === 'joined' && owedNote.household_id === householdId) { owedJoinNoteRef.current = null; setJoinedOffScreen(null); await putJoinNote(cur.session.user.id, owedNote); }",
    );
    expect(sw.indexOf('await putJoinNote(cur.session.user.id, owedNote);')).toBeGreaterThan(
      sw.indexOf('await adopt(read)'),
    );
    expect(flat('./SwitchedToast.tsx')).toContain('joinedOffScreenSentence(joinedOffScreen,');
  });
});
