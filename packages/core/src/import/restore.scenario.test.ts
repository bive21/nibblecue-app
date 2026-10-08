/**
 * RESTORING THIS APP'S OWN DOWNLOAD — the pure half of the household sweep of 2026-09-24 (the
 * written half, against real SQLite and the sync harness, is
 * `apps/mobile/src/scenarios/household.scenario.test.ts`).
 *
 * docs/IMPORT.md §2 calls this file "the case that is provably right, and the one a parent moving
 * phones or restoring their own download actually has". Until the fix beside this test the reader
 * ignored the file's own `detail` column and did not know the canonical unit a temperature is
 * written in, so a restore skipped every diaper, every medicine and every temperature as
 * unstorable, wrote a water bottle back as a feed, and put every breastfeed on the left.
 */
import { describe, expect, it } from 'vitest';
import { activityCsv, type ExportActivity } from '../reports/export';
import { guessColumns, ownExportMap, parseDelimited, readTable } from './index';

const NOW = Date.parse('2026-09-23T12:00:00Z');
const at = (h: number) =>
  new Date(Date.parse('2026-09-20T08:00:00Z') + h * 3_600_000).toISOString();

let n = 0;
const entry = (
  type: string,
  start: string,
  over: Partial<ExportActivity> & { detail?: Record<string, unknown> | null } = {},
): ExportActivity => {
  n += 1;
  const id = `eeeeeeee-0000-4000-8000-${String(n).padStart(12, '0')}`;
  return {
    id,
    child_id: 'cccccccc-0000-4000-8000-0000000000e1',
    type,
    start_at: start,
    end_at: null,
    quantity: null,
    canonical_unit: null,
    notes: null,
    is_private: 0,
    created_by: 'bbbbbbbb-0000-4000-8000-000000000001',
    ...over,
    // the detail row exactly as the mirror stores it: its own activity id, and 0/1 for a boolean
    ...(over.detail === undefined ? {} : { detail: { activity_id: id, ...over.detail } }),
  };
};

/** The CSV the full download writes, for these entries, in the household's own unit. */
const downloadOf = (rows: ExportActivity[]): string =>
  activityCsv(rows, {
    childName: () => 'Emma',
    display: (quantity, unit) => ({ value: String(quantity), unit }),
  });

describe('a restore of this app’s own download', () => {
  const rows = [
    entry('bottle', at(0), {
      quantity: 60,
      canonical_unit: 'ml',
      detail: { kind: 'WATER', offered_ml: 60, consumed_ml: 60, from_stash: 1, container_id: 'x' },
    }),
    entry('diaper', at(1), {
      detail: { kind: 'DIRTY', color: 'Yellow', consistency: null, rash: 1 },
    }),
    entry('temp', at(2), {
      quantity: 3840,
      canonical_unit: 'c_hundredths',
      detail: { temp_c_hundredths: 3840, temp_method: 'Rectal', weight_g: null },
    }),
    entry('med', at(3), {
      detail: { name: 'Vitamin D', amount_text: '1 drop', route: 'MOUTH', care_item_id: 'y' },
    }),
    entry('growth', at(4), { detail: { weight_g: null, length_mm: 590, head_mm: 395 } }),
    entry('breastfeed', at(5), {
      end_at: at(5.25),
      quantity: 15,
      canonical_unit: 'min',
      detail: { first_side: 'RIGHT', left_seconds: 0, right_seconds: 900 },
    }),
    entry('sleep', at(6), { end_at: at(8), detail: { kind: 'NIGHT', wake_count: 1 } }),
  ];
  const table = parseDelimited(downloadOf(rows));
  const map = ownExportMap(table.header);
  const plan = map === null ? null : readTable(table, map, { nowMs: NOW, assumeVolumeUnit: 'oz' });
  const detailOf = (type: string) => plan?.drafts.find(d => d.type === type)?.detail;

  it('is recognized, and every entry in it can come back — nothing is skipped', () => {
    expect(map).not.toBeNull();
    expect(plan?.bySkip).toEqual({});
    expect(plan?.drafts).toHaveLength(rows.length);
  });

  it('brings each entry back as it was recorded, not as a guess', () => {
    // a water bottle stays water: it is never counted as milk or as a feed
    expect(detailOf('bottle')).toEqual({ kind: 'WATER', offered_ml: 60, consumed_ml: 60 });
    expect(detailOf('diaper')).toEqual({ kind: 'DIRTY', color: 'Yellow' });
    expect(detailOf('temp')).toEqual({ temp_c_hundredths: 3840, temp_method: 'Rectal' });
    expect(plan?.drafts.find(d => d.type === 'temp')).toMatchObject({
      quantity: 3840,
      canonicalUnit: 'c_hundredths',
    });
    expect(detailOf('med')).toEqual({ name: 'Vitamin D', amount_text: '1 drop', route: 'MOUTH' });
    // a length and a head measurement with no weight: no quantity on the entry, and still stored
    expect(detailOf('growth')).toEqual({ length_mm: 590, head_mm: 395 });
    // on the side it was actually on
    expect(detailOf('breastfeed')).toEqual({
      first_side: 'RIGHT',
      left_seconds: 0,
      right_seconds: 900,
    });
    expect(detailOf('sleep')).toEqual({ kind: 'NIGHT', wake_count: 1 });
  });

  it('never carries a row of the household it came from: no entry id, bag, or saved medicine', () => {
    for (const d of plan?.drafts ?? []) {
      for (const key of ['activity_id', 'container_id', 'from_stash', 'care_item_id']) {
        expect(Object.keys(d.detail ?? {}), `${d.type} ${key}`).not.toContain(key);
      }
    }
  });

  it('drops a stored value the schema would refuse, rather than writing it', () => {
    const odd = [
      entry('diaper', at(1), { detail: { kind: 'PURPLE', color: 'Yellow' } }),
      entry('breastfeed', at(2), {
        end_at: at(2.5),
        detail: { first_side: 'MIDDLE', left_seconds: -5, right_seconds: 600 },
      }),
    ];
    const t = parseDelimited(downloadOf(odd));
    const m = ownExportMap(t.header);
    const p = m === null ? null : readTable(t, m, { nowMs: NOW, assumeVolumeUnit: 'ml' });
    // a kind this app does not have is not a kind: the diaper is skipped and counted, not guessed
    expect(p?.bySkip).toEqual({ needsKind: 1 });
    expect(p?.drafts.find(d => d.type === 'breastfeed')?.detail).toEqual({ right_seconds: 600 });
  });
});

describe('another tracker’s file is read exactly as before', () => {
  it('a detail column of words still names a diaper’s kind and a medicine', () => {
    const t = parseDelimited(
      [
        'type,start,detail',
        'diaper,2026-09-20T08:00:00Z,wet and dirty (both)',
        'medicine,2026-09-20T09:00:00Z,Vitamin D',
      ].join('\n'),
    );
    const p = readTable(t, guessColumns(t.header), { nowMs: NOW, assumeVolumeUnit: 'ml' });
    expect(p.bySkip).toEqual({});
    expect(p.drafts.map(d => d.detail)).toEqual([{ kind: 'BOTH' }, { name: 'Vitamin D' }]);
  });
});
