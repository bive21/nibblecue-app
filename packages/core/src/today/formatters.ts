/**
 * ONE KEPT `Intl.DateTimeFormat` PER LOCALE AND OPTIONS (2026-10-08, speed; the owner: "keep the
 * build as light as possible, in case user has slower or older phones").
 *
 * On a phone, building a formatter is a trip across JNI into ICU (`day.ts` has the trace), and a
 * formatter built inside a row or a render is built again for every row and every render — a
 * timeline row's "Oct 3 → Oct 4", a reminder's "on Tue", a routine row's clock. A formatter is
 * immutable once built, so the one built for a set of options answers every later ask for the
 * same set exactly as a fresh one would. `stash/format.ts`, `day.ts` and the UI's `timeFormat.ts`
 * keep their own for the words they own; this is the same thing for everywhere else.
 *
 * Keyed on the options as written, so a call site keeps one entry per zone (and per 12/24-hour
 * habit where it has one) — a handful in a session. The cap is only a backstop against a caller
 * that keys on something unbounded. A zone `Intl` does not know throws here as it did at
 * `new Intl.DateTimeFormat`, and nothing is kept for it.
 */
const kept = new Map<string, Intl.DateTimeFormat>();
const KEPT_MAX = 256;

/** `new Intl.DateTimeFormat(locale, options)`, same arguments, built once. `undefined` is the phone's. */
export function keptDateFormat(
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale ?? ''}|${JSON.stringify(options)}`;
  let f = kept.get(key);
  if (f === undefined) {
    f = new Intl.DateTimeFormat(locale, options);
    if (kept.size >= KEPT_MAX) kept.clear();
    kept.set(key, f);
  }
  return f;
}
