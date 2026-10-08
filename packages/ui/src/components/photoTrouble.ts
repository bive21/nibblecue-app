/**
 * A PICTURE THAT WOULD NOT DRAW (2026-09-29). The baby's picture is an `Image` in three places the
 * design system draws — `Avatar` (setup's plate, the photo sheet, a row) and the top bar's
 * `ChildChip`, its one face and each disc of "Both" — and until now a picture that failed to load
 * left the circle's plain fill with nothing on it: no face, no initial, no sign of why. The owner
 * reported exactly that circle twice before anyone could say what was behind it.
 *
 * So a failed picture is never left blank, and never silent:
 *
 *   - the circle falls back to what it draws with no picture at all, the initial on the brand
 *     gradient, for that picture — a new picture is tried afresh (`shownPhoto`);
 *   - the failure is REPORTED through one hook the app installs at launch (`setPhotoTroubleReporter`,
 *     as the haptics motor is): the app writes it to its boot log, so the next report carries a
 *     cause. What is reported is where the picture lives — its scheme and its folder — and the
 *     platform's own error, never the file's name or a signed link's token, both of which name a
 *     person or open a private file (`photoPlace`).
 *
 * A PICTURE THAT LOADS AND SHOWS NOTHING is not this file's to catch: nothing fails, so nothing is
 * reported. The app looks at what a child's stored picture shows before it hands one over
 * (`apps/mobile` `media/photoMend.ts`, 2026-09-29), and a circle with nothing in it reaches these
 * components as the drawn baby it came from, or as no picture, which is the initial.
 *
 * Pure, so node holds it (`photoTrouble.test.ts`); the components only call it.
 */

/** One picture that would not draw: which component, where it lives, and what the phone said. */
export interface PhotoTrouble {
  where: string;
  place: string;
  error: string;
}

export type PhotoTroubleReporter = (trouble: PhotoTrouble) => void;

let reporter: PhotoTroubleReporter | null = null;

/** Installed once by the app (its boot log); null takes it out again (tests). */
export function setPhotoTroubleReporter(next: PhotoTroubleReporter | null): void {
  reporter = next;
}

/**
 * WHERE A PICTURE LIVES, WITHOUT WHO IT IS: the scheme, and for a file its last two folders — enough
 * to tell setup's parked picture (`cuddlecue/setup-photo`) from the child-photo cache
 * (`cuddlecue/child-photos`) from the picker's own copy — and for a web address its host alone. The
 * file's name (a person's or a child's id) and anything after `?` (a signed link's token) are left
 * out.
 */
export function photoPlace(uri: string | undefined): string {
  if (uri === undefined || uri === '') return 'no address';
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(uri)?.[1]?.toLowerCase();
  if (scheme === undefined) return 'a bare path';
  if (scheme === 'data') return 'data: (inline bytes)';
  const rest = uri.slice(scheme.length + 1).split(/[?#]/)[0] ?? '';
  if (scheme === 'http' || scheme === 'https') {
    const host = /^\/\/([^/]*)/.exec(rest)?.[1] ?? '';
    return `${scheme}: ${host.replace(/^[^@]*@/, '') || 'no host'}`;
  }
  const folders = rest.split('/').filter(s => s !== '');
  // the last part is the file: named after a person or a child, so it stays on the phone
  folders.pop();
  const shown = folders.slice(-2);
  return `${scheme}: ${folders.length > shown.length ? '…/' : '/'}${shown.join('/')}`;
}

/** The platform's words out of an `Image` error event (`nativeEvent.error`), or out of anything. */
export function photoErrorText(event: unknown): string {
  const native = (event as { nativeEvent?: { error?: unknown } } | null)?.nativeEvent?.error;
  const said = native ?? event;
  if (typeof said === 'string') return said.split('\n')[0]?.slice(0, 200) || 'no reason given';
  if (said instanceof Error) return said.message.split('\n')[0]?.slice(0, 200) || 'no reason given';
  return 'no reason given';
}

/** Tell the app a picture would not draw. Never throws: a report is never worth a broken screen. */
export function reportPhotoTrouble(where: string, uri: string | undefined, event: unknown): void {
  if (reporter === null) return;
  try {
    reporter({ where, place: photoPlace(uri), error: photoErrorText(event) });
  } catch {
    // the picture has already fallen back to the initial; the log line is the only thing lost
  }
}

/**
 * The picture a circle draws: the one it was given, unless it is night (the amber theme hides
 * pictures: at 3 a.m. nothing on the screen that is not information) or that very picture has
 * already failed to load here — then none, and the circle draws its initial on the gradient.
 */
export function shownPhoto(
  uri: string | undefined,
  night: boolean,
  failed: ReadonlySet<string>,
): string | undefined {
  if (uri === undefined || uri === '' || night || failed.has(uri)) return undefined;
  return uri;
}
