/**
 * THE PRINTABLE DOCUMENT — the PDF half of "choose what to export" (PRODUCT_SPEC.md §8: "PDF is a
 * clean summary for a paper handoff"; CLAUDE.md §4).
 *
 * IT RENDERS WHAT IT IS HANDED AND NOTHING ELSE. `visitSheet.ts` already decides what a one-page
 * summary of a household's own log contains, and everything that makes it safe lives there: no
 * flag, no color, no verdict, no ordering by severity, every figure carrying its sample size, and
 * the caveat that says a gap means nothing was logged. A second document builder would be a
 * second place for those rules to be forgotten, so this file has no opinions about content at
 * all — it takes the sheet and turns it into marks on paper. Since 2026-09-28 it draws one other
 * document the same way, the year's keepsake (`celebrations/keepsake.ts`, which holds that
 * document's rules), through the same `printableDocument`, plus the one thing the sheet never
 * needed: a table.
 *
 * WHY HTML. The only PDF writer available to this app is the platform's own print pipeline
 * (`expo-print`, which hands HTML to WebKit on iOS and to the Android print framework). Producing
 * a PDF byte stream by hand would mean shipping a font, a layout engine and a compressor to do
 * worse than the renderer already on the phone. So the document is HTML, it is generated HERE in
 * pure TypeScript where node can test it, and the native call that turns it into a file is one
 * guarded line in the app (`apps/mobile/src/data/pdf.ts` says what happens when that is absent).
 *
 * IT IS A SELF-CONTAINED FILE. No script, no external stylesheet, no web font, no image, no
 * network of any kind: the household's record must not fetch anything when it is opened, and a
 * document that renders differently on a plane is not a copy of anything. Black on white on
 * purpose — this is paper, not a screen, and the app's themes have no business in a file that
 * leaves the app.
 *
 * NO PRODUCT NAME IN IT EITHER (docs/BRANDING.md §2). A shared file says where it came from where
 * §2 allows one to; a summary of somebody's own baby is about them, and `packages/core` cannot
 * read the brand package in any case.
 */
import type { VisitRow, VisitSection, VisitSheet } from './visitSheet';

/**
 * The five characters that can end a document early or change what it says. `&` goes first or it
 * would double-escape the entities the others produce.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The stylesheet, inline.
 *
 * `@page` margins rather than body padding: a printer's own margin is not knowable, and content
 * inside the page box is content that survives a duplex print. Sections avoid breaking across
 * pages where the engine can manage it, so a clinician never reads half a sleep block on one
 * side and half on the other. The type stack is whatever the device has — no web font can be
 * fetched by a file that is allowed no network.
 */
const STYLES = `
  @page { margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: #000;
    background: #fff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.45;
  }
  h1 { font-size: 20pt; margin: 0 0 4pt; letter-spacing: -0.2pt; }
  h2 {
    font-size: 11pt;
    text-transform: uppercase;
    letter-spacing: 0.6pt;
    margin: 0 0 6pt;
    padding-bottom: 3pt;
    border-bottom: 1px solid #000;
  }
  section { margin-top: 16pt; break-inside: avoid; page-break-inside: avoid; }
  .head { margin-bottom: 14pt; }
  .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12pt;
    padding: 3pt 0;
    border-bottom: 1px solid #ddd;
  }
  .row:last-child { border-bottom: 0; }
  .row.sub { padding-left: 14pt; }
  .row.sub .label::before { content: "\\2013\\00a0"; color: #555; }
  .label { flex: 1 1 auto; min-width: 0; }
  .value { flex: 0 1 auto; text-align: right; font-weight: 600; }
  .note { display: block; font-weight: 400; font-size: 9pt; color: #555; }
  .empty { color: #555; font-style: italic; margin: 0; }
  .caveat {
    margin-top: 20pt;
    padding-top: 8pt;
    border-top: 1px solid #000;
    font-size: 9pt;
    color: #333;
  }
`;

/**
 * A TABLE, for the one document that has one: the year's keepsake, whose twelve months are a row
 * each (`celebrations/keepsake.ts`). Only a document that carries a table is handed these rules,
 * so the visit summary's file is byte for byte what it was.
 */
const TABLE_STYLES = `
  table { width: 100%; border-collapse: collapse; font-size: 9pt; line-height: 1.3; }
  th, td { padding: 3pt 4pt; border-bottom: 1px solid #ddd; vertical-align: top; }
  thead th { text-align: right; font-weight: 600; border-bottom: 1px solid #000; }
  thead th:first-child, tbody th { text-align: left; }
  tbody th { font-weight: 600; }
  tbody th .note { font-size: 8pt; }
  td { text-align: right; white-space: nowrap; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .tnote { margin: 6pt 0 0; font-size: 9pt; color: #333; }
`;

const rowHtml = (row: VisitRow): string =>
  `<div class="${row.sub ? 'row sub' : 'row'}"><span class="label">${escapeHtml(row.label)}</span>` +
  `<span class="value">${escapeHtml(row.value)}` +
  (row.note === undefined ? '' : `<span class="note">${escapeHtml(row.note)}</span>`) +
  `</span></div>`;

const sectionHtml = (section: VisitSection): string =>
  `<section><h2>${escapeHtml(section.title)}</h2>` +
  (section.rows.length === 0
    ? `<p class="empty">${escapeHtml(section.empty ?? 'Nothing logged.')}</p>`
    : section.rows.map(rowHtml).join('')) +
  `</section>`;

/** A table as a document holds it: a heading, a row of column heads, a row each, a note under it. */
export interface PrintableTable {
  title: string;
  /** The column heads, the row's own label first. */
  columns: readonly string[];
  rows: readonly { label: string; note?: string; cells: readonly string[] }[];
  /** Said under the table, in the document's own words. */
  note?: string;
}

const tableHtml = (table: PrintableTable): string =>
  `<section><h2>${escapeHtml(table.title)}</h2><table><thead><tr>` +
  table.columns.map(c => `<th scope="col">${escapeHtml(c)}</th>`).join('') +
  `</tr></thead><tbody>` +
  table.rows
    .map(
      r =>
        `<tr><th scope="row">${escapeHtml(r.label)}` +
        (r.note === undefined ? '' : `<span class="note">${escapeHtml(r.note)}</span>`) +
        `</th>` +
        r.cells.map(c => `<td>${escapeHtml(c)}</td>`).join('') +
        `</tr>`,
    )
    .join('') +
  `</tbody></table>` +
  (table.note === undefined ? '' : `<p class="tnote">${escapeHtml(table.note)}</p>`) +
  `</section>`;

/**
 * WHAT EVERY PRINTABLE DOCUMENT IS MADE OF: a title, the header rows, the sections, any tables, and
 * the caveat. The visit summary is one (`printableHtml`) and the year's keepsake is the other
 * (`keepsakeHtml`), and both go through this so the two files are drawn by one set of rules: the
 * same escaping, the same paper, nothing fetched.
 */
export interface PrintableParts {
  title: string;
  header: readonly VisitRow[];
  sections: readonly VisitSection[];
  /** After the sections, before the caveat. */
  tables?: readonly PrintableTable[];
  caveat: string;
}

/**
 * The parts as one printable HTML document.
 *
 * The `<title>` is the document's own, which is what a print dialog offers as the file name and
 * what a PDF reader shows in its tab — a document called `index.html` is a document a parent
 * cannot find again.
 */
export function printableDocument(parts: PrintableParts): string {
  const tables = parts.tables ?? [];
  return (
    `<!doctype html>\n<html lang="en">\n<head>\n` +
    `<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>${escapeHtml(parts.title)}</title>\n` +
    `<style>${STYLES}${tables.length > 0 ? TABLE_STYLES : ''}</style>\n` +
    `</head>\n<body>\n` +
    `<h1>${escapeHtml(parts.title)}</h1>\n` +
    `<div class="head">${parts.header.map(rowHtml).join('')}</div>\n` +
    parts.sections.map(sectionHtml).join('\n') +
    tables.map(t => `\n${tableHtml(t)}`).join('') +
    `\n<p class="caveat">${escapeHtml(parts.caveat)}</p>\n` +
    `</body>\n</html>\n`
  );
}

/** The visit summary as one printable HTML document. */
export function printableHtml(sheet: VisitSheet): string {
  return printableDocument(sheet);
}
