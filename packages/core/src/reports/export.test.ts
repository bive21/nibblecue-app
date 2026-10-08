import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_CSV_HEADER,
  activityCsv,
  csvField,
  csvOf,
  csvRow,
  EXPORT_FORMAT_VERSION,
  exportDocument,
  exportFileName,
  exportJson,
  fileNamePart,
  type ExportActivity,
} from './export';

const HEADER = {
  generatedAt: '2026-09-16T04:00:00.000Z',
  householdId: 'house-1',
  timeZone: 'America/Los_Angeles',
};

const ctx = {
  childName: (id: string | null) => (id === 'kid' ? 'Emma' : ''),
  display: (q: number, unit: string) =>
    unit === 'ml' ? { value: (q / 29.5735).toFixed(1), unit: 'oz' } : { value: String(q), unit },
};

const activity = (over: Partial<ExportActivity> & Pick<ExportActivity, 'id' | 'start_at'>) =>
  ({
    child_id: 'kid',
    type: 'bottle',
    end_at: null,
    quantity: null,
    canonical_unit: null,
    notes: null,
    is_private: 0,
    created_by: 'dana',
    ...over,
  }) as ExportActivity;

describe('the JSON copy is complete by construction', () => {
  it('carries its own header, so a reader knows what it is holding', () => {
    const doc = exportDocument(HEADER, { children: [{ id: 'kid', name: 'Emma' }] });
    expect(doc.format).toBe('cuddlecue-export');
    expect(doc.version).toBe(EXPORT_FORMAT_VERSION);
    expect(doc.generatedAt).toBe(HEADER.generatedAt);
    expect(doc.timeZone).toBe(HEADER.timeZone);
    expect(doc.householdId).toBe('house-1');
  });

  it('holds whatever table it was handed, and sorts them so two exports diff to nothing', () => {
    const doc = exportDocument(HEADER, { zeta: [], alpha: [{ a: 1 }], middle: [] });
    expect(Object.keys(doc.tables)).toEqual(['alpha', 'middle', 'zeta']);
    const again = exportDocument(HEADER, { middle: [], alpha: [{ a: 1 }], zeta: [] });
    expect(exportJson(doc)).toBe(exportJson(again));
  });

  it('is readable by a person as well as a machine', () => {
    const text = exportJson(exportDocument(HEADER, { children: [{ id: 'kid' }] }));
    expect(text).toContain('\n  "tables"');
    expect(JSON.parse(text)).toMatchObject({ householdId: 'house-1' });
  });

  it('carries where the parent heard about the app in the header when they answered, and no key when not', () => {
    // the server keeps that answer and no mirrored table holds it, so the header is the one
    // place the parent's own copy can carry the parent's own answer
    expect(exportDocument({ ...HEADER, heardFrom: 'friend' }, {}).heardFrom).toBe('friend');
    expect(exportDocument(HEADER, {})).not.toHaveProperty('heardFrom');
    expect(exportJson(exportDocument(HEADER, {}))).not.toContain('heardFrom');
  });

  it('keeps an empty table rather than dropping it: "nothing logged" is an answer', () => {
    const doc = exportDocument(HEADER, { activities: [], children: [] });
    expect(Object.keys(doc.tables)).toEqual(['activities', 'children']);
  });
});

describe('the CSV escapes what RFC 4180 says it must', () => {
  it('quotes a field with a comma, a quote or a newline, and doubles the quote', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
    expect(csvField('carriage\rreturn')).toBe('"carriage\rreturn"');
  });

  it('writes an empty field for null, never the four letters', () => {
    // a spreadsheet reading `null` as text is the classic way an export becomes unusable
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
    expect(csvRow(['a', null, 'b'])).toBe('a,,b');
  });

  it('keeps a zero, which is a real value and not an absence', () => {
    expect(csvField(0)).toBe('0');
    expect(csvField(false)).toBe('false');
  });

  it('ends every line with CRLF, header included', () => {
    const out = csvOf(['a', 'b'], [[1, 2]]);
    expect(out).toBe('a,b\r\n1,2\r\n');
  });
});

describe('the activity CSV carries the canonical value AND the one the household typed', () => {
  const rows = [
    activity({
      id: 'b2',
      start_at: '2026-09-14T20:00:00.000Z',
      quantity: 118.294,
      canonical_unit: 'ml',
      detail: { kind: 'EBM', consumed_ml: 118.294 },
    }),
    activity({
      id: 'b1',
      start_at: '2026-09-14T15:00:00.000Z',
      type: 'sleep',
      end_at: '2026-09-14T16:30:00.000Z',
      child_id: 'kid',
    }),
  ];
  const csv = activityCsv(rows, ctx);
  const lines = csv.trim().split('\r\n');

  it('names both columns and both units', () => {
    expect(lines[0]).toBe(ACTIVITY_CSV_HEADER.join(','));
    expect(ACTIVITY_CSV_HEADER).toContain('quantity_canonical');
    expect(ACTIVITY_CSV_HEADER).toContain('quantity_display');
    expect(ACTIVITY_CSV_HEADER).toContain('canonical_unit');
    expect(ACTIVITY_CSV_HEADER).toContain('display_unit');
  });

  it('is oldest first, whatever order it was handed', () => {
    expect(lines[1]).toContain('b1');
    expect(lines[2]).toContain('b2');
  });

  it('converts at the edge and keeps the stored number beside it', () => {
    const bottle = (lines[2] as string).split(',');
    const at = (name: string) => bottle[ACTIVITY_CSV_HEADER.indexOf(name as never)];
    expect(at('quantity_canonical')).toBe('118.294');
    expect(at('canonical_unit')).toBe('ml');
    expect(at('quantity_display')).toBe('4.0');
    expect(at('display_unit')).toBe('oz');
    expect(at('child_name')).toBe('Emma');
  });

  it('computes a duration where there is an end, and leaves it empty where there is not', () => {
    const sleep = (lines[1] as string).split(',');
    expect(sleep[ACTIVITY_CSV_HEADER.indexOf('duration_minutes')]).toBe('90');
    const bottle = (lines[2] as string).split(',');
    expect(bottle[ACTIVITY_CSV_HEADER.indexOf('duration_minutes')]).toBe('');
  });

  it('carries the detail row as JSON in one field, quoted so it cannot break the grid', () => {
    expect(lines[2]).toContain('"{""kind"":""EBM""');
    // and the row still has exactly as many fields as the header
    expect(splitCsvLine(lines[2] as string)).toHaveLength(ACTIVITY_CSV_HEADER.length);
  });

  it('writes a header and nothing else for a household with no entries', () => {
    expect(activityCsv([], ctx)).toBe(`${ACTIVITY_CSV_HEADER.join(',')}\r\n`);
  });
});

describe('the file is named for the day a person will look for', () => {
  it('uses the local date and the right extension', () => {
    expect(exportFileName('json', HEADER.generatedAt)).toBe('cuddlecue-export-2026-09-16.json');
    expect(exportFileName('csv', HEADER.generatedAt)).toBe('cuddlecue-export-2026-09-16.csv');
  });

  it('adds what was chosen, so two exports in a folder are not the same file twice', () => {
    expect(exportFileName('pdf', HEADER.generatedAt, ['30 days', 'Emma'])).toBe(
      'cuddlecue-export-2026-09-16-30-days-emma.pdf',
    );
  });

  it('cannot be broken by a name: a file name is letters, digits and single hyphens', () => {
    expect(fileNamePart("O'Brien & Sons 🍼")).toBe('o-brien-sons');
    expect(fileNamePart('🍼')).toBe('');
    // a part that survives as nothing is dropped rather than left as a bare dash
    expect(exportFileName('pdf', HEADER.generatedAt, ['🍼', '7 days'])).toBe(
      'cuddlecue-export-2026-09-16-7-days.pdf',
    );
  });
});

/** A minimal RFC 4180 reader, so the field-count assertion is a real parse and not a split. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      out.push(field);
      field = '';
    } else field += c;
  }
  out.push(field);
  return out;
}
