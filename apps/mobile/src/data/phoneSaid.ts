/**
 * WHAT THE PHONE SAID, IN ONE LINE A PARENT CAN READ OUT TO US.
 *
 * The owner, 2026-09-28: *"also save as pdf still does not work"*, with no error text, because the
 * screen had caught the error and shown a sentence of its own ("Could not build the file") in its
 * place. The cause was in the message it threw away. So a failure now carries the phone's own
 * words, and this is the one place that turns a thrown value into them.
 *
 * A native module's rejection reads `Call to function 'ExpoSharing.shareAsync' has been rejected.`
 * then `→ Caused by: Not allowed to read file under given URL.` (expo-modules-core joins every cause
 * that way, on both platforms). The first half is the same for every failure and says nothing; the
 * last cause is the one that names the reason, so that is the part kept. It is folded onto one
 * line, given a full stop, and capped, because it lands in a toast and under a button.
 */

/** Said when the thrown value carried no words at all. */
export const NOTHING_SAID = 'No reason was given.';

/** Long enough for any reason a native module gives, short enough to sit under a button. */
const LONGEST = 160;

export function phoneSaid(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : '';
  const causes = raw
    .split(/\s*→?\s*Caused by:\s*/i)
    .map(part => part.replace(/\s+/g, ' ').trim())
    .filter(part => part !== '');
  const last = causes[causes.length - 1] ?? '';
  if (last === '') return NOTHING_SAID;
  const ended = /[.!?]$/.test(last) ? last : `${last}.`;
  return ended.length > LONGEST ? `${ended.slice(0, LONGEST - 1).trimEnd()}…` : ended;
}
