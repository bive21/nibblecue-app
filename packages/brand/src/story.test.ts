import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IN_APP_STRINGS } from './index';
import { repoRoot } from './repo-root';

/**
 * WHO MADE IT (the owner, 2026-09-27; docs/BRANDING.md §2c): the tagline ("By new parents, for every
 * parent.") at the foot of the sign-up page and of More, the whole story on About, and one quiet
 * line under what Plus adds — and nowhere else in the app. The placement test already keeps every
 * brand string out of Today and the logging loop; this holds the story to its surfaces and to the
 * voice the app is written in.
 */
const APP = 'apps/mobile/src';
const read = (rel: string): string => readFileSync(join(repoRoot(), APP, rel), 'utf8');

const STORY = {
  familyLine: IN_APP_STRINGS.familyLine,
  footerLine: IN_APP_STRINGS.footerLine,
  aboutStoryTitle: IN_APP_STRINGS.aboutStoryTitle,
  aboutStory: IN_APP_STRINGS.aboutStory,
  aboutArt: IN_APP_STRINGS.aboutArt,
  aboutPlus: IN_APP_STRINGS.aboutPlus,
  contactNote: IN_APP_STRINGS.contactNote,
  planWhy: IN_APP_STRINGS.planWhy,
};

describe('the family story', () => {
  it('is written in the app’s voice: short, no em dash, no claim about a baby', () => {
    for (const [key, line] of Object.entries(STORY)) {
      expect(line.trim(), key).not.toBe('');
      expect(line, key).not.toMatch(/—|–/);
      // never a promise about a baby's health or development (CLAUDE.md §2 rules 1 and 3)
      expect(line, key).not.toMatch(/\b(sleep better|healthier|development|thrive|advice)\b/i);
    }
    // a footer is one line
    expect(STORY.familyLine.length).toBeLessThanOrEqual(48);
    expect(STORY.footerLine.length).toBeLessThanOrEqual(48);
  });

  it('never asks anyone to pay for the family, only says what Plus pays for (rule 14)', () => {
    expect(STORY.aboutPlus).toMatch(/^Plus pays for /);
    expect(STORY.planWhy).toMatch(/^Plus pays for /);
    // not beside the family story (the owner, 2026-09-27: "mentioning made by two new parents and
    // plus pay for server and maintenance made it too obviously"): that is told on About
    expect(STORY.planWhy).not.toMatch(/parent|family|kids/i);
    for (const line of [STORY.aboutPlus, STORY.planWhy]) {
      expect(line).not.toMatch(/\b(please|support us|help us|donat)/i);
    }
  });

  it('says where the money goes under what Plus adds, on the Plan page and the paywall alike', () => {
    const lists = read('plan/PlanLists.tsx');
    // once, as the Plus card's footnote, in the secondary ink
    expect(lists.split('IN_APP_STRINGS.planWhy').length - 1).toBe(1);
    const plusCard = lists.slice(
      lists.indexOf('IN_APP_STRINGS.paywallTitle'),
      lists.indexOf('FREE_ALWAYS, free'),
    );
    expect(plusCard).toContain('IN_APP_STRINGS.planWhy');
    expect(lists).toMatch(/<BodySm ink="text2" testID=\{`\$\{testID\}\.why`\}/);
    // and both surfaces draw that one component
    expect(read('screens/account/PlanScreen.tsx')).toContain('<PlanLists');
    expect(read('sheets/GateSheet.tsx')).toContain('<PlanLists');
  });

  /**
   * THE DOOR IN IS SIGNED AT ITS FOOT (the owner, 2026-09-28: *"from one new family to another should
   * be in the footer instead. add the cuddlecue icon logo and then by BP&C Creative Studio, follow by
   * the tagline"*; the tagline they chose over that line the same day). The mark, the developer name
   * read from the brand, then the tagline, after everything else on the page, and nothing under the
   * welcome any more.
   */
  it('signs the foot of the door in: the mark, by the developer, the tagline', () => {
    const foot = read('screens/auth/AuthSignature.tsx');
    // the last of each: the element's spoken label names them too, first
    const mark = foot.lastIndexOf('source={MARK_SOURCE}');
    const by = foot.lastIndexOf('{`by ${BRAND.developerName}`}');
    const line = foot.lastIndexOf('{IN_APP_STRINGS.footerLine}');
    expect(mark).toBeGreaterThan(-1);
    expect(by).toBeGreaterThan(mark);
    expect(line).toBeGreaterThan(by);
    const auth = read('screens/auth/AuthScreen.tsx');
    // the last thing on the page a parent reads, after the invite card and the accounts line
    const page = auth.slice(auth.lastIndexOf('<Screen chrome={false} testID="auth">'));
    expect(page.indexOf('<AuthSignature />')).toBeGreaterThan(
      page.indexOf('Accounts are per person.'),
    );
    expect(read('screens/auth/NewPasswordScreen.tsx')).toContain('<AuthSignature />');
    expect(auth).not.toContain('signUpSignoff');
    expect(IN_APP_STRINGS).not.toHaveProperty('signUpSignoff');
  });

  /**
   * THE FOOTER IS A TAGLINE, NOT THE FAMILY LINE (the owner, 2026-09-27: "dad develops mom design
   * baby approved on the footer of more page, this should be the made by new parents for new
   * parents … the sentence it has now just feels like it doesn't belong. this should be our tagline
   * if anything"). The family line is part of the story, and stays in it, on About.
   */
  it('signs the More footer, inside the button that opens About, with the tagline', () => {
    const more = read('screens/more/MoreScreen.tsx');
    const button = more.slice(more.indexOf('testID="more.about"'), more.indexOf('</Pressable>'));
    expect(button).toContain('{IN_APP_STRINGS.footerLine}');
    expect(more).not.toContain('IN_APP_STRINGS.familyLine');
    // The first half is who made it; the second is the reader, who may not be a new parent any more
    // (the owner, 2026-09-28: "what if the user is not a new parent anymore?").
    const [by, forWhom] = STORY.footerLine.split(', ');
    expect(by).toBe('By new parents');
    expect(forWhom).not.toMatch(/new/i);
  });

  it('is told in full on About, right under the version', () => {
    const about = read('sheets/AboutSheet.tsx');
    for (const key of ['aboutStoryTitle', 'aboutStory', 'familyLine', 'aboutArt', 'aboutPlus']) {
      expect(about).toContain(`IN_APP_STRINGS.${key}`);
    }
    expect(about.indexOf('testID="about.story"')).toBeGreaterThan(about.indexOf('about.version'));
    expect(about.indexOf('testID="about.story"')).toBeLessThan(about.indexOf('about.terms'));
    expect(about).toContain('detail={IN_APP_STRINGS.contactNote}');
  });
});
