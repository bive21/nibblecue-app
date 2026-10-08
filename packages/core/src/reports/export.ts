/**
 * The FULL DOWNLOAD (PRODUCT_SPEC.md §8; CLAUDE.md §4).
 *
 * This is a legal duty, not a feature. GDPR Art. 20 read with Art. 12 requires the first copy of
 * a person's own data, free, in a structured, commonly used, machine-readable format; UK GDPR
 * and CCPA agree. So it is on every plan, it is one button, and it is never harder to find than
 * the paid export — which sells the CONVENIENT one (a range, one child, a PDF, by email), not
 * the right to the data.
 *
 * TWO FORMATS, TWO AUDIENCES.
 *
 *   JSON is the portability copy: the household's whole record, table by table, exactly as it is
 *   stored. It is COMPLETE BY CONSTRUCTION — the caller hands over every mirrored table and the
 *   document is built from whatever arrived, so a table added next year is in the export the day
 *   it exists rather than the day somebody remembers it. `export.test.ts` asserts the set
 *   against `MIRRORED_TABLES` for exactly that reason; an allow-list would have been a promise
 *   to keep updating, and promises like that are the ones that quietly lapse.
 *
 *   CSV is the spreadsheet copy: one row per activity, with the canonical value AND the display
 *   value side by side (§8). Canonical alone makes a parent read millilitres they never typed;
 *   display alone loses the precision and the unit the record was stored in. Both, named, costs
 *   two columns and settles it.
 *
 * WHAT IS NOT IN IT: the sync machinery (the outbox, the cursors, the dedupe keys) is the app's
 * bookkeeping, not the household's record, and a token is never anybody's data. The rows those
 * tables would carry are already here, in the tables they were written to.
 */

/** Bumped when the SHAPE changes, so an importer can tell what it is reading. */
export const EXPORT_FORMAT_VERSION = 1;

export interface ExportHeader {
  format: 'cuddlecue-export';
  version: number;
  /** ISO instant the file was built. */
  generatedAt: string;
  householdId: string;
  /** The household's zone, so a reader can turn the UTC instants back into local times. */
  timeZone: string;
  /**
   * Where the household's creator said they heard about the app (a key from
   * `HEARD_FROM_OPTIONS`), when they answered. The server keeps it and no table on the phone
   * carries it, so it rides the header rather than a row: the parent's own answer belongs in the
   * parent's own copy, and a download that quietly left it out would not be the whole record.
   */
  heardFrom?: string;
}

export interface ExportDocument extends ExportHeader {
  /** Table name → its rows, as stored. */
  tables: Record<string, readonly Record<string, unknown>[]>;
}

export function exportDocument(
  header: Omit<ExportHeader, 'format' | 'version'>,
  tables: Record<string, readonly Record<string, unknown>[]>,
): ExportDocument {
  return {
    format: 'cuddlecue-export',
    version: EXPORT_FORMAT_VERSION,
    ...header,
    // sorted, so two exports of the same data are byte-identical and a diff means a change
    tables: Object.fromEntries(Object.entries(tables).sort(([a], [b]) => a.localeCompare(b))),
  };
}

/** Pretty-printed: a person may open this in a text editor, and two spaces is what that costs. */
export const exportJson = (doc: ExportDocument): string => JSON.stringify(doc, null, 2);

/* ------------------------------------------------------------------ CSV */

/**
 * RFC 4180: a field containing a comma, a quote or a newline is quoted, and a quote inside it is
 * doubled. `null` and `undefined` are the EMPTY field, not the four letters "null" — a
 * spreadsheet reading `null` as text is the classic way an export becomes unusable.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CRLF, which is what RFC 4180 says and what Excel expects. */
export const csvRow = (cells: readonly unknown[]): string => cells.map(csvField).join(',');

export const csvOf = (header: readonly string[], rows: readonly (readonly unknown[])[]): string =>
  [csvRow(header), ...rows.map(csvRow)].join('\r\n') + '\r\n';

/** The columns of the activity CSV, in order. */
export const ACTIVITY_CSV_HEADER = [
  'id',
  'child_id',
  'child_name',
  'type',
  'start_at',
  'end_at',
  'duration_minutes',
  'quantity_canonical',
  'canonical_unit',
  'quantity_display',
  'display_unit',
  'notes',
  'is_private',
  'created_by',
  'detail',
] as const;

export interface ExportActivity {
  id: string;
  child_id: string | null;
  type: string;
  start_at: string;
  end_at: string | null;
  quantity: number | null;
  canonical_unit: string | null;
  notes: string | null;
  is_private: number | boolean | null;
  created_by: string | null;
  /** The detail row for this activity, as stored; omitted where the type has none. */
  detail?: Record<string, unknown> | null;
}

export interface ActivityCsvContext {
  /** Child id → name, so the file reads without a second lookup. */
  childName: (id: string | null) => string;
  /** A canonical value in its unit → the household's own display value, e.g. 118 ml → "4". */
  display: (quantity: number, canonicalUnit: string) => { value: string; unit: string };
}

const MIN = 60_000;

/**
 * One row per activity, oldest first — reading order for a person scrolling a spreadsheet, and
 * stable across exports so two files of the same data diff to nothing.
 */
export function activityCsv(rows: readonly ExportActivity[], ctx: ActivityCsvContext): string {
  const ordered = [...rows].sort(
    (a, b) => Date.parse(a.start_at) - Date.parse(b.start_at) || a.id.localeCompare(b.id),
  );
  return csvOf(
    ACTIVITY_CSV_HEADER,
    ordered.map(r => {
      const end = r.end_at === null ? null : Date.parse(r.end_at);
      const start = Date.parse(r.start_at);
      const minutes = end !== null && end > start ? Math.round((end - start) / MIN) : null;
      const shown =
        r.quantity !== null && r.canonical_unit !== null
          ? ctx.display(r.quantity, r.canonical_unit)
          : null;
      return [
        r.id,
        r.child_id,
        ctx.childName(r.child_id),
        r.type,
        r.start_at,
        r.end_at,
        minutes,
        r.quantity,
        r.canonical_unit,
        shown?.value ?? null,
        shown?.unit ?? null,
        r.notes,
        r.is_private ? 'true' : 'false',
        r.created_by,
        r.detail ? JSON.stringify(r.detail) : null,
      ];
    }),
  );
}

/**
 * A file name safe on every platform a share sheet can reach: lower case, letters, digits and
 * single hyphens. Anything else — an apostrophe in a name, an accent, an emoji, a slash — becomes
 * a hyphen, and a part that survives as nothing is dropped rather than left as a bare dash.
 *
 * It is capped because a chosen export names its range and its child, and a file name is not the
 * place to discover that somebody typed a sentence into the name field.
 */
export const fileNamePart = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/, '');

/**
 * `cuddlecue-export-2026-09-16.json` — the date a person will look for, not an epoch.
 *
 * A CHOSEN export adds what was chosen: `cuddlecue-export-2026-09-16-30-days-emma.pdf`. Two files
 * in a downloads folder that differ only in their contents are two files nobody can tell apart,
 * and the whole point of this export is that the parent picked something.
 */
export function exportFileName(
  extension: 'json' | 'csv' | 'pdf' | 'html',
  generatedAt: string,
  parts: readonly string[] = [],
): string {
  const day = generatedAt.slice(0, 10);
  const chosen = parts.map(fileNamePart).filter(p => p !== '');
  return `cuddlecue-export-${[day, ...chosen].join('-')}.${extension}`;
}
