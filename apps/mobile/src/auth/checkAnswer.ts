/**
 * WHAT `check_invite` ANSWERED, read into the one shape the screens handle (migration 0139; the
 * owner's report of 2026-09-29). Pure, so node tests every branch: the Supabase provider hands in
 * what supabase-js returned for `rpc('check_invite')`, and gets back a `CheckInviteResult` — or the
 * `offline` throw every account call makes when nothing answered at all.
 *
 * Four things can answer the call, and each is told apart here rather than on a screen:
 *
 *   · THE FUNCTION, with `{ ok: true, token, … }`, `{ ok: false, error: 'invalid_invite' }` or
 *     `{ ok: false, error: 'needs_plus', … }` — the three answers a parent can be told;
 *   · THE DATABASE, refusing before the function ran: `CC422` for a shape the phone never sends,
 *     `CC429` for the signed-in limiter;
 *   · POSTGREST, when there is no such function to run (`PGRST202`, a project without 0139) or the
 *     caller may not run it (`42501`, a project that took it back from signed-out callers). Both are
 *     `unavailable`: the phone holds the code unchecked, as it did before 0139, and never calls a
 *     good code dead because a server is older than the app;
 *   · NOTHING: postgrest-js turns a fetch that never reached the server into `status: 0` with an
 *     empty `code` (`PostgrestBuilder`'s own catch), which is `offline`.
 */
import { isRole, type Role } from '@nibblecue/core';
import { AuthFailure, type CheckInviteResult, type InvitePreview } from './providers/types';

/** What supabase-js hands back from `.rpc(…)`, as much of it as this reads. */
export interface RpcAnswer {
  data: unknown;
  error: { code?: string | null; message?: string | null; details?: string | null } | null;
  status?: number;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The names, the role and the seat, from the function's own object — or null for a shape it never sends. */
function previewOf(b: Record<string, unknown>): InvitePreview | null {
  const role = b['role'];
  if (typeof role !== 'string' || !isRole(role)) return null;
  const hours = b['seat_hours'];
  return {
    household_name: text(b['household_name']),
    inviter_name: text(b['inviter_name']),
    role: role as Role,
    seat_hours: typeof hours === 'number' && Number.isFinite(hours) && hours > 0 ? hours : null,
  };
}

const failure = (status: number, error: string, detail?: string): CheckInviteResult => ({
  ok: false,
  status,
  error,
  ...(detail ? { detail } : {}),
});

export function checkAnswerOf(r: RpcAnswer): CheckInviteResult {
  if (r.error) {
    const code = r.error.code ?? '';
    // postgrest-js's own catch: the request never reached a server
    if (code === '' && (r.status ?? 0) === 0)
      throw new AuthFailure('offline', r.error.message ?? 'No connection');
    if (code === 'PGRST202' || code === '42501' || code === 'PGRST301' || r.status === 404)
      return { ok: false, status: 0, error: 'unavailable' };
    if (code === 'CC429') return failure(429, 'rate_limited', r.error.details ?? undefined);
    if (code === 'CC422') return failure(422, 'validation_error', r.error.details ?? undefined);
    return failure(500, 'server_error');
  }
  const b =
    typeof r.data === 'object' && r.data !== null ? (r.data as Record<string, unknown>) : null;
  if (b === null) return failure(500, 'server_error');
  if (b['ok'] === true) {
    const token = text(b['token']);
    const preview = previewOf(b);
    if (token === '' || preview === null) return failure(500, 'server_error');
    return { ok: true, token, expires_at: text(b['expires_at']), preview };
  }
  if (b['error'] === 'needs_plus') {
    const preview = previewOf(b);
    if (preview !== null) return { ok: false, status: 403, error: 'needs_plus', preview };
  }
  if (b['error'] === 'invalid_invite') return { ok: false, status: 404, error: 'invalid_invite' };
  return failure(500, 'server_error');
}
