/**
 * A LINK THE APP HANDS ITSELF (2026-09-28): a tap on one of its own notifications that names a
 * place — the day-before visit reminder's summary — carried to `LinkRouter`, which routes it exactly
 * as it routes a link from outside: through the one deep-link table (`linking.ts`, `links.ts`),
 * held until the app is signed in and ready, and sent to Today when the table does not know it.
 * Nothing here navigates and nothing here reads the link; it only carries it.
 *
 * WHY NOT `Linking.openURL` ON OUR OWN SCHEME. It would work on a store build, by leaving the app
 * and coming back through the operating system, and it would do nothing at all in Expo Go, which
 * owns no scheme of ours. A function call is the same road with the round trip taken out.
 *
 * COLD START. The tap that launched the app is read on mount (`ReminderResponder`), and on some
 * mount orders that is before `LinkRouter` is listening — so the last link handed over with nobody
 * listening is kept, and given to the listener the moment it subscribes. One is enough: a second
 * tap replaces the first, as a second tap on a link would.
 */
type Listener = (url: string) => void;

let listener: Listener | null = null;
let waiting: string | null = null;

/** Route `url` as if it had arrived from outside the app. */
export function openOwnLink(url: string): void {
  if (listener !== null) {
    listener(url);
    return;
  }
  waiting = url;
}

/** `LinkRouter`'s subscription. A link handed over before it subscribed is delivered at once. */
export function onOwnLink(next: Listener): () => void {
  listener = next;
  const held = waiting;
  waiting = null;
  if (held !== null) next(held);
  return () => {
    if (listener === next) listener = null;
  };
}
