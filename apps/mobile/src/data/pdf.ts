/**
 * TURNING THE PRINTABLE DOCUMENT INTO A PDF — the one native step in the chosen export
 * (PRODUCT_SPEC.md §8; CLAUDE.md §4).
 *
 * `packages/core/src/reports/printable.ts` builds the document, in pure TypeScript, where node
 * tests it. This file does the only part node cannot: hand that HTML to the platform's own print
 * pipeline — WebKit on iOS, the Android print framework — and get a file back. Nothing about the
 * document's CONTENT is decided here, deliberately: a second place that could add a sentence to a
 * parent's summary is a second place the report lint would have to reach.
 *
 * WHY THE MODULE IS REQUIRED AT RUN TIME RATHER THAN IMPORTED. `expo-print` has a native side, and
 * a static import makes the demand for it the bundle's first act — on a build that does not carry
 * it that is a dead process between "Android Bundled" and the first frame, with one silent line in
 * the Metro terminal and nothing in `pnpm test` able to see it. Three crashes have reached the
 * owner's phone that way. `apps/mobile/src/growth/storeReview.ts` is the shipped answer and this
 * is the same shape: the lookup happens at CALL time, inside a `try`, via `require` — which Metro
 * treats as an optional dependency precisely because it is guarded — so a build without the module
 * degrades to a missing feature instead of a corpse. `pnpm check:expo-go` is the gate for it.
 *
 * WHAT IS TRUE IN THIS BUILD, TODAY. `expo-print` IS a dependency of `apps/mobile` as of
 * 2026-09-22, added when the owner asked for the pediatrician sheet as a PDF ("to however many
 * pages there needs to be"). It is in Expo SDK 57's bundled module map, so the Expo Go client
 * carries its native half and `pdfAvailable()` is true there and in a dev build alike.
 *
 * THE GUARD STAYS ANYWAY, and not as a leftover. A dependency can be absent for reasons that have
 * nothing to do with this file — a pull that has not been followed by `pnpm install`, a build
 * profile that trims a module, an SDK bump that moves it out of the bundled map — and the cost of
 * being wrong is a dead process between "Android Bundled" and the first frame, with one silent line
 * in the Metro terminal. Every caller already handles `unavailable` by sharing the document as a
 * web page and SAYING so before the tap, which every phone can open and print; that path is a
 * smaller loss than a button that lies, and it costs one `require` inside a `try` to keep.
 *
 * THE FILE COMES BACK AS BYTES TOO (2026-09-28; the owner: "also save as pdf still does not work").
 * On Android the print module writes its PDF into the app's own cache folder, `cache/Print`, and in
 * Expo Go that folder is outside the project's own sandbox: Expo Go lets a project read only its
 * scoped folders (`cache/ExperienceData/<project>`), so the share sheet refused the file with "Not
 * allowed to read file under given URL", and so would a copy made with expo-file-system, which asks
 * the same question. The print module itself reads its file with no such check, so `base64: true`
 * asks it for the bytes, and `data/files.ts` writes them into our own export folder under a name a
 * person can read. `data/saveDocument.ts` is the road the three callers share.
 *
 * AND IT NEVER WAITS FOREVER. The Android renderer is a WebView that nobody on screen owns; if it
 * never reports back, the promise never settles and a button said "Building…" for good. Both calls
 * here run against a clock (`PRINT_TIMEOUT_MS`) and a timeout is its own answer, with its own
 * words, because "it took too long" and "it failed" send the owner looking in different places.
 *
 * NOTHING HERE EVER THROWS. An export is a parent asking for their own data; the answer to "the
 * renderer is missing" is a different file, never a crash and never a silent nothing.
 */
import { phoneSaid } from './phoneSaid';

/** What the two calls this file makes look like. Typed structurally: the module is never imported. */
export interface PrintModule {
  printToFileAsync?: (options: { html: string; base64?: boolean }) => Promise<unknown>;
  printAsync?: (options: { html: string }) => Promise<unknown>;
}

/**
 * How long the print engine gets, for either call. A page or two renders in about a second on a
 * slow phone and a year's keepsake in a few; fifteen seconds is far past both, and past it the
 * render is not coming. The Android print screen's promise settles as soon as the screen is up
 * (expo-print's own documentation), so the same clock covers it.
 */
export const PRINT_TIMEOUT_MS = 15_000;

export type PdfResult =
  /** `base64` is the same file's bytes, for the copy we share; `null` when the engine sent none. */
  | { ok: true; uri: string; base64: string | null }
  /** No print module in this build — the caller shares the HTML instead. */
  | { ok: false; reason: 'unavailable' }
  /** The module is here and the render failed. `detail` is the phone's own words for it. */
  | { ok: false; reason: 'failed'; detail: string }
  /** Nothing came back in `afterMs`. A different fact from a failure, so a different sentence. */
  | { ok: false; reason: 'timeout'; afterMs: number };

export type PrintScreenResult =
  /** The system print screen opened (on Android it offers Save as PDF as a printer). */
  | { ok: true }
  | { ok: false; reason: 'unavailable' }
  | { ok: false; reason: 'failed'; detail: string }
  | { ok: false; reason: 'timeout'; afterMs: number };

/** Said when the engine answered with no file in it (iOS can resolve with an error object). */
export const NO_FILE = 'The print engine answered without a file.';

/** Resolved once. `null` means this build has no native side for it, which is not an error. */
let cached: PrintModule | null | undefined;

function moduleOrNull(): PrintModule | null {
  if (cached !== undefined) return cached;
  try {
    // A STATIC IMPORT WOULD DEFEAT THE GUARD: the bundler resolves it at build time and the
    // module's own initialisation runs at load, before any try block here could catch it.
    // `require`, inside this try, is the only construct that defers the lookup to call time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-print') as PrintModule;
  } catch {
    cached = null;
  }
  return cached;
}

const TIMED_OUT = Symbol('timed out');

/**
 * `work`, or `TIMED_OUT` once `ms` have passed, whichever comes first. The clock is cleared either
 * way. A render that rejects AFTER the clock ran out lands on the handler `Promise.race` already
 * attached to it, so it cannot surface later as an unhandled rejection (`pdf.test.ts` holds that).
 */
function within<T>(work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clock = new Promise<typeof TIMED_OUT>(resolve => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return Promise.race([work, clock]).finally(() => clearTimeout(timer));
}

/** The file in what `printToFileAsync` resolved with, checked rather than trusted. */
function fileIn(result: unknown): { uri: string | null; base64: string | null } {
  if (typeof result !== 'object' || result === null) return { uri: null, base64: null };
  const { uri, base64 } = result as { uri?: unknown; base64?: unknown };
  return {
    uri: typeof uri === 'string' && uri !== '' ? uri : null,
    base64: typeof base64 === 'string' && base64 !== '' ? base64 : null,
  };
}

/**
 * The person closed the iOS print screen without printing. expo-print rejects for that
 * (`PrintIncompleteException`), but the screen DID open and the person answered it, so it is not a
 * failure to fall back from. Android never rejects for it: its promise settles when the screen opens.
 */
function closedByPerson(err: unknown): boolean {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
  return code === 'ERR_PRINT_INCOMPLETE' || /printing did not complete/i.test(phoneSaid(err));
}

/**
 * Whether this build can produce a PDF at all.
 *
 * It is synchronous and it is asked BEFORE the sheet draws its buttons, because CLAUDE.md §4's
 * rule about gates applies just as much to a missing module as to a missing plan: the control has
 * to say what it will do before it is tapped.
 */
export function pdfAvailable(): boolean {
  const mod = moduleOrNull();
  return mod !== null && typeof mod.printToFileAsync === 'function';
}

/** Render the document to a PDF file in the cache, or say honestly why there is no file. */
export async function htmlToPdf(
  html: string,
  timeoutMs: number = PRINT_TIMEOUT_MS,
): Promise<PdfResult> {
  const mod = moduleOrNull();
  if (mod === null || typeof mod.printToFileAsync !== 'function') {
    return { ok: false, reason: 'unavailable' };
  }
  try {
    const answer = await within(
      Promise.resolve(mod.printToFileAsync({ html, base64: true })),
      timeoutMs,
    );
    if (answer === TIMED_OUT) return { ok: false, reason: 'timeout', afterMs: timeoutMs };
    const { uri, base64 } = fileIn(answer);
    if (uri === null) return { ok: false, reason: 'failed', detail: NO_FILE };
    return { ok: true, uri, base64 };
  } catch (err) {
    return { ok: false, reason: 'failed', detail: phoneSaid(err) };
  }
}

/**
 * THE SYSTEM PRINT SCREEN, for when the file could not be made or could not be shared. On Android
 * it lists Save as PDF as a printer, so a parent still leaves with the PDF; it needs no file of ours
 * and no share sheet, which are the two things that failed on the way here.
 */
export async function openPrintScreen(
  html: string,
  timeoutMs: number = PRINT_TIMEOUT_MS,
): Promise<PrintScreenResult> {
  const mod = moduleOrNull();
  if (mod === null || typeof mod.printAsync !== 'function') {
    return { ok: false, reason: 'unavailable' };
  }
  try {
    const answer = await within(Promise.resolve(mod.printAsync({ html })), timeoutMs);
    if (answer === TIMED_OUT) return { ok: false, reason: 'timeout', afterMs: timeoutMs };
    return { ok: true };
  } catch (err) {
    if (closedByPerson(err)) return { ok: true };
    return { ok: false, reason: 'failed', detail: phoneSaid(err) };
  }
}

/** Test seam: forget what was resolved, so a suite can exercise both branches. */
export const resetPrintModuleForTests = (): void => {
  cached = undefined;
};

/** Test seam: stand a fake engine in for the native one (`null` is a build without it). */
export const setPrintModuleForTests = (mod: PrintModule | null): void => {
  cached = mod;
};
