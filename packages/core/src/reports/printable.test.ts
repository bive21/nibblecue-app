/**
 * The printable document (PRODUCT_SPEC.md §8; CLAUDE.md §4).
 *
 * The renderer must add NOTHING: no word of its own, no judgment, no fetch. So this asserts the
 * sheet's content survives intact, that a name with a quote in it cannot break the document, that
 * the file reaches for nothing on a network, and that the rendered words still pass the same lint
 * every other report output passes.
 */
import { describe, expect, it } from 'vitest';
import { reportBannedHits } from './observations';
import { escapeHtml, printableHtml } from './printable';
import type { VisitSheet } from './visitSheet';
import { VISIT_CAVEAT, VISIT_TITLE } from './visitSheet';

const SHEET: VisitSheet = {
  title: VISIT_TITLE,
  header: [
    { label: 'Child', value: 'Emma' },
    { label: 'Period covered', value: 'Sep 10 – Sep 16', note: 'over 7 days' },
  ],
  sections: [
    {
      key: 'feeding',
      title: 'Feeding',
      rows: [{ label: 'Bottles a day', value: '6.0', note: '42 bottles in total' }],
      empty: 'No feeds logged in this period.',
    },
    { key: 'sleep', title: 'Sleep', rows: [], empty: 'No sleep logged in this period.' },
    { key: 'growth', title: 'Measurements', rows: [] },
  ],
  caveat: VISIT_CAVEAT,
};

/** The document as a person reads it: the stylesheet is not prose and is not scanned as any. */
const visibleText = (html: string): string =>
  html
    .replace(/<style>[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

describe('the document carries the sheet and nothing else', () => {
  const html = printableHtml(SHEET);

  it('is a complete standalone HTML file', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('names itself in the title, which is what a print dialog offers as the file name', () => {
    expect(html).toContain(`<title>${VISIT_TITLE}</title>`);
    expect(html).toContain(`<h1>${VISIT_TITLE}</h1>`);
  });

  it('renders every header row, every section and every row inside it', () => {
    const text = visibleText(html);
    expect(text).toContain('Child Emma');
    expect(text).toContain('Period covered Sep 10 – Sep 16 over 7 days');
    expect(text).toContain('Feeding');
    expect(text).toContain('Bottles a day 6.0 42 bottles in total');
  });

  it('says what an empty section is, in the sheet’s own words', () => {
    expect(visibleText(html)).toContain('No sleep logged in this period.');
  });

  it('falls back to a plain sentence where a section named no empty line', () => {
    expect(visibleText(html)).toContain('Measurements Nothing logged.');
  });

  it('ends with the caveat, verbatim — a document that left it off would be a different claim', () => {
    expect(visibleText(html)).toContain(VISIT_CAVEAT);
  });
});

describe('it is safe to hand to a renderer', () => {
  it('escapes the five characters that could end the document early or change what it says', () => {
    expect(escapeHtml(`Ben & Jo <b>"x"</b> 'y'`)).toBe(
      'Ben &amp; Jo &lt;b&gt;&quot;x&quot;&lt;/b&gt; &#39;y&#39;',
    );
  });

  it('cannot be broken by a name, a note or a unit somebody typed', () => {
    const html = printableHtml({
      ...SHEET,
      header: [{ label: 'Child', value: '<script>alert(1)</script>', note: `O'Brien & Sons` }],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(visibleText(html)).toContain("O'Brien & Sons");
  });

  it('fetches nothing: no script, no stylesheet, no font, no image, no network at all', () => {
    const html = printableHtml(SHEET);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/\bsrc=/i);
    expect(html).not.toMatch(/<link/i);
    expect(html).not.toMatch(/@import/i);
  });

  it('carries its own page margins, so the content survives a print', () => {
    expect(printableHtml(SHEET)).toContain('@page');
  });
});

describe('the rendered words pass the same lint as every other report output', () => {
  it('adds no adjective on the way out', () => {
    const text = visibleText(printableHtml(SHEET));
    expect(reportBannedHits(text), text).toEqual([]);
  });
});
