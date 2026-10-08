/**
 * A CRASH REPORT, AND EVERYTHING THAT IS TAKEN OUT OF ONE BEFORE IT IS KEPT (docs/CRASH_REPORTS.md;
 * the owner, 2026-10-08: "build everything that lowers launch risk").
 *
 * The app records what broke, first party, with no third-party SDK (CLAUDE.md §7). A report is
 * about the CODE: which error, where in the bundle, on which build and platform, on which screen.
 * It is never about the household. So everything that could carry a person is taken out here,
 * before the report is written to the phone, and the server takes the patterns out a second time
 * (migration 0156, `app.crash_scrub`): an email, a uuid (every row id and user id in this app is
 * one), a date (a birth date is one), a number longer than four digits, a phone-shaped run, a long
 * token, a long quoted string (an entry's note can only reach a message inside quotes), a home
 * folder, and every name the phone knows — the account's, the family's and the babies'.
 *
 * CONSERVATIVE ON PURPOSE. A word that happens to be a baby's name ("Will", "May") is taken out of
 * a message wherever it appears; a stack keeps only its frames' function names and file names.
 * A report that says less is still a report; a report that says a name is a leak.
 *
 * Pure: no React Native, no clock, no storage. The app hands it the facts (`apps/mobile/src/crash`).
 */
import { z } from 'zod';

/** The caps, one per column. The database's CHECKs are the same numbers (0156), so a report this
 *  builds is never refused for its length. */
export const CRASH_LIMITS = {
  name: 100,
  message: 500,
  stack: 4000,
  frames: 25,
  componentFrames: 12,
  appVersion: 32,
  runtime: 64,
  osVersion: 32,
  route: 64,
} as const;

export const CRASH_SOURCES = ['render', 'global', 'promise'] as const;
export type CrashSource = (typeof CRASH_SOURCES)[number];

export const CRASH_PLATFORMS = ['ios', 'android', 'web'] as const;
export type CrashPlatform = (typeof CRASH_PLATFORMS)[number];

/** What the phone keeps, and what `report_crash` (0156) is handed, key for key. */
export const CrashReportSchema = z.object({
  occurred_at: z.string().datetime(),
  error_name: z.string().min(1).max(CRASH_LIMITS.name),
  message: z.string().max(CRASH_LIMITS.message),
  stack: z.string().max(CRASH_LIMITS.stack),
  source: z.enum(CRASH_SOURCES),
  fatal: z.boolean(),
  app_version: z.string().min(1).max(CRASH_LIMITS.appVersion),
  runtime: z.string().max(CRASH_LIMITS.runtime).nullable(),
  platform: z.enum(CRASH_PLATFORMS),
  os_version: z.string().max(CRASH_LIMITS.osVersion).nullable(),
  route: z.string().max(CRASH_LIMITS.route).nullable(),
});
export type CrashReport = z.infer<typeof CrashReportSchema>;

/** A stored report read back, or null for anything that is not one (an older shape, a torn write). */
export function parseCrashReport(value: unknown): CrashReport | null {
  const r = CrashReportSchema.safeParse(value);
  return r.success ? r.data : null;
}

/* ------------------------------------------------------------------ the scrub */

const EMAIL = /[^\s@<>()[\]"',;:]+@[^\s@<>()[\]"',;:]+\.[a-z]{2,}/gi;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
// an ISO date, with its time if it has one: a birth date or a due date is a person
const DATE = /\b\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?/g;
// a JWT, an access token, a base64 blob, a long hex string
const TOKEN = /\b(?=[A-Za-z0-9_-]*\d)[A-Za-z0-9_-]{24,}(?:\.[A-Za-z0-9_-]{8,}){0,2}\b/g;
// a phone number written with separators: "+1 (555) 123-4567", "555-123-4567"
const PHONE = /\+?\d[\d ().-]{6,}\d/g;
// any run of five digits or more: an amount in grams, a timestamp, an id, a code
const LONG_NUMBER = /\d{5,}/g;
// a long quoted string: where a parent's own words (a note, a food, a medicine) could appear. A
// quote with a letter before it is an apostrophe ("couldn't"), never the start of one
const LONG_QUOTED = /(?<![\p{L}\p{N}])(["'`])(?:(?!\1)[^\\\n]|\\.){25,}\1/gu;
// a home folder in a development path: "/Users/dana/…", "/home/dana/…", "C:\Users\dana\…"
const HOME = /(\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^/\\\s]+/g;

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The names to take out, longest first so "Emma Rose" goes before "Emma". Each name is taken
 * whole, and each of its words of three letters or more on its own (a first name typed on its
 * own in a message). Shorter words are kept: "Al" would take every "al" out of "final".
 */
export function scrubNames(names: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of names) {
    const name = raw.trim();
    if (name.length >= 2) out.add(name);
    for (const word of name.split(/[\s.,'’-]+/)) if (word.length >= 3) out.add(word);
  }
  return [...out].sort((a, b) => b.length - a.length);
}

/**
 * Every pattern above, then every name, out of one piece of text. A name is taken as a whole word,
 * or, with `within`, wherever it appears: a function or component name is camel case, and
 * "saveEmma" holds a name no word boundary would find.
 */
export function scrubText(
  text: string,
  names: readonly string[] = [],
  opts: { within?: boolean } = {},
): string {
  let out = text
    .replace(HOME, '$1[user]')
    .replace(EMAIL, '[email]')
    .replace(UUID, '[id]')
    .replace(DATE, '[date]')
    .replace(TOKEN, '[token]')
    .replace(LONG_QUOTED, '$1[text]$1')
    .replace(PHONE, '[number]')
    .replace(LONG_NUMBER, '[number]');
  for (const name of scrubNames(names)) {
    // a whole word, in any case, with letters from any script on either side counting as the word
    const word = opts.within
      ? escape(name)
      : `(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`;
    out = out.replace(new RegExp(word, 'giu'), '[name]');
  }
  return out;
}

const clip = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

/* ------------------------------------------------------------------ the stack */

/**
 * WHERE A FRAME RAN, as a file name and a position, nothing else. A release build's frames all
 * point into the one bundle, whose path names the phone's own folders and the update's id; a
 * development build's point at a Metro URL on the developer's network, with a query string. So:
 * the scheme and host go, the query goes, and the path is cut to what follows the repository's
 * own folders (`apps/`, `packages/`) or else to its last part.
 */
export function frameLocation(location: string): string {
  const m = /^(.*?)(:\d+(?::\d+)?)?$/.exec(location.trim());
  let file = (m?.[1] ?? location).replace(/^address at\s+/, '');
  const at = m?.[2] ?? '';
  file = file
    .replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '')
    .replace(/[?&#].*$/, '')
    .replace(/\/+$/, '');
  const own = /(?:^|\/)((?:apps|packages)\/.+)$/.exec(file);
  file = own?.[1] ?? file.slice(file.lastIndexOf('/') + 1);
  return `${file}${at}`;
}

/** A frame from a library rather than the app: never worth a report's few lines. */
const LIBRARY = /node_modules|\[native code\]|InternalBytecode|native$/;

interface Frame {
  fn: string;
  at: string;
}

/** V8 ("at fn (file:1:2)", "at file:1:2"), Hermes ("at fn (address at file:1:2)"), JSC ("fn@file:1:2"). */
function parseFrame(line: string): Frame | null {
  const s = line.trim();
  let m = /^at (?:(.+?) \()?(.+?)\)?$/.exec(s);
  if (m && s.startsWith('at ')) return { fn: m[1] ?? '', at: m[2] ?? '' };
  // JSC's "fn@file:1:2": no space on either side, so a message line with an address in it is not one
  m = /^([^\s@]*)@(\S+)$/.exec(s);
  if (m) return { fn: m[1] ?? '', at: m[2] ?? '' };
  return null;
}

/**
 * The app's own frames, at most `CRASH_LIMITS.frames` of them, one per line, each as
 * "fn (file:line:col)". The message lines a stack starts with are dropped (the message is a
 * field of its own), and so is every library frame. Function names are code, but they are
 * scrubbed too: a minifier can leave a string where a name was.
 */
export function trimStack(
  stack: string | undefined | null,
  names: readonly string[] = [],
  max: number = CRASH_LIMITS.frames,
): string {
  if (!stack) return '';
  const frames: string[] = [];
  for (const line of stack.split('\n')) {
    const f = parseFrame(line);
    if (f === null || LIBRARY.test(f.at)) continue;
    const fn = scrubText(f.fn.trim(), names, { within: true }) || 'anonymous';
    frames.push(`${clip(fn, 80)} (${clip(frameLocation(f.at), 120)})`);
    if (frames.length >= max) break;
  }
  return frames.join('\n');
}

/**
 * React's component stack ("    in TodayScreen (at …)" or "    at TodayScreen (file:1:2)"): the
 * component names only, innermost first, which is what says which screen a render error came from.
 */
export function trimComponentStack(
  componentStack: string | undefined | null,
  names: readonly string[] = [],
  max: number = CRASH_LIMITS.componentFrames,
): string {
  if (!componentStack) return '';
  const out: string[] = [];
  for (const line of componentStack.split('\n')) {
    const m = /^\s*(?:in|at)\s+([A-Za-z_$][\w$.]*)/.exec(line);
    if (!m?.[1]) continue;
    out.push(scrubText(m[1], names, { within: true }));
    if (out.length >= max) break;
  }
  return out.join(' < ');
}

/* ------------------------------------------------------------------ the report */

export interface CrashFacts {
  error: unknown;
  source: CrashSource;
  fatal: boolean;
  /** React's component stack, for an error a boundary caught. */
  componentStack?: string | null;
  at: number;
  appVersion: string;
  runtime: string | null;
  platform: CrashPlatform;
  osVersion: string | null;
  route: string | null;
  /** Every name the phone knows: the account's, the families' and the babies'. */
  names: readonly string[];
}

const NAME_SHAPE = /^[A-Za-z_$][\w$]*$/;

/** What was thrown, as a name and a message, whatever was thrown. */
function nameAndMessage(error: unknown): { name: string; message: string; stack: string | null } {
  if (error instanceof Error) {
    return { name: error.name || 'Error', message: error.message, stack: error.stack ?? null };
  }
  if (typeof error === 'object' && error !== null) {
    const o = error as { name?: unknown; message?: unknown; stack?: unknown };
    return {
      name: typeof o.name === 'string' ? o.name : 'Error',
      message:
        typeof o.message === 'string' ? o.message : 'A value that is not an error was thrown',
      stack: typeof o.stack === 'string' ? o.stack : null,
    };
  }
  // a thrown string or number is a message; anything else is described, never printed
  if (typeof error === 'string') return { name: 'Error', message: error, stack: null };
  return { name: 'Error', message: `A ${typeof error} was thrown`, stack: null };
}

/** The report, scrubbed and clipped to every column's cap. Never throws. */
export function crashReportFrom(f: CrashFacts): CrashReport {
  const { name, message, stack } = nameAndMessage(f.error);
  // an error's name is a class name; anything else in that place is treated as a message would be
  const errorName = NAME_SHAPE.test(name) ? clip(name, CRASH_LIMITS.name) : 'Error';
  const frames = trimStack(stack, f.names);
  const components = trimComponentStack(f.componentStack, f.names);
  const fullStack = components ? `${frames}\ncomponents: ${components}`.trim() : frames;
  const tidy = (v: string | null, max: number): string | null =>
    v === null || v.trim() === '' ? null : clip(scrubText(v.trim(), f.names), max);
  const tag = (v: string | null, max: number): string | null => {
    const kept = (v ?? '').replace(/[^A-Za-z0-9 ._:/-]/g, '').trim();
    return kept === '' ? null : clip(kept, max);
  };
  return {
    occurred_at: new Date(Number.isFinite(f.at) ? f.at : 0).toISOString(),
    error_name: errorName,
    message: clip(scrubText(message.replace(/\s+/g, ' ').trim(), f.names), CRASH_LIMITS.message),
    stack: clip(fullStack, CRASH_LIMITS.stack),
    source: f.source,
    fatal: f.fatal,
    app_version: clip(f.appVersion.trim() || '0.0.0', CRASH_LIMITS.appVersion),
    // the build's own words (a channel, an update's id), never a person's: kept as they are, to the
    // characters such a tag is made of, so an update's id is not scrubbed away as if it were a row's
    runtime: tag(f.runtime, CRASH_LIMITS.runtime),
    platform: f.platform,
    os_version: tidy(f.osVersion, CRASH_LIMITS.osVersion),
    // a route name is the app's own word ("Today", "FamilySettings"); one that is not is dropped
    route: f.route !== null && NAME_SHAPE.test(f.route) ? clip(f.route, CRASH_LIMITS.route) : null,
  };
}

/** The text "Copy the details" puts on the clipboard: the same report, so it says nothing more. */
export function crashDetails(r: CrashReport): string {
  return [
    `${r.error_name}: ${r.message}`,
    `${r.platform} ${r.os_version ?? ''} · ${r.app_version}${r.runtime ? ` · ${r.runtime}` : ''}`,
    r.route ? `on ${r.route}` : '',
    r.stack,
  ]
    .filter(line => line.trim() !== '')
    .join('\n');
}
