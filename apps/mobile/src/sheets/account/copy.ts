/**
 * The free download's words (PRODUCT_SPEC.md §8; CLAUDE.md §4).
 *
 * The one thing every sentence here has to carry is that this is FREE and COMPLETE, because the
 * paid export sits one row below it and the difference between them is exactly that. Nothing
 * here upsells; the paid row does its own selling.
 */
export const DOWNLOAD = {
  title: 'Download everything',
  /**
   * NO PRODUCT NAME. `BRANDING.md` §2 lists the surfaces the brand may appear on and a settings
   * sheet is not one of them — "everything recorded for this household" says the same thing and
   * says it about them rather than about us. `placement.test.ts` caught the first draft.
   */
  lede: 'Everything ever recorded for this household, in two formats. Free on every plan, now and later.',
  building: 'Gathering everything…',
  failed: 'The file could not be built. Nothing was changed.',
  counts: 'In this download',
  countsValue: (rows: number, activities: number): string =>
    `${rows.toLocaleString('en-US')} rows · ${activities.toLocaleString('en-US')} entries`,
  shareJson: 'Share the JSON file',
  shareCsv: 'Share the CSV file',
  savedTo: (uri: string): string => `Saved to ${uri}`,
  /**
   * A file the share sheet refused, or one that could not be written, with the phone's own words
   * for why (2026-09-28). Said in the sheet: a toast would be drawn under it.
   */
  shareFailed: (said: string): string => `The file could not be shared. ${said}`,
  dialogTitle: 'Your data',
  note: 'JSON is the complete record, table by table. CSV is one row per entry, with both the stored amount and the one you typed. Built on this phone, and nothing is uploaded.',
} as const;

/**
 * The chosen export's words (PRODUCT_SPEC.md §8; CLAUDE.md §4).
 *
 * TWO RULES SHAPE EVERY LINE HERE. First, nothing on this sheet may make the free download read
 * as the lesser one — so the sheet says out loud, in its own body, that everything is free one
 * screen back, and it never calls itself "the full export" or the other one "the basic one".
 * Second, an export is arithmetic on somebody's entries: these strings are scanned by
 * `reportBannedHits` in `chosenExport.test.ts`, the same lint the observations pass, because a
 * label is as capable of a verdict as a sentence is.
 *
 * NO PRODUCT NAME AND NO TIER NAME (docs/BRANDING.md §2; `placement.test.ts`). The sheet only
 * opens for a household that already has the feature, so it has nothing to sell and nothing to
 * name — the row that opens it does the saying.
 */
export const CHOOSE_EXPORT = {
  title: 'Choose what to export',
  lede: 'Pick the days and the child. What you logged in that period comes out as data files and a one-page summary.',

  rangeHeader: 'How far back',
  customLabel: 'Pick the days',
  customFrom: 'From',
  customTo: 'To',
  childHeader: 'Which child',

  /** `Sep 10 – Sep 16` under the chips, so the choice is a date rather than a word. */
  span: (from: string, to: string): string => (from === to ? from : `${from} – ${to}`),
  counts: 'In this export',
  countsValue: (rows: number, activities: number): string =>
    `${rows.toLocaleString('en-US')} rows · ${activities.toLocaleString('en-US')} entries`,
  building: 'Gathering the period…',
  failed: 'The file could not be built. Nothing was changed.',
  /** The one case a parent will hit by accident, and it is not an error — it is an answer. */
  nothingLogged:
    'Nothing was logged in these days. The files still come out, with no entries in them.',

  shareJson: 'Share the JSON file',
  shareCsv: 'Share the CSV file',
  sharePdf: 'Share the summary as a PDF',
  shareHtml: 'Share the summary as a web page',
  /**
   * Said BEFORE the tap, never after it. The PDF renderer is part of the phone rather than part
   * of this app, and a build without it can still hand over the same document as a page every
   * phone can open and print — but only a button that says so is honest about which it will do.
   */
  pdfUnavailable:
    'This build has no PDF renderer, so the summary comes out as a web page you can open and print.',
  summaryNote:
    'The summary is the same one-page document the visit summary shows: totals, counts and your own notes, with nothing interpreted.',
  /**
   * Emailing it is the one thing on the paid list that is not here. It needs a sending address on
   * a domain whose mail is not set up yet (CLAUDE.md §8), and CLAUDE.md §2 rule 11 says to build
   * the interface and stop rather than invent a credential. The share sheet reaches mail in the
   * meantime, which is the same file in the same place, sent by the person rather than by us.
   */
  emailNote:
    'Sending it straight to an address is not in this build yet. Sharing it reaches mail the same way.',
  /** The free download is never harder to find than this (CLAUDE.md §4), so this sheet says so. */
  freeNote: 'Everything ever logged, unnarrowed, is the download above. It is free on every plan.',
  /** No share target on this device: the file exists, so say where, never "it failed". */
  savedTo: (uri: string): string => `Saved to ${uri}`,
  /**
   * A data file the share sheet refused, with the phone's own words for why (2026-09-28). Said in
   * the sheet: a toast would be drawn under it. The summary's own words are `SAVE_FILE`.
   */
  shareFailed: (said: string): string => `The file could not be shared. ${said}`,
  dialogTitle: 'Your data',
} as const;
