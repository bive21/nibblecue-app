import { describe, expect, it } from 'vitest';
import { Role } from '../domain/domain-types';
import {
  canLog,
  defaultInviteRole,
  isRole,
  ROLE_DETAILS,
  ROLE_LABELS,
  roleDetail,
  roleLabel,
  VIEW_ONLY_NO_LOG,
} from './roles';

describe('role labels', () => {
  it('names every role, in words a parent would use', () => {
    for (const r of Role.options) {
      const label = roleLabel(r);
      expect(label).toBe(ROLE_LABELS[r]);
      expect(label).not.toMatch(/_|[A-Z]{2,}/);
      expect(label[0]).toBe(label[0]?.toUpperCase());
    }
  });
  it('rejects anything that is not a role', () => {
    expect(isRole('VIEW_ONLY')).toBe(true);
    expect(isRole('ADMIN')).toBe(false);
  });

  /**
   * THE INVITE SCREEN HANDS A STRANGER A KEY, so every role has to be able to say what it opens.
   * A missing line here is a bare pill on that screen, which is what it used to be.
   */
  it('says what every role may do, as a sentence, never as an enum', () => {
    for (const r of Role.options) {
      const detail = roleDetail(r);
      expect(detail).toBe(ROLE_DETAILS[r]);
      expect(detail.length).toBeGreaterThan(20);
      expect(detail).not.toMatch(/_|[A-Z]{2,}|auth\.uid|can_admin|RLS/);
      expect(detail.endsWith('.')).toBe(true);
    }
  });

  it('draws the line a caregiver most needs: they cannot rewrite anyone else’s entries', () => {
    expect(ROLE_DETAILS.CAREGIVER.toLowerCase()).toContain('their own');
    expect(ROLE_DETAILS.VIEW_ONLY.toLowerCase()).toContain('cannot log');
    // and only the owner's line mentions the plan, because only the owner has it
    expect(ROLE_DETAILS.OWNER.toLowerCase()).toContain('plan');
    expect(ROLE_DETAILS.CAREGIVER.toLowerCase()).not.toContain('plan');
  });
});

/**
 * THE OTHER PARENT, INVITED BY DEFAULT AS A CAREGIVER (the handoff audit's U1), lost every
 * reminder unless someone put them on — and nothing on the invite said so.
 */
describe('the role an invite starts on, and what it says about reminders', () => {
  it('starts the second seat on Parent, and every seat after it on Caregiver', () => {
    expect(defaultInviteRole([{ role: 'OWNER' }])).toBe('PARENT');
    expect(defaultInviteRole([{ role: 'OWNER' }, { role: 'CAREGIVER' }])).toBe('PARENT');
    expect(defaultInviteRole([{ role: 'OWNER' }, { role: 'PARENT' }])).toBe('CAREGIVER');
    expect(defaultInviteRole([])).toBe('PARENT');
  });

  it('says a caregiver is reminded only while on, and a parent gets the reminders they choose', () => {
    expect(ROLE_DETAILS.CAREGIVER).toContain('reminders only while they’re on');
    expect(ROLE_DETAILS.PARENT).toContain('reminders they choose');
    expect(ROLE_DETAILS.VIEW_ONLY).toContain('never gets reminders');
  });
});

/**
 * THE SERVER'S `app.can_write`, read on the phone (0108): OWNER, PARENT and CAREGIVER write, a
 * VIEW_ONLY member writes nothing (`sync_apply_op` asks it before every op, 0128). A role not
 * loaded yet is not a refusal: the server decides, as `canChangeEntry` lets it.
 */
describe('canLog', () => {
  it('lets every role but view only write', () => {
    for (const r of Role.options) expect(canLog(r)).toBe(r !== 'VIEW_ONLY');
  });
  it('does not refuse a role it has not read yet', () => {
    expect(canLog(undefined)).toBe(true);
    expect(canLog(null)).toBe(true);
  });
  it('says the refusal in one plain sentence', () => {
    expect(VIEW_ONLY_NO_LOG).toMatch(/^[A-Z][^A-Z]*\.$/);
    expect(VIEW_ONLY_NO_LOG).not.toMatch(/[—–]| - /);
    expect(VIEW_ONLY_NO_LOG.length).toBeLessThan(40);
  });
});
