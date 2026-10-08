import { allChildrenLabel } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { slotWhose } from './whose';

const twins = [
  { id: 'chichi', name: 'Chichi' },
  { id: 'ara', name: 'Ara' },
];
const both = { isAll: true, children: twins };

describe('whose a slot is on Both (the owner, 2026-09-30)', () => {
  it('names the baby a rule is for', () => {
    expect(slotWhose({ childId: 'ara', activity: 'bottle' }, both)).toBe('Ara');
    expect(slotWhose({ childId: 'chichi', activity: 'diaper' }, both)).toBe('Chichi');
  });

  it('says the Both chip’s own word for a rule that is every baby’s', () => {
    expect(slotWhose({ childId: null, activity: 'bottle' }, both)).toBe(allChildrenLabel(2));
    const three = { isAll: true, children: [...twins, { id: 'mo', name: 'Mo' }] };
    expect(slotWhose({ childId: null, activity: 'sleep' }, three)).toBe(allChildrenLabel(3));
  });

  it('puts no label on the parent’s own rhythm', () => {
    expect(slotWhose({ childId: null, activity: 'pump' }, both)).toBeNull();
  });

  it('puts no label on anything with one baby in view', () => {
    expect(
      slotWhose({ childId: 'ara', activity: 'bottle' }, { isAll: false, children: twins }),
    ).toBeNull();
    expect(
      slotWhose({ childId: null, activity: 'bottle' }, { isAll: true, children: [twins[0]!] }),
    ).toBeNull();
  });

  it('draws nothing for a baby who is not in the household any more', () => {
    expect(slotWhose({ childId: 'gone', activity: 'bottle' }, both)).toBeNull();
  });
});

// (CuddleCue's Up next and Schedule, which wear the label, are not in NibbleCue.)
