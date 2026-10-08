/**
 * Which milk-storage guidance a household reads (docs/MILK_STASH.md §5; CLAUDE.md §2 rule 5).
 *
 * The household pins a profile and a version (`households.guidance_profile`,
 * `guidance_version`; the server defaults both). The numbers come from that file and nowhere
 * else: the bundled copy in `packages/core` when the pinned version ships with the app, else the
 * mirrored `milk_guidance_profiles` row the pull brought down, else NOTHING — a household whose
 * pin names a version this device has never seen gets no dates rather than a guessed window.
 */
import { MILK_GUIDANCE, type MilkGuidanceProfile } from '@nibblecue/core';
import type { Db, Tx } from '../db/driver';

/** The server's own defaults (0001_init.sql:77-78), for a mirror row pulled before the pin was. */
export const DEFAULT_GUIDANCE = { profile: 'CDC_US', version: '2026_01' } as const;

interface MirrorRow {
  profile: string;
  version: string;
  effective_date: string;
  source: string;
  source_url: string | null;
  disclaimer: string;
  conditions: string;
  anchors: string;
}

const parse = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

/** A pulled row, in the file's shape. Missing `display` copy falls back to the bundled one. */
function fromMirror(row: MirrorRow): MilkGuidanceProfile | null {
  const conditions = parse(row.conditions);
  const anchors = parse(row.anchors);
  if (conditions === null || anchors === null) return null;
  const bundled = MILK_GUIDANCE.CDC_US['2026_01'];
  return {
    ...bundled,
    profile: row.profile,
    version: row.version,
    source: row.source,
    sourceUrl: row.source_url ?? '',
    effectiveDate: row.effective_date,
    disclaimer: row.disclaimer,
    conditions: conditions as MilkGuidanceProfile['conditions'],
    anchors: anchors as MilkGuidanceProfile['anchors'],
  };
}

export async function guidanceFor(
  db: Db | Tx,
  householdId: string,
): Promise<MilkGuidanceProfile | null> {
  const pin = await db.get<{ guidance_profile: string | null; guidance_version: string | null }>(
    'select guidance_profile, guidance_version from households where id = ?',
    [householdId],
  );
  const profile = pin?.guidance_profile ?? DEFAULT_GUIDANCE.profile;
  const version = pin?.guidance_version ?? DEFAULT_GUIDANCE.version;
  const bundled = (
    MILK_GUIDANCE as Record<string, Record<string, MilkGuidanceProfile> | undefined>
  )[profile]?.[version];
  if (bundled !== undefined) return bundled;
  const row = await db.get<MirrorRow>(
    `select profile, version, effective_date, source, source_url, disclaimer, conditions, anchors
       from milk_guidance_profiles where profile = ? and version = ?`,
    [profile, version],
  );
  return row === undefined ? null : fromMirror(row);
}
