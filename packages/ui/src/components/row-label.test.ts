import { describe, expect, it } from 'vitest';
import { rowLabel } from './row-label';

describe('rowLabel', () => {
  it('is the title alone when nothing else is given', () => {
    expect(rowLabel({ title: 'Reminders' })).toBe('Reminders');
  });
  it('reads title, badge, detail, value in scan order', () => {
    expect(
      rowLabel({ title: 'Garage freezer', badge: 'Queued', detail: '12 bags', value: '48 oz' }),
    ).toBe('Garage freezer, Queued, 12 bags, 48 oz');
  });
  it('ends with the soft words before the chevron, where a sighted reader finds them', () => {
    expect(rowLabel({ title: 'Diapers', hint: 'Tap to add' })).toBe('Diapers, Tap to add');
    expect(rowLabel({ title: 'Wipes', detail: 'Water Wipes', value: '2', hint: 'Edit' })).toBe(
      'Wipes, Water Wipes, 2, Edit',
    );
  });
  it('skips empty and blank parts', () => {
    expect(rowLabel({ title: 'Nap', badge: '', detail: '   ', value: '1h 51m' })).toBe(
      'Nap, 1h 51m',
    );
  });
  it('trims each part', () => {
    expect(rowLabel({ title: ' Bath ', detail: ' 8:04 PM ' })).toBe('Bath, 8:04 PM');
  });
});
