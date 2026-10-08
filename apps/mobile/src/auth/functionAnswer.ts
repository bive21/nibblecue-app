/**
 * WHAT A FAILED EDGE FUNCTION CALL SAID, READ FROM THE BODY IT CAME BACK WITH (the owner's first
 * setup on staging, 2026-09-27).
 *
 * Two different things can answer a call to `/functions/v1/<name>`, and they write different
 * bodies:
 *
 *   · OUR FUNCTION, which always answers `{ error, detail? }` (supabase/functions/_shared/
 *     accounts.ts), plus `attempts_left` on a refused invite;
 *   · THE PLATFORM, when no function of ours ran at all — the name is not deployed on that
 *     project (404), the function failed to start (503) or crashed — which answers
 *     `{ code, message }`, e.g. `{ "code": "NOT_FOUND", "message": "Requested function was not
 *     found" }`.
 *
 * Only the first shape used to be read, so the second came out as a bare `server_error` and
 * setup's last step could say only "Something went wrong": the one fact that would have named
 * the cause — this project has no `create-household` — was thrown away on the phone. Both are
 * kept now. Nothing a parent reads changes: the screens choose their words by `status` and by
 * our own `error` values, which the platform's codes never equal, and a test build shows the
 * rest (`screens/onboarding/finishFailure.ts`).
 */
import type { ApiFailure } from './providers/types';

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

export function functionAnswer(
  status: number,
  body: unknown,
): ApiFailure & { attempts_left?: number } {
  const b = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const detail = text(b['detail']) ?? text(b['message']);
  const f: ApiFailure & { attempts_left?: number } = {
    ok: false,
    status,
    error: text(b['error']) ?? text(b['code']) ?? 'server_error',
    ...(detail !== undefined ? { detail } : {}),
  };
  if (typeof b['attempts_left'] === 'number') f.attempts_left = b['attempts_left'];
  return f;
}
