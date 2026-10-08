/**
 * THE PRINT ADAPTER, WITH A FAKE ENGINE STOOD IN FOR THE NATIVE ONE (2026-09-28; the owner: *"also
 * save as pdf still does not work"*).
 *
 * Node has no `expo-print`, so the real `require` answers "absent" (the first block); the rest put a
 * fake engine behind the same seam and walk what a phone can do with it: answer, answer with no
 * file, refuse, throw before it has even started, and never answer at all. Nothing here may throw,
 * and a clock that runs out is its own answer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  htmlToPdf,
  NO_FILE,
  openPrintScreen,
  pdfAvailable,
  PRINT_TIMEOUT_MS,
  resetPrintModuleForTests,
  setPrintModuleForTests,
  type PrintModule,
} from './pdf';

/** A rejection the way expo-modules-core words one: the call, then the cause that names it. */
const rejected = (cause: string, code?: string): Error =>
  Object.assign(
    new Error(
      `Call to function 'ExpoPrint.printToFileAsync' has been rejected.\n→ Caused by: ${cause}`,
    ),
    code === undefined ? {} : { code },
  );

/** A promise nobody will ever settle: the WebView that never reports back. */
const never = (): Promise<never> => new Promise<never>(() => undefined);

afterEach(() => {
  resetPrintModuleForTests();
  vi.useRealTimers();
});

describe('a build without the print module', () => {
  it('says so, and throws nothing, for the file and for the print screen alike', async () => {
    resetPrintModuleForTests();
    // node has no `expo-print` and no React Native bridge: the same shape as a build without it
    expect(pdfAvailable()).toBe(false);
    await expect(htmlToPdf('<p>x</p>')).resolves.toEqual({ ok: false, reason: 'unavailable' });
    await expect(openPrintScreen('<p>x</p>')).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('treats a module without the two calls as absent too', async () => {
    setPrintModuleForTests({});
    expect(pdfAvailable()).toBe(false);
    await expect(htmlToPdf('<p>x</p>')).resolves.toEqual({ ok: false, reason: 'unavailable' });
    await expect(openPrintScreen('<p>x</p>')).resolves.toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });
});

describe('making the file', () => {
  it('asks the engine for the bytes as well as the file, so our own copy can be written from them', async () => {
    const asked: unknown[] = [];
    setPrintModuleForTests({
      printToFileAsync: async options => {
        asked.push(options);
        return { uri: 'file:///cache/Print/5f1c.pdf', numberOfPages: 2, base64: 'JVBERi0x' };
      },
    });
    expect(pdfAvailable()).toBe(true);
    await expect(htmlToPdf('<p>sheet</p>')).resolves.toEqual({
      ok: true,
      uri: 'file:///cache/Print/5f1c.pdf',
      base64: 'JVBERi0x',
    });
    expect(asked).toEqual([{ html: '<p>sheet</p>', base64: true }]);
  });

  it('passes on a file that came without bytes, for the copy to be made from the file instead', async () => {
    setPrintModuleForTests({
      printToFileAsync: async () => ({ uri: 'file:///cache/Print/a.pdf' }),
    });
    await expect(htmlToPdf('<p>x</p>')).resolves.toEqual({
      ok: true,
      uri: 'file:///cache/Print/a.pdf',
      base64: null,
    });
  });

  it('calls an answer with no file in it a failure, rather than sharing `undefined`', async () => {
    // iOS resolves with an error object when the render produced no data
    setPrintModuleForTests({ printToFileAsync: async () => ({ code: 'ERR_PDF_SAVING' }) });
    await expect(htmlToPdf('<p>x</p>')).resolves.toEqual({
      ok: false,
      reason: 'failed',
      detail: NO_FILE,
    });
    setPrintModuleForTests({ printToFileAsync: async () => undefined });
    await expect(htmlToPdf('<p>x</p>')).resolves.toMatchObject({ ok: false, reason: 'failed' });
  });

  it('keeps the phone’s own words for a refusal: the cause, not the wrapper around it', async () => {
    setPrintModuleForTests({
      printToFileAsync: () =>
        Promise.reject(rejected('An error occured while writing the PDF data')),
    });
    await expect(htmlToPdf('<p>x</p>')).resolves.toEqual({
      ok: false,
      reason: 'failed',
      detail: 'An error occured while writing the PDF data.',
    });
  });

  it('answers even when the engine throws before it has started', async () => {
    setPrintModuleForTests({
      printToFileAsync: () => {
        throw new Error('Cannot find native module ExpoPrint');
      },
    });
    await expect(htmlToPdf('<p>x</p>')).resolves.toEqual({
      ok: false,
      reason: 'failed',
      detail: 'Cannot find native module ExpoPrint.',
    });
  });
});

describe('a render that never comes back', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('is a timeout, with its own reason and how long it waited, not a button that says Building for good', async () => {
    setPrintModuleForTests({ printToFileAsync: never });
    const made = htmlToPdf('<p>x</p>');
    await vi.advanceTimersByTimeAsync(PRINT_TIMEOUT_MS - 1);
    let settled = false;
    void made.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(made).resolves.toEqual({
      ok: false,
      reason: 'timeout',
      afterMs: PRINT_TIMEOUT_MS,
    });
  });

  it('waits fifteen seconds: far past a year of pages on a slow phone', () => {
    expect(PRINT_TIMEOUT_MS).toBe(15_000);
  });

  it('takes the caller’s own clock when it is handed one', async () => {
    setPrintModuleForTests({ printToFileAsync: never });
    const made = htmlToPdf('<p>x</p>', 500);
    await vi.advanceTimersByTimeAsync(500);
    await expect(made).resolves.toEqual({ ok: false, reason: 'timeout', afterMs: 500 });
  });

  it('lets a late refusal fall quietly, after the answer was already given', async () => {
    // vitest fails a run on an unhandled rejection, so the late one below is the assertion
    let refuse: (err: unknown) => void = () => undefined;
    const late: PrintModule = {
      printToFileAsync: () =>
        new Promise((_, reject) => {
          refuse = reject;
        }),
    };
    setPrintModuleForTests(late);
    const made = htmlToPdf('<p>x</p>');
    await vi.advanceTimersByTimeAsync(PRINT_TIMEOUT_MS);
    await expect(made).resolves.toMatchObject({ ok: false, reason: 'timeout' });
    refuse(rejected('The WebView was destroyed'));
    await vi.advanceTimersByTimeAsync(0);
  });

  it('clears its clock when the engine answers in time', async () => {
    setPrintModuleForTests({
      printToFileAsync: async () => ({ uri: 'file:///a.pdf', base64: 'QQ==' }),
    });
    await expect(htmlToPdf('<p>x</p>')).resolves.toMatchObject({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('the system print screen', () => {
  it('opens with the same document, and nothing but the document', async () => {
    const asked: unknown[] = [];
    setPrintModuleForTests({
      printAsync: async options => {
        asked.push(options);
      },
    });
    await expect(openPrintScreen('<p>sheet</p>')).resolves.toEqual({ ok: true });
    expect(asked).toEqual([{ html: '<p>sheet</p>' }]);
  });

  it('counts a print screen the person closed on iOS as opened, not as something to fall back from', async () => {
    setPrintModuleForTests({
      printAsync: () =>
        Promise.reject(rejected('Printing did not complete', 'ERR_PRINT_INCOMPLETE')),
    });
    await expect(openPrintScreen('<p>x</p>')).resolves.toEqual({ ok: true });
  });

  it('keeps the phone’s words when it could not open', async () => {
    setPrintModuleForTests({
      printAsync: () => Promise.reject(new Error('Another print request is already in progress')),
    });
    await expect(openPrintScreen('<p>x</p>')).resolves.toEqual({
      ok: false,
      reason: 'failed',
      detail: 'Another print request is already in progress.',
    });
  });

  it('times out on its own clock when the screen never comes', async () => {
    vi.useFakeTimers();
    setPrintModuleForTests({ printAsync: never });
    const opened = openPrintScreen('<p>x</p>');
    await vi.advanceTimersByTimeAsync(PRINT_TIMEOUT_MS);
    await expect(opened).resolves.toEqual({
      ok: false,
      reason: 'timeout',
      afterMs: PRINT_TIMEOUT_MS,
    });
  });
});
