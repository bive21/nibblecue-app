/**
 * The one accessible name for a list row (docs/DESIGN_SYSTEM.md §8, docs/MOBILE.md §9): a row
 * groups a title, an optional badge, a detail line, a value and a hint into ONE focus stop, read
 * in the order a sighted user scans it — title, then the status word beside it, then the detail,
 * then the number on the right, then the soft words before the chevron. Pure, so the order is
 * pinned by a test rather than by a screen reader.
 */
export interface RowLabelParts {
  title: string;
  badge?: string;
  detail?: string;
  value?: string;
  hint?: string;
}

export function rowLabel({ title, badge, detail, value, hint }: RowLabelParts): string {
  return [title, badge, detail, value, hint]
    .map(s => (s ?? '').trim())
    .filter(s => s.length > 0)
    .join(', ');
}
