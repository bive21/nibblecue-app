/**
 * Source tripwires for the owner's UI pass (2026-09-15; docs/PRODUCT_SPEC.md §6.3, §6.4;
 * docs/DESIGN_SYSTEM.md §15.1): the shapes a sheet must keep, read from the component files
 * with comments stripped. A screen is not rendered in this suite; what can be asserted is that
 * the file still says what the design decided.
 */
import { moduleWordFor } from '@nibblecue/core';
import { PATH_WORD_EM, pathTileLayout, pathTitleRows } from '@nibblecue/ui/layout';
import { space } from '@nibblecue/ui/theme';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hankenBold } from '../../../testing/ttf';
import { startTimerTitle, TIMER_PATH } from '../copy';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string): string =>
  readFileSync(join(here, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

/**
 * THE DAILY GOAL LIVES ON THE TUMMY-TIME SHEET (the owner, 2026-09-19: "When clicking tummy
 * time module add the ability to set how many tummy time minutes in a day as target … it can be
 * dragged up again if user decides they want to see today's history record"). The chips write
 * the same setting the Schedule tab's row does, the bar reads the same day the card does, and the
 * day's entries open on the row or on the sheet's own upward drag.
 */
/**
 * EVERY ENTRY CAN CARRY A SENTENCE (the owner, 2026-09-21, reviewing the modules). The
 * `activities.notes` column has always existed; only the bottle and the bath offered it, so a
 * refused feed, a nap in the car and — the one that matters — what else was happening at a
 * temperature reading had nowhere to go.
 *
 * WHAT IS DELIBERATELY NOT HERE is a tick list of symptoms beside the reading. A fixed list of
 * things to classify is a step toward a symptom checker, and CLAUDE.md §2 rules 1 and 3 put the
 * line before it. The field is free text and nothing in the app reads it back.
 */
describe('an entry can say what else was happening', () => {
  // (CuddleCue's bottle, bath, temperature, diaper and sleep sheets carry the note too; NibbleCue's
  // one plain-entry sheet is solids)
  it('offers the note on every sheet that writes a plain entry, and saves it', () => {
    // solids keeps its own words, stored verbatim as `observation`, behind the one folded Add note
    // row every sheet has (the owner's option 3, 2026-10-06)
    expect(read('SolidsSheet.tsx')).toMatch(
      /<AddNote\s+value=\{observation\}\s+onChangeText=\{setObservation\}/,
    );
    expect(read('SolidsSheet.tsx')).toMatch(/observation: observation\.trim\(\) \|\| null/);
  });
});

/**
 * EVERY SHEET CLEARS THE PHONE'S OWN BUTTONS (the owner, 2026-09-20, on the stash's rate
 * explainer, whose last line ran under Android's navigation bar: *"make it a little higher to
 * adjust for the phone buttons if there are any"*).
 *
 * `BottomSheet` puts `bottomInset + SHEET_FOOT_GUTTER` under its body, and `bottomInset` is the
 * one number `packages/ui` cannot know: the safe-area provider lives in the app. It therefore
 * defaults to 0, which is silent and wrong on exactly the phones that need it — the four sheets
 * this test was written for were all explainers added later, each by a screen that had no
 * `insets` in it yet. A default cannot catch that; a sweep can.
 */
describe('every bottom sheet in the app is handed the safe-area inset', () => {
  const SRC = resolve(here, '../../..');
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return e.isFile() && /\.tsx$/.test(e.name) && !/\.test\./.test(e.name) ? [full] : [];
    });

  it('passes bottomInset wherever <BottomSheet is opened', () => {
    /**
     * The opening tag ends at the first `>` OUTSIDE a braced expression — `onClose={() =>
     * close()}` has one inside, and a non-greedy regex stops there and calls every sheet in
     * the app an offender.
     */
    const openingTags = (src: string): string[] => {
      const tags: string[] = [];
      for (let i = src.indexOf('<BottomSheet'); i !== -1; i = src.indexOf('<BottomSheet', i + 1)) {
        let depth = 0;
        for (let j = i; j < src.length; j++) {
          const c = src[j];
          if (c === '{') depth++;
          else if (c === '}') depth--;
          else if (c === '>' && depth === 0) {
            tags.push(src.slice(i, j));
            break;
          }
        }
      }
      return tags;
    };

    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      const src = readFileSync(file, 'utf8');
      for (const tag of openingTags(src))
        if (!tag.includes('bottomInset')) offenders.push(relative(SRC, file));
    }
    expect(offenders, offenders.join(', ')).toEqual([]);
  });
});

/**
 * THE TWO WAYS IN, VERSION TWO (the owner, 2026-09-26: *"the icon still stays where it is, and the
 * start feeding becomes 2 rows on the right side of the icon"*). The tile sets its title beside the
 * disc on two rows and checks, before it does, that every word fits — from a table of the words'
 * widths in the face the app ships (`PATH_WORD_EM` in the design system). This holds that table to
 * the copy (every word a sheet can put on a tile is in it) and to the face (every width is the TTF's
 * own), so a new title or a new font cannot quietly break a word in half on a phone.
 */
describe('the two ways in: every word a tile prints is measured, in the face the app ships', () => {
  const titles = [
    ...Object.values(TIMER_PATH).flatMap(p => [p.start.title, p.manual.title]),
    // the tummy sheet's live title is the household's own word: "tummy time", or "playtime"
    startTimerTitle(moduleWordFor({}, 'tummy')),
    startTimerTitle(moduleWordFor({ tummy: 'playtime' }, 'tummy')),
  ];

  it('knows every word of every title the copy can put on a tile', () => {
    expect(titles).toContain('Start playtime');
    for (const title of titles) {
      expect(pathTitleRows(title).join(' '), title).toBe(title);
      for (const word of title.split(' ')) expect(PATH_WORD_EM[word], word).toBeDefined();
    }
  });

  it('holds each width to the Hanken Grotesk Bold the app bundles, read from the TTF', () => {
    const em = hankenBold();
    for (const [word, width] of Object.entries(PATH_WORD_EM))
      expect(em(word), word).toBeCloseTo(width, 3);
  });

  it('sets every pair beside its disc on every phone at the phone’s own text size', () => {
    const pairs = titles.filter(t => t.startsWith('Start ')).map(t => [t, 'Already finished']);
    for (const body of [284, 324, 339, 394])
      for (const pair of pairs)
        expect(pathTileLayout(body, space.lg, 1, pair), `${body}`).toBe('beside');
  });
});

/**
 * EVERY LOG SHEET IS ITS MODULE'S COLOR (the owner, 2026-10-06: "for all logging already finished,
 * and logging any modules: the color should follow the preset module color, instead of user
 * selection theme color"). That morning the rule was the household's scheme everywhere; it is one
 * rule still, the other way round: the body every capture sheet passes through, and the edit
 * sheet's plain form, sit in `ModuleTheme`, which swaps the whole accent family (`moduleAccent.ts`).
 */
describe('a log sheet is its module’s color, on every module', () => {
  it('draws the body every capture sheet passes through inside its module’s theme', () => {
    const body = read('index.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ');
    expect(body).toContain(
      '<ModuleTheme module={isTintModule(moduleId) ? moduleId : null}> <Sheet {...rest} /> </ModuleTheme>',
    );
  });

  it('and so does the edit sheet, for a module with no sheet of its own', () => {
    const edit = readFileSync(join(here, '..', 'edit', 'EditEntrySheet.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ');
    expect(edit).toContain('testID="entry.delete"');
    expect(edit).toContain('variant="danger"');
    expect(edit).toContain(
      '<ModuleTheme module={isTintModule(type) ? type : null}> <PlainEntryForm',
    );
  });

  it('puts no sheet back on the household’s scheme under it', () => {
    const files = readdirSync(here).filter(f => f.endsWith('.tsx'));
    for (const f of files) expect(read(f), f).not.toContain('<ModuleTint module={null}>');
  });

  // (no pump page 2, the stash-save sheet, in NibbleCue)

  /**
   * EVERY "ALREADY FINISHED" SAVE TOO (the owner, 2026-09-26: *"breastfeed already finish still at
   * the theme color. i think you missed updating it … sleeping alreayd finish also still follow
   * theme color"*). A finished form pins its Save to the sheet's foot, and the foot is drawn by the
   * sheet, outside the body's `ModuleTint` — so those four Saves were the only log buttons that
   * could not hear the tint, and drew the scheme's gradient. The one road out of the body now
   * carries the tint with it; this holds every step of that road, so the next form pinned to the
   * foot cannot lose its color the same way.
   */
  it('pins a finished form’s Save to the foot WITH the module’s tint', () => {
    const entry = readFileSync(join(here, '..', 'QuickEntry.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
      .replace(/\s+/g, ' ');
    // the Save is a primary Button (no variant), and a pinned one goes out through SheetFooter only
    expect(entry).toContain('stickySave ? <SheetFooter>{node}</SheetFooter> : node;');
    const save = entry.slice(
      entry.indexOf('<Button label={saveLabel}'),
      entry.indexOf('testID="quick.save"'),
    );
    expect(save.length).toBeGreaterThan(0);
    expect(save).not.toContain('variant=');
    expect(save).not.toContain('style=');
    // …and the foot puts the tint of the place the node was made back round it
    const foot = readFileSync(
      join(here, '../../../../../../packages/ui/src/components/BottomSheet.tsx'),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
      .replace(/\s+/g, ' ');
    expect(foot).toContain('const tint = useModuleTint();');
    expect(foot).toContain(
      'slot?.put(id, tint === null ? children : <ModuleTheme module={tint}>{children}</ModuleTheme>);',
    );
    // (CuddleCue's pump and tummy sheets pin their Save, and its diaper, sleep and feed forms wear
    // their tint; none of them is in NibbleCue. The completed-log form keeps the same foot.)
    const completed = readFileSync(join(here, '..', 'completedForm.tsx'), 'utf8').replace(
      /\s+/g,
      ' ',
    );
    expect(completed).toContain('<SheetFooter> <View style={{ gap: t.space.sm }}> <Button');
  });

  /**
   * NO SHEET HAND-PAINTS ITS SAVE. Every log sheet wears the household's scheme since 2026-10-06,
   * and the scheme's accent reaches a sheet's controls through the design system — Button,
   * SlotRow, a switch, a stepper — or as a plain mark (the food list's + and its open unit). What
   * would be the old bug by another road is a sheet drawing its own gradient or `onGradient` ink:
   * then its Save could drift from every other one. The finished forms' side marks stay the
   * module's own category ink, as they were.
   */
  it('hand-paints no gradient on any log sheet', () => {
    const files = [
      ...readdirSync(here)
        .filter(f => f.endsWith('.tsx'))
        .map(f => join(here, f)),
      ...readdirSync(join(here, 'solids'))
        .filter(f => f.endsWith('.tsx'))
        .map(f => join(here, 'solids', f)),
      join(here, '..', 'QuickEntry.tsx'),
      ...readdirSync(join(here, '..', 'edit'))
        .filter(f => f.endsWith('.tsx'))
        .map(f => join(here, '..', 'edit', f)),
    ];
    // (NibbleCue has eight: its two capture sheets, the food lines, the entry and the edit forms)
    expect(files.length).toBeGreaterThanOrEqual(8);
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
      for (const paint of [/\bgradient\b/, /\bLinearGradient\b/, /\bonGradient\b/])
        if (paint.test(src)) offenders.push(`${relative(here, file)}: ${String(paint)}`);
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
