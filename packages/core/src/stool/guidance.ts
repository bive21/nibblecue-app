/**
 * THE PUBLISHED SENTENCES ABOUT STOOLS, AND WHICH OF THEM THIS HOUSEHOLD IS SHOWN.
 *
 * `stool-guidance.us.2026_09.json` is the only place a sentence about stools may live
 * (CLAUDE.md §2 rule 5). This file reads it, validates its shape, and answers one question: of
 * the sentences in there, which apply to a household that feeds the way this one's log says it
 * feeds. It composes nothing, paraphrases nothing and rounds nothing — a screen shows a `quote`
 * exactly as the file carries it, under the name and date of the publication it came from.
 *
 * WHY FEEDING METHOD DECIDES. The two frequency sentences disagree, on purpose: the AAP says
 * infrequent stools are not in themselves a problem for a breastfed baby, and separately that a
 * formula-fed baby is expected to go about daily. Showing the second to a breastfeeding parent
 * is the false alarm this whole feature exists to avoid, so the formula sentence appears only
 * where the household's own log shows formula. The breast sentence and the straining sentence
 * are the two that LOWER alarm, so they are what an unreadable log falls back to: erring toward
 * "this is common" is the safe direction when the app cannot tell, and erring toward "expected
 * daily" is not.
 *
 * THE APP NEVER APPLIES A SENTENCE. It does not check the household's count against "at least
 * one bowel movement a day" and conclude anything, because the published condition has a second
 * half — straining — that this app has never seen and never will. It shows the count it did
 * measure, it shows the sentence, and it stops there. The parent is the one who knows whether
 * their baby is straining.
 */
import { z } from 'zod';
import stoolUs2026_09 from './../guidance/stool-guidance.us.2026_09.json';
import type { TodayActivity } from '../today/rows';

const Source = z.object({ name: z.string().min(1), url: z.string().url() });
const Sentence = z.object({
  sourceId: z.string().min(1),
  quote: z.string().min(20),
  alsoQuote: z.string().min(20).optional(),
});
const AskItem = z.object({
  id: z.string().min(1),
  text: z.string().min(5),
  sourceId: z.string().min(1),
  quote: z.string().min(20),
});

const File = z.object({
  profile: z.literal('US_PUBLISHED'),
  topic: z.literal('stool'),
  version: z.string().min(1),
  retrievedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  disclaimer: z.string().min(20),
  $retrieval: z.object({
    channel: z.string().min(1),
    why: z.string().min(20),
    ownerAction: z.string().min(20),
    verified: z.string().nullable(),
  }),
  sources: z.record(z.string(), Source),
  spacing: z.object({ breast: Sentence, formula: Sentence, straining: Sentence }),
  askAbout: z.object({ items: z.array(AskItem).min(1) }),
});

/**
 * Parsed once at module load, so a malformed guidance file is a failing test rather than a
 * screen that renders `undefined` at 3 a.m.
 */
const GUIDANCE = File.parse(stoolUs2026_09);

/** The file's own identity, for the "where this came from" line every surface shows. */
export const STOOL_GUIDANCE_RETRIEVED = GUIDANCE.retrievedOn;
export const STOOL_DISCLAIMER = GUIDANCE.disclaimer;
/** Null until the owner has opened each page and confirmed the wording (see the file's $retrieval). */
export const STOOL_GUIDANCE_VERIFIED: string | null = GUIDANCE.$retrieval.verified;

export type FeedingMode = 'BREAST' | 'FORMULA' | 'MIXED' | 'UNKNOWN';

/** Below this many feeds in the window there is nothing to read a pattern off. */
const FEEDING_MODE_MIN_FEEDS = 5;
/** A share at or past this makes one method "how this household feeds". */
const FEEDING_MODE_DOMINANT = 0.8;

/**
 * How this household feeds, READ OFF ITS OWN LOG rather than asked again.
 *
 * Breastfeeds and bottles of expressed milk both count as breast milk; formula bottles count as
 * formula; water and "other" are neither and are ignored. Onboarding asked this question once,
 * but a household's answer in week one is often not what week twelve looks like, and the log is
 * the version that stays current without anybody maintaining it.
 */
export function feedingMode(rows: readonly TodayActivity[]): FeedingMode {
  let breast = 0;
  let formula = 0;
  for (const r of rows) {
    if (r.type === 'breastfeed') breast += 1;
    else if (r.type === 'bottle') {
      if (r.bottleKind === 'FORMULA') formula += 1;
      else if (r.bottleKind === 'EBM') breast += 1;
      else if (r.bottleKind === 'MIXED') {
        breast += 1;
        formula += 1;
      }
    }
  }
  const total = breast + formula;
  if (total < FEEDING_MODE_MIN_FEEDS) return 'UNKNOWN';
  if (formula / total >= FEEDING_MODE_DOMINANT) return 'FORMULA';
  if (breast / total >= FEEDING_MODE_DOMINANT) return 'BREAST';
  return 'MIXED';
}

export interface PublishedSentence {
  /** The publisher's own words, shown as a quotation and never edited. */
  quote: string;
  /** The publication's name, shown beside it. */
  source: string;
  url: string;
}

const sentence = (s: { sourceId: string; quote: string }): PublishedSentence => {
  const src = GUIDANCE.sources[s.sourceId];
  // the schema cannot express "every sourceId is a key of sources", so it is checked here and
  // the test below covers every sentence in the file
  if (src === undefined) throw new Error(`stool guidance: unknown sourceId ${s.sourceId}`);
  return { quote: s.quote, source: src.name, url: src.url };
};

/**
 * The sentences a household in this feeding mode is shown, in reading order.
 *
 * `MIXED` gets both frequency sentences because both apply to it, and a parent who feeds both
 * ways is the one person able to tell which half of their week a sentence is about.
 */
export function spacingFor(mode: FeedingMode): PublishedSentence[] {
  const out: PublishedSentence[] = [];
  if (mode === 'BREAST' || mode === 'MIXED' || mode === 'UNKNOWN') {
    out.push(sentence(GUIDANCE.spacing.breast));
    const also = GUIDANCE.spacing.breast.alsoQuote;
    if (also !== undefined) {
      out.push(sentence({ sourceId: GUIDANCE.spacing.breast.sourceId, quote: also }));
    }
  }
  if (mode === 'FORMULA' || mode === 'MIXED') out.push(sentence(GUIDANCE.spacing.formula));
  out.push(sentence(GUIDANCE.spacing.straining));
  return out;
}

export interface AskAboutItem {
  id: string;
  /** The app's own short label for the list. Plain, and never matched against any entry. */
  text: string;
  quote: string;
  source: string;
  url: string;
}

/** What the publications say to ask a clinician about — the list, whole, in the file's order. */
export function askAbout(): AskAboutItem[] {
  return GUIDANCE.askAbout.items.map(i => ({ ...i, ...sentence(i) }));
}

/** Every quote in the file, for the test that checks each one against its source entry. */
export function allSentences(): PublishedSentence[] {
  return [
    ...spacingFor('MIXED'),
    ...askAbout().map(i => ({ quote: i.quote, source: i.source, url: i.url })),
  ];
}
