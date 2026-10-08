/**
 * The boot log. A native crash — the owner's phone on 2026-09-15: Today painted, and a second
 * later the app was gone — takes the process down BELOW JavaScript. No error boundary runs, no
 * global handler runs (ErrorScreen.tsx and errorTrap.ts catch everything above that line and
 * saw nothing), and the terminal shows only what was already printed. So every stage of the
 * first second prints its name BEFORE it runs, and the last `[boot …]` line in the Metro
 * terminal names the stage the app died in. That line is the whole diagnostic: a crash nobody
 * can read becomes "it died loading the native notifications module", or "after the schedule
 * loaded", and the fix has somewhere to start.
 *
 * Development only, and deliberately not `__DEV__`: the node tests evaluate these modules with
 * no such global, and Metro inlines `process.env.NODE_ENV` the same way it inlines the
 * `EXPO_PUBLIC_*` names env.ts reads. The time since the bundle began evaluating rides along,
 * so a stall reads as a stall and a crash as a crash.
 */
const started = Date.now();

const enabled = process.env.NODE_ENV === 'development';

/** One line, `[boot +1234ms] stage`, in the terminal that runs `expo start`. */
export function crumb(stage: string): void {
  if (!enabled) return;
  console.log(`[boot +${Date.now() - started}ms] ${stage}`);
}

// the first line of any run: this module is the entry file's first import, so a bundle that
// dies while it evaluates dies after this
crumb('bundle evaluating');
