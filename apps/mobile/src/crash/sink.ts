/**
 * WHERE A REPORT GOES: `report_crash` on the project the build talks to (migration 0156), as the
 * signed-in person, through the app's one Supabase client. The in-app test backend has no server to
 * send to, so a build on it keeps its reports on the phone (at most `MAX_QUEUED`, for two weeks)
 * and sends none.
 */
import type { AppEnv } from '../env';
import { getSupabaseClient } from '../supabase/client';
import { crashAnswerOf, type CrashSink } from './send';

export function crashSinkFor(env: AppEnv): CrashSink | null {
  if (env.authProvider !== 'supabase' || !env.supabaseUrl || !env.supabaseAnonKey) return null;
  const client = getSupabaseClient(env.supabaseUrl, env.supabaseAnonKey);
  return async report => crashAnswerOf(await client.rpc('report_crash', { p_report: report }));
}
