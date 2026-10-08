/**
 * EDITING OPENS THE SAME SHEET AS LOGGING — the wiring, read off the source (the owner, 2026-09-26:
 * "shouldnt editing from today's log look the same as you would as if you want to entry … why does
 * it have a different UI? keep it the same").
 *
 * Node cannot mount a React Native sheet, so what is held here is the shape: every door to an entry
 * opens the module's own capture sheet through one host; a timed module opens on its finished form
 * with no chooser; the sheet's one Save writes a CORRECTION through the editor's write path; what
 * belongs to a new entry only — the Logging-for row, a running timer, a stash draw, a second pour —
 * is not offered; and what the old editor sheet did around its fields — whose entry it is, Delete
 * with Undo, read-only for somebody else's entry, the photo row — sits around the sheet. The rules
 * themselves are table tests in `forms.test.ts`, and the writes run end to end in the scenarios.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { EDIT_COPY } from './copy';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', '..');
/** A file's source with its comments taken out, flattened to one line. */
const code = (...p: string[]): string =>
  readFileSync(join(src, ...p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');
const sheet = (f: string) => code('sheets', 'quick', 'modules', f);
const host = code('sheets', 'quick', 'edit', 'EditEntrySheet.tsx');

describe('every door to an entry opens its module’s own sheet', () => {
  it('the shell’s openEntry opens the edit host, and the separate editor sheet is gone', () => {
    const shell = code('app', 'ShellProvider.tsx');
    expect(shell).toContain(
      "import { EditEntrySheet } from '../sheets/quick/edit/EditEntrySheet';",
    );
    expect(shell).toContain(
      "<EditEntrySheet activityId={ov?.kind === 'entry' ? ov.activityId : null} onClose={closeOverlay} />",
    );
    expect(shell).not.toContain('EntryEditorSheet');
    expect(existsSync(join(src, 'sheets', 'entry', 'EntryEditorSheet.tsx'))).toBe(false);
  });

  // (CuddleCue's Today, Log and growth and temperature histories open entries too; NibbleCue's one
  // door is the Health note's look-back)
  it.each([['sheets/quick/modules/wellbeing/LookBackView.tsx', 'shell.openEntry(item.entry.id)']])(
    '%s asks the shell (%s)',
    (file, call) => {
      expect(code(...file.split('/'))).toContain(call);
    },
  );

  it('draws the body the + button draws, or the plain form for a retired module', () => {
    expect(host).toContain('{CAPTURE_SHEETS[type as ModuleId] ? ( <ModuleSheetBody');
    expect(host).toContain('moduleId={type as ModuleId}');
    // the plain form logs a module too, in the household's color like every log sheet (2026-10-06)
    expect(host).toContain(
      ') : ( <ModuleTheme module={isTintModule(type) ? type : null}> <PlainEntryForm',
    );
    // every module a parent can log today has its own sheet to be corrected on (read as text:
    // importing the table would pull React Native into a node test)
    const table = sheet('index.tsx');
    // (NibbleCue logs two modules; CuddleCue's others are corrected on the plain form)
    for (const id of ['solids', 'wellbeing'])
      expect(table, id).toMatch(new RegExp(`\\b${id}: [A-Z][a-z]+Sheet,`));
  });

  it('says it is an edit in its title, in the household’s own word', () => {
    expect(host).toContain(
      'title={type === null ? EDIT_COPY.titleLoading : EDIT_COPY.title(labels.word(type))}',
    );
    expect(EDIT_COPY.title('bottle')).toBe('Edit bottle');
    expect(EDIT_COPY.title('tummy time')).toBe('Edit tummy time');
  });

  it('hands the sheet the entry and the Save’s check, around the one body', () => {
    // `bound`: the binding, with the byline and the Delete for the forms that draw their own foot
    const provided = host.indexOf('<EditBindingContext.Provider value={bound}>');
    expect(provided).toBeGreaterThan(-1);
    expect(host.indexOf('<SaveTickContext.Provider value={tick}>')).toBeGreaterThan(provided);
    expect(host.indexOf('<ModuleSheetBody')).toBeGreaterThan(
      host.indexOf('<SaveTickContext.Provider'),
    );
    // the Save ticks and the sheet closes after the hold, exactly as a new entry's does
    expect(host).toContain(
      'const hold = holdFor(saves.size); if (hold === 0) { onClose(); return; }',
    );
    expect(host).toContain('if (live.current.open && live.current.openedAtMs === mine) onClose();');
  });
});

describe('the sheet’s Save writes a correction, on the editor’s write path', () => {
  const write = code('sheets', 'quick', 'useQuickWrite.ts');

  it('one Save per sheet: in an edit, the sheet’s fields go to the edit, never to a new row', () => {
    const save = write.slice(write.indexOf('const save = useCallback('));
    expect(save.indexOf('if (edit !== null) return edit.save(fields);')).toBeGreaterThan(-1);
    expect(save.indexOf('if (edit !== null) return edit.save(fields);')).toBeLessThan(
      save.indexOf('logActivity'),
    );
    // and off for someone who may not change the entry
    expect(write).toContain("plan.kind !== 'nobody' && (edit?.canChange ?? true)");
  });

  it('never draws the stash on a correction, even if the stash save were reached', () => {
    const stash = write.slice(write.indexOf('const saveFromStash = useCallback('));
    expect(stash.indexOf('if (edit !== null) { return edit.save({')).toBeGreaterThan(-1);
    expect(stash.indexOf('if (edit !== null)')).toBeLessThan(stash.indexOf('logBottleFromStash('));
  });

  it('only what changed, through editEntry — refused before anything is written when not theirs', () => {
    expect(host).toContain('const resolved = resolveEdit(record, fields, {');
    expect(host).toContain('outcome = await editEntry(db, systemClock, {');
    expect(host).toContain('patch: resolved.patch.patch,');
    expect(host).toContain(
      'if (err instanceof EntryNotYoursError) { say(failedPermission); return null; }',
    );
    // nothing changed: nothing written, the sheet simply closes
    expect(host).toContain('if (!resolved.patch.changed) { onClose(); return null; }');
    // a value the row cannot be saved with: said, and felt as refused
    expect(host).toContain(
      "if (resolved.error !== null) { haptic('warning'); say(resolved.error); return null; }",
    );
    expect(host.match(/haptic\(/g)).toHaveLength(1);
  });

  it('says the editor’s words, with no Undo, felt once, and answers no tour card', () => {
    expect(host).toContain(
      "announce( outcome, record.activity.type === 'bottle' ? bottleUpdated( volumeLabel(resolved.draft.consumedMl ?? 0, units.volume), formatClock(resolved.draft.startMs, clock24, timeZone), ) : ENTRY_UPDATED, { undoable: false, correction: true }, );",
    );
    const funnel = code('sheets', 'quick', 'useWriteContext.ts');
    const announce = funnel.slice(funnel.indexOf('const announce = useCallback('));
    // the one haptic every save is felt as, then the tour only for a new entry
    const toTour = announce.indexOf("if (opts.correction !== true) tour?.did('log', outcome);");
    expect(toTour).toBeGreaterThan(-1);
    expect(announce.indexOf("haptic('success');")).toBeLessThan(toTour);
  });
});

describe('what belongs to a new entry only is not offered on a correction', () => {
  it('no Logging-for row: the entry is one baby’s and stays that baby’s', () => {
    const lf = code('sheets', 'quick', 'useLoggingFor.ts');
    expect(lf).toContain('const editChild = useEditBinding()?.record.activity.child_id;');
    expect(lf).toContain(': { children, selectedId: editChild, isAll: false }');
    expect(lf).toContain(
      "if (editChild !== undefined) return { options: [], value: editChild ?? '', setValue, selection };",
    );
  });

  // (CuddleCue's timed, pump, bottle and medicine sheets, and their edit-only shapes, are not in
  // NibbleCue)
});

describe('every value the old editor could change, the sheet can', () => {
  // (CuddleCue's other capture sheets open on an entry too; NibbleCue's is solids)
  it.each([
    [
      'SolidsSheet.tsx',
      [
        'useState<Meal | null>(edit?.form.meal ?? slotMeal)',
        "lines: linesFromItems(edit.form.items, 'PIECE')",
        "useState(edit?.form.observation ?? '')",
        'isFirstTime(name, theirMeals, atMs, edit?.record.activity.id ?? null)',
      ],
    ],
  ] as const)('%s opens on the entry', (f, prefills) => {
    const s = sheet(f);
    for (const p of prefills) expect(s, p).toContain(p);
  });

  it.each([['SolidsSheet.tsx', 'quick.solids.note']])(
    '%s keeps an entry’s note correctable, though a new entry’s form asks none',
    (f, id) => {
      const s = sheet(f);
      expect(s).toContain(`<AddNote value={note} onChangeText={setNote} testID="${id}" />`);
      expect(s).toContain('notes: note.trim() || null,');
    },
  );

  it('starts the time row on the entry’s own time, and puts a picked time on the day nearest it', () => {
    const form = code('sheets', 'quick', 'QuickEntry.tsx');
    expect(form).toContain('const editAtMs = useEditBinding()?.form.rowAtMs ?? null;');
    expect(form).toContain('editing ? pickedNear(picked, endAtMs, nowMs, timeZone)');
  });
});

describe('what only an edit has sits around the sheet', () => {
  it('whose entry it is, above the fields', () => {
    const by = host.indexOf(
      '{byline && !ownFoot ? <Meta testID="entry.by">{byline}</Meta> : null}',
    );
    expect(by).toBeGreaterThan(-1);
    expect(by).toBeLessThan(host.indexOf('<EditBindingContext.Provider'));
    expect(host).toContain('attributionLine(record.by,');
    // the completed-log forms (Option 2) say it under Entry details, folded, above their Save
    expect(host).toContain(
      "const OWN_FOOT: readonly string[] = ['diaper', 'breastfeed', 'sleep'];",
    );
    expect(host).toContain(
      '{ ...binding, details: byline, remove: () => void remove(), deleting }',
    );
    expect(code('sheets', 'quick', 'completedForm.tsx')).toContain('export function DetailsRow(');
  });

  it('Delete at the foot, soft, with Undo — or, for somebody else’s entry, who can change it', () => {
    expect(host).toContain(
      'footer={ record === null || (ownFoot && canChange) ? undefined : canChange ? ( <Button label={EDIT_COPY.delete} variant="danger"',
    );
    expect(host).toContain('testID="entry.delete"');
    // the completed-log forms draw the same Delete, quiet, under their Save changes
    const form = code('sheets', 'quick', 'completedForm.tsx');
    expect(form).toContain('edit !== null && edit.canChange && edit.remove');
    expect(form).toContain('testID="entry.delete"');
    expect(host).toContain(
      '<BodySm ink="text2" testID="entry.readOnly"> {ENTRY_READ_ONLY} </BodySm>',
    );
    // THE ONE DELETE (2026-09-29, `deleteWithUndo`): the sheet's Delete and a swiped log row's are
    // the same write, the same refusal and the same Undo, so neither can drift from the other
    const remove = host.slice(host.indexOf('const remove = useCallback(async'));
    expect(host).toContain('const deleteOne = useDeleteEntry();');
    expect(remove).toContain(
      'await deleteOne( { activityId: record.activity.id, childId: record.activity.child_id, type: record.activity.type, },',
    );
    expect(remove).not.toContain('deleteEntry(');
    const shared = code('sheets', 'entry', 'deleteWithUndo.ts');
    expect(shared).toContain('outcome = await deleteEntry(db, clock, {');
    expect(shared).toContain(
      'hands.show(ENTRY_DELETED, { undo: () => void restoreEntry(db, clock, outcome)',
    );
    expect(shared).toContain('.then(() => hands.show(ENTRY_RESTORED))');
  });

  it('the photo row under the form, behind its switch, read-only where the entry is', () => {
    expect(host.indexOf('<EntryPhotoRow')).toBeGreaterThan(
      host.indexOf('</EditBindingContext.Provider>'),
    );
    expect(host).toContain('readOnly={!canChange}');
    expect(host).toContain('onChanged={() => setPhotoReads(n => n + 1)}');
  });

  it('a role not loaded yet is not a refusal; a caregiver changes only their own', () => {
    // the rule is shared with the Delete behind a swiped log row (2026-09-29), so a row offers
    // Delete exactly where this sheet does; `canChange.test.ts` walks every role through it
    expect(host).toContain(
      'const canChange = canChangeEntry( role, record?.activity.created_by ?? null, session?.user.id ?? null, );',
    );
    expect(code('sheets', 'entry', 'canChange.ts')).toContain(
      "role === undefined || role === 'OWNER' || role === 'PARENT' || (createdBy !== null && createdBy === viewerId)",
    );
  });
});
