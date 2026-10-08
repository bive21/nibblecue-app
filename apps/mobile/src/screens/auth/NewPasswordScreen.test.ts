/**
 * A signed-in password change asks for the current password. A recovery link does not: the
 * emailed token is the check. Forgetting the current password, or having no password,
 * offers that same emailed link.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'NewPasswordScreen.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  .replace(/\s+/g, ' ');

describe('changing a password while signed in', () => {
  it('asks for the current password, and checks it, unless this is a recovery link', () => {
    expect(src).toContain('testID="newpassword.current"');
    expect(src).toContain(
      "if (!recovery && !current) return setError('Enter your current password.');",
    );
    expect(src).toContain('await auth.signInWithPassword(email, current);');
    expect(src).toContain('await auth.updatePassword(password, current);');
    expect(src).toContain('await auth.updatePassword(password);');
    const current = src.indexOf('testID="newpassword.current"');
    const next = src.indexOf('testID="newpassword.password"');
    expect(current).toBeGreaterThan(-1);
    expect(current).toBeLessThan(next);
    expect(src).toContain('{recovery ? null : (');
  });

  it('is a full page, and Not now returns to the page under it', () => {
    expect(src).toContain('title="Choose a new password"');
    expect(src).not.toContain('chrome={false}');
    expect(src).toContain("addListener('beforeRemove'");
    expect(src).toContain('actions.clearRecovery()');
    expect(src).toContain('if (!backHeld()) nav.goBack();');
    expect(src).toContain('onPress={leave}');
    expect(src).toContain('<AuthSignature />');
    const nav = readFileSync(join(here, '../../app/navigation.tsx'), 'utf8');
    const screens = nav.split('name="NewPassword"').slice(1);
    expect(screens).toHaveLength(3);
    for (const screen of screens) {
      expect(screen.slice(0, screen.indexOf('/>'))).not.toContain('formSheet');
    }
  });

  it('emails a link when the current password is forgotten, and when the account has none', () => {
    expect(src).toContain('testID="newpassword.forgot"');
    expect(src).toContain('Forgot it? Email me a link');
    expect(src.indexOf('testID="newpassword.forgot"')).toBeGreaterThan(
      src.indexOf('testID="newpassword.current"'),
    );
    expect(src).toContain("else if (email) setMode('email');");
    expect(src).toContain("else setMode('none');");
    expect(src).toContain('testID="newpassword.email"');
    expect(src).toContain('await auth.sendPasswordReset(email);');
  });
});
