/**
 * THE ROAD A PRINTABLE DOCUMENT TAKES TO THE PARENT'S HANDS (the owner, 2026-09-28: *"also save as
 * pdf still does not work, will this be fixed later?"*).
 *
 * Three places make a file of a document: the visit summary, the first year's keepsake and the
 * chosen export's summary. They used to carry three copies of this road, and all three ended in a
 * catch that replaced the phone's words with "Could not build the file". This is the one copy, as
 * a pure function over the steps it is handed (`saveDocumentHere.ts` hands it the real ones), so
 * node can walk every turn of it.
 *
 * THE ORDER, and why each step is there:
 *
 *  1. Make the PDF (`data/pdf.ts`), against a clock.
 *  2. KEEP OUR OWN COPY of it, in our export folder under a name a person can read, and share THAT.
 *     The print engine's file sits in `cache/Print` under a random name, and in Expo Go on Android
 *     the share sheet may not read it at all: that folder is outside the project's own sandbox, and
 *     the share sheet refused it with "Not allowed to read file under given URL". Our copy is
 *     written from the bytes the engine hands back, so it never has to read that folder either.
 *  3. If the PDF could not be made or could not be shared, open the SYSTEM PRINT SCREEN. On Android
 *     it lists Save as PDF as a printer, so the parent still leaves with a PDF, and it needs neither
 *     a file of ours nor the share sheet.
 *  4. If that could not open either, share the same document as a web page, which every phone
 *     opens and prints. A build with no print engine starts here, and its button already said so.
 *  5. If nothing worked, say so with every step's own words (`problems`), never a bare "failed".
 *
 * A SHARE IS HANDED OVER, NOT WAITED ON. The share sheet's promise settles when the sheet goes away,
 * and on Android it has been known never to settle at all, in Expo Go the longest (expo/expo#21418
 * and the note on its fix, #21432). A refusal comes at once, before any sheet is drawn (a file it
 * may not read, another share still open), so the road waits `SHARE_HANDOFF_MS` for one and then
 * counts the file as handed over. Waiting for the settle left a button that said "Building…" for as
 * long as the sheet was up, and for good when it never settled. On Android the app is paused under
 * the sheet, and React Native holds its timers while it is, so the window usually runs out only once
 * the parent is back.
 *
 * NOTHING HERE THROWS, including when a step it is handed does: every step runs inside `attempt`.
 */
import type { PdfResult, PrintScreenResult } from './pdf';
import { phoneSaid } from './phoneSaid';

/** What the caller builds: the document, and the names its two possible files will carry. */
export interface SaveDocumentInput {
  html: string;
  /** `exportFileName('pdf', …)`: the name the parent sees on the file they share. */
  pdfName: string;
  /** `exportFileName('html', …)`: the web page's name, when it comes to that. */
  htmlName: string;
  /** The share sheet's title. */
  dialogTitle: string;
}

export interface ShareOptions {
  mimeType: string;
  UTI: string;
  dialogTitle: string;
}

/** The steps, as the phone performs them. `saveDocumentHere.ts` has the real ones. */
export interface SaveDocumentSteps {
  /** Asked before the button was drawn (`pdfAvailable`): false starts at the web page. */
  canPdf: boolean;
  /** `Platform.OS`. The print screen's promise means something different on each platform. */
  platform: string;
  makePdf: (html: string) => Promise<PdfResult>;
  /** Writes our own copy of the PDF into the export folder and returns its uri. May throw. */
  keepPdf: (name: string, pdf: { uri: string; base64: string | null }) => Promise<string>;
  openPrintScreen: (html: string) => Promise<PrintScreenResult>;
  /** Writes the web page into the export folder and returns its uri. May throw. */
  writePage: (name: string, html: string) => string;
  canShare: () => Promise<boolean>;
  share: (uri: string, options: ShareOptions) => Promise<unknown>;
  /** Resolves after `ms`: the hand over window's clock, a fake one in tests. */
  wait: (ms: number) => Promise<void>;
}

export type SaveStep = 'build' | 'pdf' | 'keep' | 'share' | 'print' | 'page';

/** One step that did not work, and the phone's own words for it. */
export type SaveProblem =
  | { step: SaveStep; reason: 'failed'; detail: string }
  | { step: 'pdf' | 'print'; reason: 'timeout'; afterMs: number }
  | { step: 'pdf' | 'print'; reason: 'unavailable' };

export type SaveOutcome =
  /** The share sheet has the file. `problems` holds anything that went wrong on the way. */
  | { kind: 'shared'; file: 'pdf' | 'page'; uri: string; problems: readonly SaveProblem[] }
  /** The system print screen opened in place of the share sheet. */
  | { kind: 'printScreen'; android: boolean; problems: readonly SaveProblem[] }
  /** This device has nothing to share to: the file is saved, and this is where. */
  | { kind: 'savedTo'; file: 'pdf' | 'page'; uri: string; problems: readonly SaveProblem[] }
  /** Nothing worked; every step's own words are in `problems`. */
  | { kind: 'failed'; problems: readonly SaveProblem[] };

/**
 * How long a share gets to refuse the file before it counts as handed over. A refusal is decided
 * before the sheet is drawn, in a few milliseconds; three seconds is far past that, and short
 * enough that the button is itself again by the time anybody looks.
 */
export const SHARE_HANDOFF_MS = 3_000;

export const PDF_FILE = { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' } as const;
export const PAGE_FILE = { mimeType: 'text/html', UTI: 'public.html' } as const;

type Attempted<T> = { ok: true; value: T } | { ok: false; detail: string };

/** Run one step; a throw becomes the phone's words instead of an escape. */
async function attempt<T>(step: () => T | Promise<T>): Promise<Attempted<T>> {
  try {
    return { ok: true, value: await step() };
  } catch (err) {
    return { ok: false, detail: phoneSaid(err) };
  }
}

const HANDED_OVER = Symbol('handed over');

export type HandOver = { ok: true; kind: 'shared' | 'savedTo' } | { ok: false; detail: string };

/**
 * Give one file to the share sheet. `savedTo` when the device has no share sheet (the file is
 * still where it was written); a refusal comes back with the phone's words.
 */
export async function handOver(
  uri: string,
  type: { mimeType: string; UTI: string },
  dialogTitle: string,
  steps: Pick<SaveDocumentSteps, 'canShare' | 'share' | 'wait'>,
): Promise<HandOver> {
  const available = await attempt(() => steps.canShare());
  // a check that itself failed proves nothing either way, so the share is still tried
  if (available.ok && !available.value) return { ok: true, kind: 'savedTo' };
  // both sides go through `attempt`, so neither can reject the race
  const sharing = attempt(() => steps.share(uri, { ...type, dialogTitle }));
  const grace = attempt(() => steps.wait(SHARE_HANDOFF_MS)).then(
    (): typeof HANDED_OVER => HANDED_OVER,
  );
  const first = await Promise.race([sharing, grace]);
  if (first === HANDED_OVER || first.ok) return { ok: true, kind: 'shared' };
  return { ok: false, detail: first.detail };
}

type Refusal = Exclude<PdfResult, { ok: true }> | Exclude<PrintScreenResult, { ok: true }>;

function problemOf(step: 'pdf' | 'print', result: Refusal): SaveProblem {
  if (result.reason === 'timeout') return { step, reason: 'timeout', afterMs: result.afterMs };
  if (result.reason === 'unavailable') return { step, reason: 'unavailable' };
  return { step, reason: 'failed', detail: result.detail };
}

/**
 * Make the document, then walk the road above. `make` runs first and inside the same guard, so a
 * document that cannot be put together is an answer too (the chosen export reads the database to
 * build its summary, and that read can fail).
 */
export async function saveDocument(
  make: () => SaveDocumentInput | Promise<SaveDocumentInput>,
  steps: SaveDocumentSteps,
): Promise<SaveOutcome> {
  const built = await attempt(make);
  if (!built.ok) {
    return {
      kind: 'failed',
      problems: [{ step: 'build', reason: 'failed', detail: built.detail }],
    };
  }
  const doc = built.value;
  const problems: SaveProblem[] = [];

  if (steps.canPdf) {
    const made = await attempt(() => steps.makePdf(doc.html));
    const pdf: PdfResult = made.ok
      ? made.value
      : { ok: false, reason: 'failed', detail: made.detail };
    if (pdf.ok) {
      // OUR COPY FIRST, and the share gets its uri: the engine's own file is the last resort
      const kept = await attempt(() => steps.keepPdf(doc.pdfName, pdf));
      if (!kept.ok) problems.push({ step: 'keep', reason: 'failed', detail: kept.detail });
      const uri = kept.ok ? kept.value : pdf.uri;
      const sent = await handOver(uri, PDF_FILE, doc.dialogTitle, steps);
      if (sent.ok) return { kind: sent.kind, file: 'pdf', uri, problems };
      problems.push({ step: 'share', reason: 'failed', detail: sent.detail });
    } else {
      problems.push(problemOf('pdf', pdf));
    }

    const opened = await attempt(() => steps.openPrintScreen(doc.html));
    const screen: PrintScreenResult = opened.ok
      ? opened.value
      : { ok: false, reason: 'failed', detail: opened.detail };
    const android = steps.platform === 'android';
    if (screen.ok) return { kind: 'printScreen', android, problems };
    /*
      A PRINT SCREEN STILL OPEN IS NOT A FAILURE ON iOS. There the promise stays open for as long
      as the screen is up, so a clock that runs out means the parent is looking at it. On Android
      the promise settles as soon as the screen is up, so a clock that runs out means it never came.
    */
    if (screen.reason === 'timeout' && !android) return { kind: 'printScreen', android, problems };
    problems.push(problemOf('print', screen));
  }

  const written = await attempt(() => steps.writePage(doc.htmlName, doc.html));
  if (!written.ok) {
    problems.push({ step: 'page', reason: 'failed', detail: written.detail });
    return { kind: 'failed', problems };
  }
  const sent = await handOver(written.value, PAGE_FILE, doc.dialogTitle, steps);
  if (sent.ok) return { kind: sent.kind, file: 'page', uri: written.value, problems };
  problems.push({ step: 'page', reason: 'failed', detail: sent.detail });
  return { kind: 'failed', problems };
}
