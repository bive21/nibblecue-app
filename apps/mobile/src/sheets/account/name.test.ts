/**
 * Account & privacy lets a person change the name the household sees. The rule is the join
 * confirmation's, so the two pages cannot refuse a name in different words.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { JOIN } from '../../screens/auth/joinCopy';
import { YOUR_NAME } from './nameCopy';

const here = dirname(fileURLToPath(import.meta.url));
const code = (rel: string): string =>
  readFileSync(join(here, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

describe('changing your name', () => {
  it('uses the join page’s rule, help and failure, with no dash', () => {
    const joined = readFileSync(join(here, '../../screens/auth/JoinedScreen.tsx'), 'utf8');
    const rule = joined.match(/export const NAME_RULE = '([^']+)'/)?.[1];
    expect(YOUR_NAME.rule).toBe(rule);
    expect(YOUR_NAME.help).toBe(JOIN.joined.nameHelp);
    expect(YOUR_NAME.failed).toBe(JOIN.joined.nameFailed);
    for (const line of Object.values(YOUR_NAME)) {
      expect(line).not.toMatch(/[—–]| - /);
    }
  });

  it('opens from the Name row and writes the caller’s own profile', () => {
    const account = code('../../screens/account/AccountScreen.tsx');
    const start = account.indexOf('title="Name"');
    const row = account.slice(start, account.indexOf('/>', start));
    expect(row).toContain('onPress={() => setNameOpen(true)}');
    expect(row).not.toContain('right="none"');
    const sheet = code('./NameSheet.tsx');
    expect(sheet).toContain('DisplayNameSchema.safeParse(wanted)');
    expect(sheet).toContain('api.setDisplayName(wanted)');
    const wrote = sheet.indexOf('api.setDisplayName(wanted)');
    const read = sheet.indexOf('actions.refreshAccount()');
    const pull = sheet.indexOf('.pullNow()');
    const closed = sheet.indexOf('onClose(); toast.show(YOUR_NAME.saved)');
    expect(read).toBeGreaterThan(wrote);
    expect(pull).toBeGreaterThan(read);
    expect(closed).toBeGreaterThan(pull);
  });
});
