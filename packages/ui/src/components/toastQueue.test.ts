import { describe, expect, it } from 'vitest';
import {
  actionsInOrder,
  INITIAL_TOAST_STATE,
  TOAST_DURATION_MS,
  TOAST_DURATION_TWO_ACTIONS_MS,
  toastDuration,
  toastDurationFor,
  toastReducer,
  UNDO_LABEL,
  type ToastItem,
} from './toastQueue';

const noop = () => {};
const item = (id: string, extra: Partial<ToastItem> = {}): ToastItem => ({
  id,
  message: `Saved ${id}`,
  ...extra,
});

describe('toastDuration', () => {
  it('two actions stay ~7 s, one or none ~5.2 s', () => {
    expect(toastDuration(true, true)).toBe(TOAST_DURATION_TWO_ACTIONS_MS);
    expect(toastDuration(true, true)).toBe(7000);
    expect(toastDuration(true, false)).toBe(TOAST_DURATION_MS);
    expect(toastDuration(false, true)).toBe(TOAST_DURATION_MS);
    expect(toastDuration(false, false)).toBe(5200);
  });
  it('reads the item', () => {
    expect(
      toastDurationFor(item('a', { undo: noop, secondary: { label: '+ Liam', onPress: noop } })),
    ).toBe(7000);
    expect(toastDurationFor(item('a', { undo: noop }))).toBe(5200);
    expect(toastDurationFor(item('a'))).toBe(5200);
  });
});

describe('actionsInOrder — the undo slot invariant', () => {
  it('puts the secondary action first and Undo last, whatever the item carries', () => {
    const order = actionsInOrder({ undo: noop, secondary: { label: '+ Liam', onPress: noop } });
    expect(order.map(a => a.slot)).toEqual(['secondary', 'undo']);
    expect(order[1]?.label).toBe(UNDO_LABEL);
    expect(order[0]?.label).toBe('+ Liam');
  });
  it('an undo alone is still the right-most (only) action, and its label is never renamed', () => {
    const order = actionsInOrder({ undo: noop });
    expect(order.map(a => a.slot)).toEqual(['undo']);
    expect(order[0]?.label).toBe('Undo');
  });
  it('a secondary alone, or nothing', () => {
    expect(
      actionsInOrder({ secondary: { label: 'View', onPress: noop } }).map(a => a.slot),
    ).toEqual(['secondary']);
    expect(actionsInOrder({})).toEqual([]);
  });
  it('wires the callbacks through', () => {
    let hit = '';
    const order = actionsInOrder({
      undo: () => (hit = 'undo'),
      secondary: { label: 'x', onPress: () => (hit = 'secondary') },
    });
    order[0]?.onPress();
    expect(hit).toBe('secondary');
    order[1]?.onPress();
    expect(hit).toBe('undo');
  });
});

describe('toastReducer — one visible at a time', () => {
  it('show puts the item on screen', () => {
    const s = toastReducer(INITIAL_TOAST_STATE, { type: 'show', item: item('a') });
    expect(s.current?.id).toBe('a');
    expect(s.queue).toEqual([]);
  });
  it('a new show REPLACES the current one (the prototype has a single toast)', () => {
    let s = toastReducer(INITIAL_TOAST_STATE, { type: 'show', item: item('a') });
    s = toastReducer(s, { type: 'show', item: item('b') });
    expect(s.current?.id).toBe('b');
    expect(s.queue).toEqual([]);
  });
  it('dismiss and expire both clear the screen when nothing waits', () => {
    const s = toastReducer(INITIAL_TOAST_STATE, { type: 'show', item: item('a') });
    expect(toastReducer(s, { type: 'dismiss' })).toEqual(INITIAL_TOAST_STATE);
    expect(toastReducer(s, { type: 'expire' })).toEqual(INITIAL_TOAST_STATE);
  });
  it('enqueue waits behind the current one and comes up on expire', () => {
    let s = toastReducer(INITIAL_TOAST_STATE, { type: 'show', item: item('a') });
    s = toastReducer(s, { type: 'enqueue', item: item('b') });
    expect(s.current?.id).toBe('a');
    expect(s.queue.map(i => i.id)).toEqual(['b']);
    s = toastReducer(s, { type: 'expire' });
    expect(s.current?.id).toBe('b');
    expect(s.queue).toEqual([]);
  });
  it('enqueue with nothing on screen shows at once', () => {
    const s = toastReducer(INITIAL_TOAST_STATE, { type: 'enqueue', item: item('a') });
    expect(s.current?.id).toBe('a');
  });
  it('show keeps what was queued, behind the replacement', () => {
    let s = toastReducer(INITIAL_TOAST_STATE, { type: 'show', item: item('a') });
    s = toastReducer(s, { type: 'enqueue', item: item('b') });
    s = toastReducer(s, { type: 'show', item: item('c') });
    expect(s.current?.id).toBe('c');
    expect(s.queue.map(i => i.id)).toEqual(['b']);
  });
  it('dismissing an empty state is a no-op', () => {
    expect(toastReducer(INITIAL_TOAST_STATE, { type: 'dismiss' })).toEqual(INITIAL_TOAST_STATE);
  });
});
