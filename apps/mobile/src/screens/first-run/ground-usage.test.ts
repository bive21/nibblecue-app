import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The scan that closes the one hole the token matrix structurally cannot.
 *
 * `packages/ui/src/theme/contrast.test.ts` measures INKS against GROUNDS. It cannot measure a
 * SCREEN against a LAYOUT, so nothing in it can tell you that a particular sentence ended up on
 * the lit ground rather than on a surface. That distinction is the whole safety margin here:
 *
 *   crit directly on the ground   3.98:1      crit on a card over the ground   5.16:1 at the least
 *   warn directly on the ground   3.93:1      warn on a surface over the ground   4.54:1
 *
 * against a 4.5:1 floor. `warn` already fails at a warm wash of only 2.0x groundWash, so no
 * amount of tuning saves it — a status ink simply cannot sit on a decorated page in this palette.
 * The design keeps it off by construction, routing every status string through `FormError`, and
 * this file is what keeps that true as the screens change.
 *
 * `FormError` WAS A BOX, AND IS A LINE ON A CARD NOW (the owner's rule 4 of 2026-09-30, up for their
 * review: docs/DESIGN_SYSTEM.md §4.1). It drew its message on a solid surface of its own, 5.42:1,
 * which is what kept crit off the ground; the owner asked for every error to be the one small red
 * line, so the surface is the page's now: every `FormError` is drawn on the card of the form it is
 * about, or on `ErrorPanel` where setup has none, and the last check below fails the build for one
 * that is not.
 *
 * THE DECORATION IS EVERY SCREEN'S NOW (the owner, 2026-09-22: *"replace the background for the
 * main app, with the one we have on onboarding, with all the baby icons"*). It used to be five
 * signed-out pages, and this file held it there — a decoration with INK in it reaching Today was
 * to be a review rather than a diff nobody read. That review happened and the answer was yes, so
 * what this file holds is no longer WHERE the pattern draws but what may sit on it: `Screen`
 * owns the mount, no screen reaches for `<Ground>` itself, and no status ink sits bare on a page.
 *
 * The numbers above are the lit ground's. The pattern's own are no better — crit bottoms out at
 * 3.92:1 over it (glass/slate/light), against the same 4.5 floor — so the rule did not soften
 * when it widened. In the app, status text sits on a card, a sheet or a FormError, never bare on
 * the page: DeleteAccountScreen moved to FormError when the ground moved behind it, and
 * NewPasswordScreen moved when the ground reached every page.
 */
const HERE = resolve(__dirname, '../../..');
const SRC = 'src';

/**
 * The signed-out pages. They no longer opt IN to the decoration — every screen has it — but they
 * are still the pages with no card, no sheet and no chrome between their words and the ground,
 * which is exactly the set the status-ink rule was written for.
 */
const GROUND_SCREENS = [
  'src/screens/auth/AuthScreen.tsx',
  'src/screens/auth/VerifyScreen.tsx',
  'src/screens/auth/ResetPasswordScreen.tsx',
  // the Terms of Use / Privacy Policy acceptance (2026-09-21): between verify and setup
  'src/screens/onboarding/OnboardingScreen.tsx',
  /*
    `phase: 'ended'` (2026-09-22) — a caregiver whose evening ran out, or anyone removed. It
    belongs here for the reason the rule is written the way it is: there is no household to put
    a top bar over, and its three ways on are the same doors the signed-out pages offer. A parent
    reading it should feel they are in the same room as setup, not on an error page.
  */
  'src/screens/auth/EndedScreen.tsx',
  /*
    The joiner's confirmation (2026-09-29): the first page in a household just joined, and the
    joiner's short setup — their name. It is the join's last page before Today, as setup's own
    welcome is setup's, and it is drawn on the same ground with its one error through FormError.
  */
  'src/screens/auth/JoinedScreen.tsx',
].sort();

/**
 * Every first-run source the status-ink rule binds. `Sections.tsx` is deliberately absent:
 * `FormError` lives there and OWNS the crit ink, on a solid surface, which is the whole point.
 */
const FIRST_RUN_SOURCES = [
  ...GROUND_SCREENS,
  // (CuddleCue's SetupPicker, JoinStep and RolePicker, parts of its multi-step setup, are not in
  // NibbleCue: its setup is the one page above)
  // reachable while signed in, and the one screen that used to be exempt because it was the one
  // screen the decoration deliberately skipped (2026-09-22: there is no such screen any more)
  'src/screens/auth/NewPasswordScreen.tsx',
];

const read = (rel: string) => readFileSync(join(HERE, rel), 'utf8');

/** Every page whose `FormError` the placement check reads: the first run's, and Delete account. */
const FORM_ERROR_SOURCES = [...FIRST_RUN_SOURCES, 'src/screens/more/DeleteAccountScreen.tsx'];

/** What may hold a `FormError`: a card, or the panel that brings one with a refusal. */
const HOLDERS = new Set(['Card', 'ErrorPanel']);

const formErrors = (code: string): ts.Node[] => {
  const source = ts.createSourceFile(
    'x.tsx',
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const out: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText() === 'FormError'
    )
      out.push(node);
    node.forEachChild(visit);
  };
  visit(source);
  return out;
};

/** The `FormError`s in a piece of source with no card or panel among the elements round them. */
const bareIn = (code: string): string[] =>
  formErrors(code)
    .filter(el => {
      for (let up = el.parent; up !== undefined; up = up.parent)
        if (ts.isJsxElement(up) && HOLDERS.has(up.openingElement.tagName.getText())) return false;
      return true;
    })
    .map(el => {
      const { line } = el.getSourceFile().getLineAndCharacterOfPosition(el.getStart());
      return `line ${String(line + 1)}`;
    });

const bareFormErrors = (rel: string): string[] => bareIn(read(rel));
const formErrorCount = (rel: string): number => formErrors(read(rel)).length;

/**
 * The rule is "no status ink OUTSIDE FormError", not "no status ink". Inside a `<FormError>` the
 * message already sits on a solid surface, so a numeral in the same sentence must be able to take
 * the same crit ink — the age gate's refusal names a threshold, and every number a parent reads
 * goes through `Numeric`, which always sets its own color rather than inheriting one. Stripping
 * the FormError blocks first is what lets the scan state the real rule instead of a blunter one
 * that would have quietly pushed that numeral back into the body face.
 */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const outsideFormError = (src: string): string =>
  // Comments FIRST. The stripper is a raw-text regex, so a comment naming <FormError> without a
  // closing tag would otherwise swallow everything up to the next real </FormError> — including a
  // live status ink — and this file is full of comments that name it.
  stripComments(src).replace(/<FormError[\s\S]*?<\/FormError>/g, '');

/**
 * Tracked AND untracked-but-not-ignored, via `--cached --others --exclude-standard`. Plain
 * `ls-files` sees only what is staged, so a brand new screen that turned the ground on would be
 * invisible to this scan until someone remembered to `git add` it — which is precisely the moment
 * nobody is looking.
 */
const tsxFiles = (): string[] =>
  execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', SRC], {
    cwd: HERE,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(f => f && /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f));

describe('the first run keeps status ink off the lit ground', () => {
  it.each(FIRST_RUN_SOURCES)('%s writes no status ink of its own', rel => {
    const src = outsideFormError(read(rel));
    for (const ink of ['crit', 'warn', 'good']) {
      // Every spelling, not just the literal attribute: `ink="crit"`, `ink={'crit'}`, and the
      // conditional form `ink={bad ? 'crit' : 'text'}` that is the idiomatic way to write this
      // and would have walked straight past a substring check. Also `color={t.color.crit}`,
      // which reaches the same pixel by another route.
      const patterns = [
        new RegExp(`ink=\\{?["'\`]${ink}["'\`]`),
        new RegExp(`ink=\\{[^}]*["'\`]${ink}["'\`]`),
        new RegExp(`color=\\{[^}]*\\.${ink}\\b`),
      ];
      for (const re of patterns)
        expect(
          re.test(src),
          `${rel} inks text ${ink} directly (matched ${re}). Status strings go through ` +
            `<FormError>, which puts the message on a solid surface; on the lit ground crit is ` +
            `3.98:1 against a 4.5 floor.`,
        ).toBe(false);
    }
  });

  /**
   * WHERE THE LINE IS DRAWN, which is the whole of its contrast now that it has no box of its own:
   * inside a `Card`, or inside `ErrorPanel`, which lays a card behind a refusal (Sections.tsx).
   * Delete account is read too: it is the one page outside the first run that draws a FormError.
   */
  it.each(FORM_ERROR_SOURCES)('%s draws every FormError on a card, never bare on the page', rel => {
    expect(bareFormErrors(rel), `${rel}: a FormError with no card under it`).toEqual([]);
  });

  it('can tell a FormError on a card from one on the page', () => {
    const on = '<Card><View><FormError>x</FormError></View></Card>';
    const off = '<View><FormError>x</FormError></View>';
    expect(bareIn(`const a = ${on};`)).toEqual([]);
    expect(bareIn(`const a = ${off};`)).toHaveLength(1);
    // and the pages hold some: a scan that found none would pass by reading nothing
    // (NibbleCue's pages hold ten on 2026-10-08: its one-page setup has one where CuddleCue's steps had several)
    expect(
      FORM_ERROR_SOURCES.map(formErrorCount).reduce((a, b) => a + b, 0),
    ).toBeGreaterThanOrEqual(10);
  });

  it.each(FIRST_RUN_SOURCES)('%s passes no error prop to an Input', rel => {
    // Input renders its message as a bare <BodySm ink="crit"> on whatever is behind the field
    // (Input.tsx), which on these screens is the ground. Adopting Input.error needs a change to
    // Input.tsx — giving its message a solid backing — which is out of this pass's scope and is
    // recorded as an owner follow-up.
    expect(read(rel).includes('error={')).toBe(false);
  });
});

describe('the doodle pattern is the background of the whole app', () => {
  /**
   * WHAT IT DRAWS is the doodle pattern — two dozen faint nursery glyphs, `theme/ground.ts` — on
   * every screen since 2026-09-22, where it used to draw on five. `motif`, the four large hero
   * glyphs it replaced in setup on 2026-09-21, is not passed at all: `Ground` draws one or the
   * other and the pattern always won, so passing it was a no-op that read like a choice.
   */
  it('draws on every screen, on any skin, and only the dev switch turns it off', () => {
    const screen = read('src/app/Screen.tsx');
    expect(screen).toContain('<Ground width={width} height={height} pattern />');
    /*
      IT DRAWS WITHOUT A LIT SKIN. `lit` is true only where the household's skin paints washes or
      orbs, and the default skin is Paper, whose wash is zero — so gating the decoration on `lit`
      would mount it for nobody on the free plan, which is the bug the first-run pass fixed and
      this must not reintroduce. Night is handled inside `Ground`, where the pattern's alpha is 0.
    */
    expect(screen).toContain("const decorated = !env.off.has('ground');");
    expect(screen).toContain('{decorated ? (');
    // and no screen opts in or out: the prop that used to say so is gone
    expect(screen).not.toContain('ground?: boolean');
  });

  it('is nobody’s to ask for or refuse — no screen passes a ground prop', () => {
    const asking = tsxFiles()
      .filter(f => /<Screen[^>]*\bground(\s|=|>|\/)/s.test(read(f)))
      .sort();
    expect(asking).toEqual([]);
  });

  it('is never rendered by an app file directly', () => {
    // Screen owns the mount of the whole ground. A screen reaching for <Ground> itself would
    // place it inside the keyboard avoider, where `behavior="padding"` crops the bloom off the
    // foot of the page.
    const direct = tsxFiles().filter(f => f !== 'src/app/Screen.tsx' && /\bGround\b/.test(read(f)));
    expect(direct).toEqual([]);
  });

  /**
   * AND THE PAGES WITH NOTHING BETWEEN THEIR WORDS AND IT are still the ones the status-ink rule
   * is written for, so that list stays a list rather than becoming "every file". A chrome-less
   * SCREEN is the shape that needs it: no top bar, no card, no sheet material — just text on the
   * pattern. This is the reminder that finds the next one.
   *
   * `src/sheets` is deliberately out of scope though several of its files say `chrome={false}`
   * too: a sheet's content sits on `BottomSheet`'s own solid material, which is a surface the
   * contrast matrix measures, not on the ground. And `SetupPicker.tsx` is scanned above without
   * appearing here because it is a PART of the onboarding screen rather than a `<Screen>`.
   */
  it('names every chrome-less screen, so none is scanned by nobody', () => {
    const bare = tsxFiles()
      // `chrome={false}`, or any chrome that is not always on: NibbleCue's setup draws its page
      // chrome-less for a first family (`chrome={own}`), so it is one of these pages too
      .filter(
        f =>
          f.startsWith('src/screens/') && /<Screen[^>]*chrome=\{(?!true\})[^}]+\}/s.test(read(f)),
      )
      .sort();
    expect(bare).toEqual(GROUND_SCREENS);
  });
});
