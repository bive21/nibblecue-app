/**
 * ONE STYLE PER ROLE (docs/DESIGN_SYSTEM.md §4.1). The owner flagged five screens on 2026-09-30 for
 * the same fault, two texts doing one job drawn two ways, and then asked for all of them: *"Check
 * all with multiple formats texts on the same section like I mentioned before and now this one.
 * Fix this too."* The sweep that answered went through every screen and sheet by hand. This holds
 * the three shapes of the fault a scan can see without judging what a sentence is for:
 *
 *   1. AN ERROR LINE IS `BodySm` IN `crit`. A failed save said itself in `Body`, `BodyStrong` and
 *      `BodySm` on three sheets, so the same news arrived at three sizes, and a field's own error
 *      (`Input`) is `BodySm`. `FormError`, the sign-in flow's boxed banner, was the one exception
 *      until the owner's rule 4 of 2026-09-30 (below) made it the same line; there is none now.
 *   2. A TEXT ROLE TAKES NO SIZE OF ITS OWN. `Meta` at 12.5 beside `Meta` at 12 and `BodySm` at 13
 *      was most of what the sweep found: a row's line drawn a half point off the row beside it,
 *      because each screen tuned its own. A role is its size; a line that needs another size needs
 *      another role. What is allowed is listed below, with why.
 *   3. AN EXPLANATION IS THE HINT, `BodySm`. `Body` in `text2` is an explanation drawn a size up,
 *      and both in one parent was the owner's screenshot exactly (Import's lede a size over the line
 *      under it). This check first refused the two side by side and let a flow explain itself in
 *      `Body` throughout (the sign-in pages did); since the owner's rule 3 of 2026-09-30 (below) it
 *      refuses `Body` in `text2` outright, everywhere.
 *
 * And the four rules the owner took on the same evening, one each, all four up for their review
 * (docs/DESIGN_SYSTEM.md §4.1, 2026-09-30):
 *
 *   4. A PAGE'S NAME IS ONE OF TWO SIZES, AND NO TITLE TAKES A SIZE OF ITS OWN. A tab page (the tab
 *      bar reaches it, no back arrow) is named with `TabTitle`, 28; a page opened from another page
 *      (a back arrow) with `H1`, 23, whether `Screen`'s pushed bar draws it or the page does. The
 *      page titles came in three sizes because two of them were made by passing `fontSize: 28` to
 *      `h1`; so `H1`, `H2`, `TabTitle` and every `variant` of theirs refuse a `fontSize` outright,
 *      and every page in the navigator is held to its kind.
 *   5. ONE HEADING KIND PER PAGE, decided by what the page mostly holds. The two card-grid pages,
 *      What you track and Reports, head every group with the section title (h2, 18); every other
 *      page, the settings pages, Today, the stash and the rest, heads every group with the eyebrow
 *      (the small gray capitals). Read group by group, a page alternated the two between sections
 *      at one level, and a consistent look is what the owner values most. So a group heading on
 *      those two pages that is not a title is refused, and so is a section title anywhere else: a
 *      `SectionHeader` title, a `kind="title"`, or a page's own heading component that draws one.
 *   6. EVERY INTRO LINE, LEDE, HINT OR EXPLANATION IS `BodySm` IN `text2`: the sign-in flow's
 *      blurbs, Delete account, the invite-code sheet, the handoff guide, the plan prompt, Today's
 *      travel card and the team's message were `Body` in `text2`, a size over every other page's.
 *      Rule 3 above is its check. An entry in `BODY_TEXT2` is allowed only with a written reason
 *      why the text is not an explanation at all; there is one, a stash row's container word.
 *   7. EVERY ERROR IS ONE SMALL RED LINE, `BodySm` in `crit`, announced: the sign-in flow's
 *      boxed `FormError` lost its box and its glyph and is that line too. Rule 1 above is its
 *      check, with no exception left. (What keeps the line off the page's ground, where crit fails
 *      the contrast floor, is where it is drawn: `first-run/ground-usage.test.ts`.)
 *
 * It reads the source with TypeScript's own parser, so an attribute on its own line, a conditional
 * child, or a comment that names a role are all seen for what they are.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (path.endsWith('.tsx') && !path.endsWith('.test.tsx')) out.push(path);
  }
  return out;
};

const parse = (root: string, prefix: string) =>
  walk(root).map(path => ({
    rel: prefix + relative(root, path).split('\\').join('/'),
    source: ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    ),
  }));

const FILES = parse(here, '');

/**
 * THE DESIGN SYSTEM'S OWN COMPONENTS, for the explanation check alone: `StepHeader` draws the blurb
 * of every sign-in and setup page, so an explanation drawn a size up there is on a dozen pages.
 * (A component there may give a role a size it measures itself — the monogram in `Mark`, a tab's
 * label — which is why the size checks read the app's screens and sheets only.)
 */
const UI_FILES = parse(join(here, '../../../packages/ui/src/components'), 'ui:');

/** The design system's role components (packages/ui Text.tsx), by the name a screen imports. */
const ROLES = new Set(['Body', 'BodySm', 'BodyStrong', 'Meta', 'Label', 'Caption']);

/** The title roles (§4.1 rule 1), as components and as the `variant` any text component takes. */
const TITLE_TAGS = new Set(['TabTitle', 'H1', 'H2']);
const TITLE_VARIANTS = new Set(['tabTitle', 'h1', 'h2']);

type Opening = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

const tagOf = (el: Opening): string => el.tagName.getText();

/** A string attribute's value, `ink="crit"` or `ink={'crit'}`; null for anything computed. */
function stringProp(el: Opening, name: string): string | null {
  for (const p of el.attributes.properties) {
    if (!ts.isJsxAttribute(p) || p.name.getText() !== name || p.initializer === undefined) continue;
    const init = p.initializer;
    if (ts.isStringLiteral(init)) return init.text;
    if (ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression))
      return init.expression.text;
    return null;
  }
  return null;
}

const propText = (el: Opening, name: string): string | null => {
  for (const p of el.attributes.properties)
    if (ts.isJsxAttribute(p) && p.name.getText() === name && p.initializer !== undefined)
      return p.initializer.getText();
  return null;
};

function openings(node: ts.Node, out: Opening[] = []): Opening[] {
  if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) out.push(node);
  node.forEachChild(child => void openings(child, out));
  return out;
}

const where = (rel: string, el: Opening): string => {
  const { line } = el.getSourceFile().getLineAndCharacterOfPosition(el.getStart());
  return `${rel}:${line + 1} <${tagOf(el)}>`;
};

/**
 * How a text element explains: `Body` in `text2`, or the hint, `BodySm` in its own `text2` (a
 * `BodySm` given another ink or a color of its own is saying something else: a status, a figure's
 * word, an error).
 */
function explains(el: Opening): 'body' | 'hint' | null {
  const tag = tagOf(el);
  const variant = tag === 'AppText' ? stringProp(el, 'variant') : null;
  const ink = stringProp(el, 'ink');
  const inked = propText(el, 'ink') !== null;
  if (propText(el, 'color') !== null) return null;
  if ((tag === 'Body' || variant === 'body') && ink === 'text2') return 'body';
  if (tag === 'BodySm' && (!inked || ink === 'text2')) return 'hint';
  if (variant === 'bodySm' && ink === 'text2') return 'hint';
  return null;
}

/**
 * A parent's children as the eye meets them: the elements themselves, and the ones a condition
 * puts there (`{x ? <BodySm/> : null}`, `{x && <Body/>}`), which sit in the same column.
 */
function childOpenings(parent: ts.JsxElement): Opening[] {
  const out: Opening[] = [];
  const take = (node: ts.Node): void => {
    if (ts.isJsxElement(node)) out.push(node.openingElement);
    else if (ts.isJsxSelfClosingElement(node)) out.push(node);
    else if (ts.isJsxExpression(node) && node.expression) take(node.expression);
    else if (ts.isParenthesizedExpression(node)) take(node.expression);
    else if (ts.isConditionalExpression(node)) {
      take(node.whenTrue);
      take(node.whenFalse);
    } else if (ts.isBinaryExpression(node)) take(node.right);
    else if (ts.isJsxFragment(node)) node.children.forEach(take);
  };
  parent.children.forEach(take);
  return out;
}

function parents(node: ts.Node, out: ts.JsxElement[] = []): ts.JsxElement[] {
  if (ts.isJsxElement(node)) out.push(node);
  node.forEachChild(child => void parents(child, out));
  return out;
}

/**
 * THE TWO PAGES OF SECTION TITLES (§4.1 rule 2), each with the files that draw its groups. Every
 * other page heads its groups with the eyebrow.
 */
const TITLE_PAGES: readonly { page: string; files: readonly string[] }[] = [
  // (CuddleCue's two, What you track and Reports, are not in NibbleCue: every NibbleCue page heads
  // its groups with the eyebrow, which the case below holds)
];
const TITLE_FILES = new Set(TITLE_PAGES.flatMap(p => p.files));

/**
 * A SECTION TITLE IN A FILE TWO PAGES SHARE, with why and how many. Each is held to its count, so
 * the allowance cannot grow without an edit here.
 */
const SHARED_TITLES: readonly { file: string; titles: number; reason: string }[] = [
  // (CuddleCue's setup picker drew What you track's groups; neither is in NibbleCue)
];

/** A page's own heading component, by its name: the stash's `Eyebrow`, the lists' `SectionCaption`. */
const HEADING_NAME = /(Heading|Header|Head|Caption|Eyebrow)$/;

/**
 * A group's heading and its kind, where the element says so: `SectionHeader` (its `tab` and `page`
 * variants are a page's own name, rule 1, not a group's), the pages' own eyebrows, and the eyebrow
 * roles given the header role.
 */
function groupHeading(el: Opening): 'title' | 'eyebrow' | null {
  const tag = tagOf(el);
  const variant = stringProp(el, 'variant');
  if (tag === 'SectionHeader') {
    if (variant === 'tab' || variant === 'page') return null;
    return variant === 'title' ? 'title' : 'eyebrow';
  }
  if (tag === 'CaptionRow' || tag === 'SectionCaption' || tag === 'Eyebrow') return 'eyebrow';
  const eyebrowRole =
    tag === 'Label' ||
    tag === 'Caption' ||
    (tag === 'AppText' && (variant === 'label' || variant === 'caption'));
  return eyebrowRole && stringProp(el, 'accessibilityRole') === 'header' ? 'eyebrow' : null;
}

/** The section title's form, however it is asked for: h2, or a heading's `title` kind. */
const sectionTitleForm = (el: Opening): boolean =>
  tagOf(el) === 'H2' ||
  stringProp(el, 'variant') === 'h2' ||
  (tagOf(el) === 'SectionHeader' && stringProp(el, 'variant') === 'title') ||
  stringProp(el, 'kind') === 'title';

/** Each component a file declares at its top level, with its body. */
function components(source: ts.SourceFile): { name: string; body: ts.Node }[] {
  const out: { name: string; body: ts.Node }[] = [];
  for (const st of source.statements) {
    if (ts.isFunctionDeclaration(st) && st.name !== undefined && st.body !== undefined)
      out.push({ name: st.name.text, body: st.body });
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      const init = d.initializer;
      if (!ts.isIdentifier(d.name) || init === undefined) continue;
      if (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
        out.push({ name: d.name.text, body: init.body });
    }
  }
  return out;
}

/**
 * THE SIZES A ROLE MAY STILL BE GIVEN, each for a reason that is not "this screen liked it":
 *   · the link face, `BodyStrong` at the hint's size, which is `SectionHeader`'s own action face
 *     (`SectionActionButton`) wherever a screen draws a link of its own;
 *   · the Schedule's Reminders button, whose word sits under its bell inside a 44 pt square: a
 *     control's label, pinned by `duty/duty.test.ts`;
 *   · the sleep diary's day labels on Reports, scaled with the chart to fit their column
 *     (`diaryFit`): a size the layout measures, not one a screen chose.
 */
const SIZED: readonly { file: string; tag: string; style: RegExp }[] = [
  // (CuddleCue's three, on its Vaccines, Schedule and Reports pages, went with those pages: no
  // NibbleCue page gives a role a size of its own)
];

/**
 * `Body` IN `text2` THAT IS NOT AN EXPLANATION, each with why (§4.1 rule 3, 2026-09-30). The
 * invite-code sheet's allowance (its page's blurb was `Body`, its footnote `BodySm`, "a screen
 * apart") went with the rule that made every intro line the hint. What is left is not a sentence.
 */
const BODY_TEXT2: readonly { file: string; tag: string; reason: string }[] = [
  // (CuddleCue's three, the Schedule hero's Skip, a stash row's name and the pump's Started column,
  // went with those pages)
];

describe('one style per role', () => {
  it('draws every error line in BodySm, in crit', () => {
    const wrong: string[] = [];
    for (const { rel, source } of FILES) {
      for (const el of openings(source)) {
        if (stringProp(el, 'ink') !== 'crit') continue;
        const tag = tagOf(el);
        const small =
          tag === 'BodySm' || (tag === 'AppText' && stringProp(el, 'variant') === 'bodySm');
        if (!small) wrong.push(where(rel, el));
      }
    }
    expect(wrong, 'an error line in a role other than BodySm crit').toEqual([]);
  });

  it('gives no text role a size of its own', () => {
    const wrong: string[] = [];
    for (const { rel, source } of FILES) {
      for (const el of openings(source)) {
        const tag = tagOf(el);
        if (!ROLES.has(tag)) continue;
        const style = propText(el, 'style');
        if (style === null || !/fontSize/.test(style)) continue;
        if (SIZED.some(s => s.file === rel && s.tag === tag && s.style.test(style))) continue;
        wrong.push(where(rel, el));
      }
    }
    expect(wrong, 'a role given a font size by the screen that draws it').toEqual([]);
  });

  it('gives no title a size of its own, not even one', () => {
    // a title is its role's size (§4.1 rule 1): Schedule and Routine drew 28 as `h1` with a
    // `fontSize`, and the Schedule's next slot 20 as `h2` with one; there is no allowance here
    const wrong: string[] = [];
    for (const { rel, source } of FILES) {
      for (const el of openings(source)) {
        const variant = stringProp(el, 'variant');
        if (!TITLE_TAGS.has(tagOf(el)) && !(variant !== null && TITLE_VARIANTS.has(variant)))
          continue;
        const style = propText(el, 'style');
        if (style !== null && /fontSize/.test(style)) wrong.push(where(rel, el));
      }
    }
    expect(wrong, 'a title given a font size by the screen that draws it').toEqual([]);
  });

  // (no page of section titles in NibbleCue, so every page is held by the case below)

  it('heads no group with the section title on any other page', () => {
    const wrong: string[] = [];
    const shared = new Map<string, number>();
    for (const { rel, source } of FILES) {
      if (TITLE_FILES.has(rel)) continue;
      const allowance = SHARED_TITLES.find(s => s.file === rel);
      for (const el of openings(source)) {
        const title = groupHeading(el) === 'title' || stringProp(el, 'kind') === 'title';
        if (!title) continue;
        if (allowance) shared.set(rel, (shared.get(rel) ?? 0) + 1);
        else wrong.push(`${where(rel, el)}: a section title on a page of eyebrows`);
      }
      // and no page's own heading component draws one, whatever it is asked for
      for (const c of components(source)) {
        if (!HEADING_NAME.test(c.name)) continue;
        for (const el of openings(c.body))
          if (sectionTitleForm(el))
            wrong.push(`${where(rel, el)}: ${c.name} draws a section title`);
      }
    }
    expect(wrong, 'a section title outside What you track and Reports').toEqual([]);
    for (const s of SHARED_TITLES) expect(shared.get(s.file) ?? 0, s.file).toBe(s.titles);
  });

  it('explains in BodySm, never in Body in text2', () => {
    const wrong: string[] = [];
    for (const { rel, source } of [...FILES, ...UI_FILES]) {
      for (const el of openings(source)) {
        if (explains(el) !== 'body') continue;
        if (BODY_TEXT2.some(a => a.file === rel && a.tag === tagOf(el))) continue;
        wrong.push(where(rel, el));
      }
    }
    expect(wrong, 'an explanation drawn in Body, a size over the hint').toEqual([]);
    // and the design system's own pages are read, StepHeader's blurb among them
    expect(UI_FILES.some(f => f.rel === 'ui:StepHeader.tsx')).toBe(true);
  });

  it('allows nothing for a file that is not there', () => {
    const allowed = [...SIZED, ...BODY_TEXT2, ...SHARED_TITLES].map(a => a.file);
    const read = new Set(FILES.map(f => f.rel));
    expect(allowed.filter(f => !read.has(f))).toEqual([]);
  });

  it('can see each shape it looks for', () => {
    // the scan is only worth something if it would have caught what the sweep fixed
    const probe = (code: string) =>
      ts.createSourceFile('probe.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const crit = openings(probe('const a = <Body ink="crit">x</Body>;'));
    expect(crit.map(el => stringProp(el, 'ink'))).toEqual(['crit']);
    const sized = openings(probe('const a = <Meta style={{ fontSize: 12.5 }}>x</Meta>;'));
    expect(propText(sized[0]!, 'style')).toMatch(/fontSize/);
    const pair = parents(
      probe('const a = <View><Body ink="text2">x</Body>{y ? <BodySm>z</BodySm> : null}</View>;'),
    )[0]!;
    expect(childOpenings(pair).map(explains)).toEqual(['body', 'hint']);
    const title = openings(
      probe('const a = <AppText variant="h1" style={{ fontSize: 28 }}>x</AppText>;'),
    )[0]!;
    expect(TITLE_VARIANTS.has(stringProp(title, 'variant') ?? '')).toBe(true);
    expect(propText(title, 'style')).toMatch(/fontSize/);
    // a group heading's kind, however it is drawn, and a page's own heading drawing a title
    const heads = openings(
      probe(
        'const a = <View><SectionHeader title="a" variant="title" /><SectionHeader title="b" />' +
          '<SectionHeader title="c" variant="page" /><Label accessibilityRole="header">d</Label>' +
          '<Label>e</Label><Eyebrow label="f" /></View>;',
      ),
    ).slice(1);
    expect(heads.map(groupHeading)).toEqual(['title', 'eyebrow', null, 'eyebrow', null, 'eyebrow']);
    const own = components(
      probe(
        'export function StashHeading({ kind }) { return kind === "title" ? ' +
          '<AppText variant="h2">x</AppText> : <Label>x</Label>; }\n' +
          'const Other = () => <H2>y</H2>;',
      ),
    );
    expect(own.map(c => c.name)).toEqual(['StashHeading', 'Other']);
    expect(own.filter(c => HEADING_NAME.test(c.name)).map(c => c.name)).toEqual(['StashHeading']);
    expect(openings(own[0]!.body).some(sectionTitleForm)).toBe(true);
    expect(
      sectionTitleForm(openings(probe('const a = <Eyebrow kind="title" label="x" />;'))[0]!),
    ).toBe(true);
  });
});

/**
 * EVERY PAGE, BY ITS KIND (§4.1 rule 1), read out of the navigator itself: each `Tabs.Screen` and
 * `Root.Screen`, the component it names and the file that component is imported from.
 *
 *   · A TAB PAGE, every `Tabs.Screen` but Today (which keeps no title: the chrome belongs to the
 *     baby), names itself once, at 28: `TabTitle`, or `SectionHeader variant="tab"`. Reports is
 *     not one of them (2026-10-03): it is a pushed page, named at 23, with Back.
 *   · Every other page never does. One that draws its own heading (`titleInBar={false}`) draws it
 *     as `H1` or `SectionHeader variant="page"`, the pushed bar's own 23.
 */
describe('page titles, two sizes', () => {
  const navPath = join(here, 'app/navigation.tsx');
  const navSource = ts.createSourceFile(
    navPath,
    readFileSync(navPath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  /** Each imported name, and the file it comes from, relative to `src`. */
  const from = new Map<string, string>();
  for (const st of navSource.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const spec = st.moduleSpecifier.text;
    if (!spec.startsWith('.')) continue;
    const named = st.importClause?.namedBindings;
    if (named === undefined || !ts.isNamedImports(named)) continue;
    for (const el of named.elements)
      from.set(
        el.name.text,
        relative(here, join(here, 'app', spec))
          .split('\\')
          .join('/') + '.tsx',
      );
  }
  /** The navigator's own containers, declared in the file (`AppTabs`): their pages are listed. */
  const local = new Set(
    navSource.statements.flatMap(st =>
      ts.isFunctionDeclaration(st) && st.name !== undefined ? [st.name.text] : [],
    ),
  );
  const pages = openings(navSource)
    .filter(el => /^(Tabs|Root)\.Screen$/.test(tagOf(el)))
    .filter(el => !local.has(propText(el, 'component')?.replace(/[{}\s]/g, '') ?? ''))
    .map(el => {
      const component = propText(el, 'component')?.replace(/[{}\s]/g, '') ?? '';
      return {
        tab: tagOf(el) === 'Tabs.Screen',
        name: stringProp(el, 'name') ?? '',
        file: from.get(component) ?? `(no import for ${component})`,
      };
    });
  const byFile = new Map(FILES.map(f => [f.rel, f.source]));
  /** What a page's own file draws: its tab titles, its pushed headings, and whether it has a bar title. */
  const titlesOf = (file: string) => {
    const source = byFile.get(file);
    if (source === undefined) return null;
    let tab = 0;
    let pushed = 0;
    let ownHeading = false;
    for (const el of openings(source)) {
      const tag = tagOf(el);
      const variant = stringProp(el, 'variant');
      if (tag === 'TabTitle' || (tag === 'SectionHeader' && variant === 'tab')) tab++;
      if (tag === 'H1' || (tag === 'SectionHeader' && variant === 'page')) pushed++;
      if (tag === 'Screen' && propText(el, 'titleInBar')?.replace(/\s/g, '') === '{false}')
        ownHeading = true;
    }
    return { tab, pushed, ownHeading };
  };

  it('finds every page the navigator registers', () => {
    // NibbleCue's navigator: 36 pages on 2026-10-08, and its five tabs
    expect(pages.length).toBeGreaterThan(30);
    expect(pages.filter(p => p.tab).map(p => p.name)).toEqual([
      'Today',
      'PlanTab',
      'Foods',
      'Shopping',
      'More',
    ]);
    const unread = pages.filter(p => titlesOf(p.file) === null).map(p => `${p.name}: ${p.file}`);
    expect(unread, 'a page whose file the scan cannot read').toEqual([]);
  });

  it('names a tab page once, at 28, and Today not at all', () => {
    const wrong: string[] = [];
    for (const p of pages.filter(x => x.tab)) {
      const t = titlesOf(p.file)!;
      const want = p.name === 'Today' ? 0 : 1;
      if (t.tab !== want || t.pushed !== 0)
        wrong.push(`${p.name} (${p.file}): ${String(t.tab)} at 28, ${String(t.pushed)} at 23`);
    }
    expect(wrong, 'a tab page without its one large title').toEqual([]);
  });

  it('names every other page at 23, and never at 28', () => {
    const wrong: string[] = [];
    for (const p of pages.filter(x => !x.tab)) {
      const t = titlesOf(p.file)!;
      if (t.tab > 0) wrong.push(`${p.name} (${p.file}): a tab page's title`);
      if (t.ownHeading && t.pushed === 0)
        wrong.push(`${p.name} (${p.file}): draws its own heading, but not as H1`);
    }
    expect(wrong, 'a page opened from another page, named at the wrong size').toEqual([]);
  });
});
