/**
 * `growth_prompt_events`, on this device (docs/GROWTH_PROMPTS.md §5).
 *
 * Append-only, exactly as the table is: a client may insert and read its own rows and nobody
 * updates or deletes. The eligibility clock reads the latest row per kind, so the log IS the
 * cadence — losing it would restart every cap, which is why it outlives a sign-out in the same
 * way the table would outlive a reinstall.
 *
 * There is no server to write to yet. The shape is the server's so that when there is one, this
 * becomes the outbox's problem rather than a rewrite.
 */
import type { GrowthEvent, GrowthKind, GrowthRecord } from '@nibblecue/core';
import type { KeyValueStore } from '../prefs';

export const GROWTH_KEY = 'growth_prompts.v1';

interface Stored {
  events: GrowthRecord[];
}

export async function loadGrowthEvents(store: KeyValueStore): Promise<GrowthRecord[]> {
  const raw = await store.get(GROWTH_KEY);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    // a corrupt log reads as no history. The caps then start again, which is the SAFE direction
    // to fail in: an extra fortnight of silence, never an extra ask.
    return [];
  }
}

/**
 * Append one. Nothing updates and nothing deletes — a dismissal is a row, which is what makes
 * "two Not nows retire it for good" survive anything short of a reinstall.
 */
export async function recordGrowthEvent(
  store: KeyValueStore,
  record: GrowthRecord,
): Promise<GrowthRecord[]> {
  const events = await loadGrowthEvents(store);
  // the last 50 is years of history at one prompt a fortnight, and the caps only ever look back
  const next = [...events, record].slice(-50);
  await store.set(GROWTH_KEY, JSON.stringify({ events: next } satisfies Stored));
  return next;
}

export const growthRecord = (
  kind: GrowthKind,
  event: GrowthEvent,
  atMs: number,
  campaignId: string | null = null,
): GrowthRecord => ({ kind, event, atMs, campaignId });

/**
 * WHEN THE PARENT LAST SAW SOMETHING GO WRONG (§1: "never within 24 h of an error the user saw").
 * The sync banner is the error a parent sees; the moment it appears is written here, so the rule
 * holds across a restart as well as inside one session. One number, overwritten, because only the
 * latest matters.
 */
export const GROWTH_ERROR_KEY = 'growth_prompts.error_seen.v1';

export async function loadErrorSeen(store: KeyValueStore): Promise<number | null> {
  const raw = await store.get(GROWTH_ERROR_KEY);
  const at = raw === null ? NaN : Number(raw);
  return Number.isFinite(at) ? at : null;
}

export async function recordErrorSeen(store: KeyValueStore, atMs: number): Promise<void> {
  await store.set(GROWTH_ERROR_KEY, String(atMs));
}
