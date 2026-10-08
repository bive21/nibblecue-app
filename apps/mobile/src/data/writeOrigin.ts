/**
 * WHERE THE NEXT WRITE CAME FROM (`WriteSource` in repository.ts).
 *
 * Almost every write names its own origin from the code path that made it — a sheet says
 * `sheet`, a widget says `widget`. A CUECOIN CANNOT: the coin opens the ordinary sheet and the
 * parent finishes the ordinary form, which is the whole point (the owner's spec: "Do not create
 * parallel data paths for NFC logs. An NFC log is an ordinary log with source = nfc"). The sheet
 * has no idea what opened it, and threading a flag through eleven sheet bodies to tell it would
 * be exactly the parallel path the spec forbids.
 *
 * So the origin is marked here, beside the flow, for as long as the flow lasts. `LinkRouter`
 * sets it when it acts on a coin; the shell clears it when the sheet closes, and the direct
 * timer actions clear it as soon as they have written. A marker that outlived its flow would
 * attribute a parent's next manual entry to a coin, which is why the clear is on the close and
 * not on a timer.
 *
 * It is analytics only — `WriteSource` is read by nothing else — so a lost or stale value costs
 * a wrong row in a count, never a wrong row in a household's log.
 *
 * Module-level rather than React state on purpose: it is READ AT CALL TIME, inside the async
 * `context()` a write is already running through, and a `useState` set in the same tick would
 * not be visible there. `sheets/quick/stopped.ts` is the same shape for the same reason.
 */
import type { WriteSource } from './repository';

const DEFAULT: WriteSource = 'sheet';
let origin: WriteSource = DEFAULT;

/** What the next write should record. */
export const writeOrigin = (): WriteSource => origin;

export function setWriteOrigin(next: WriteSource): void {
  origin = next;
}

export function clearWriteOrigin(): void {
  origin = DEFAULT;
}
