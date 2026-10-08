/**
 * THE INVITE LINK, EVERY FORM IT TRAVELS IN (the owner, 2026-09-29: *"Make sure the email invite
 * also works, and bypasses the need to enter 6 random digit"*): the link Family shares, the forms a
 * phone can open, and the whole message pasted back into Join a household.
 */
import { BRAND } from '@nibblecue/brand';
import { describe, expect, it } from 'vitest';
import { JOIN } from '../screens/auth/joinCopy';
import { inviteShareLink, inviteTokenIn, inviteTokenOf } from './inviteLink';

const CTX = { scheme: BRAND.urlScheme, host: BRAND.universalLinkHost };
const TOKEN = 'k3J9_xQ-2mZa8pLr0sTuVwXyZ1234567890abcdEFGH'.slice(0, 43);

describe('the link Family shares', () => {
  it('is the website’s https address, the token after the #, where no server sees it', () => {
    const link = inviteShareLink(TOKEN, { host: BRAND.universalLinkHost, expoGoBase: null });
    expect(link).toBe(`https://${BRAND.universalLinkHost}/app/invite/#${TOKEN}`);
    // and it opens the app: the forms the app reads take it back to the same token
    expect(inviteTokenOf(link, CTX)).toBe(TOKEN);
  });

  it('is Expo Go’s own address while the app runs in Expo Go, the one form that opens it there', () => {
    for (const base of [
      'exp://192.168.1.20:8081/--/',
      'exp://192.168.1.20:8081',
      'exps://u.expo.dev/--/',
    ]) {
      const link = inviteShareLink(TOKEN, { host: BRAND.universalLinkHost, expoGoBase: base });
      expect(link).toMatch(/^exps?:\/\/[^/]+\/--\/invite\//);
      expect(inviteTokenOf(link, CTX)).toBe(TOKEN);
    }
    // an address that is not Expo Go's falls back to the website's
    expect(
      inviteShareLink(TOKEN, { host: BRAND.universalLinkHost, expoGoBase: `${CTX.scheme}://` }),
    ).toMatch(/^https:\/\//);
  });
});

describe('every form a phone can be handed reaches the same token', () => {
  it('reads the app’s scheme, Expo Go’s, the path form and the # form', () => {
    for (const url of [
      `${CTX.scheme}://invite/${TOKEN}`,
      `exp://10.0.0.5:8081/--/invite/${TOKEN}`,
      `https://${CTX.host}/app/invite/${TOKEN}`,
      `https://${CTX.host}/app/invite/#${TOKEN}`,
      `https://${CTX.host}/app/invite#${TOKEN}`,
      `cuddlecue-mock://invite/${TOKEN}`,
    ]) {
      expect(inviteTokenOf(url, CTX), url).toBe(TOKEN);
    }
  });

  it('takes nothing else for a token', () => {
    for (const url of [
      `https://${CTX.host}/app/invite/#short`,
      `https://${CTX.host}/app/invite/`,
      `https://elsewhere.example/app/invite/#${TOKEN}`,
      `https://${CTX.host}/app/today#${TOKEN}`,
      `${CTX.scheme}://invite/${TOKEN}!`,
    ]) {
      expect(inviteTokenOf(url, CTX), url).toBeNull();
    }
  });
});

describe('the whole message, pasted into Join a household', () => {
  it('gives back the token of the link inside it, whatever the link’s form', () => {
    for (const expoGoBase of [null, 'exp://192.168.1.20:8081/--/']) {
      const link = inviteShareLink(TOKEN, { host: BRAND.universalLinkHost, expoGoBase });
      const message = JOIN.share.message('Dana', 'Dana’s family', BRAND.appDisplayName, link);
      expect(inviteTokenIn(message, CTX)).toBe(TOKEN);
    }
  });

  it('reads a link that ends a sentence, and nothing in text without one', () => {
    expect(inviteTokenIn(`Join us: https://${CTX.host}/app/invite/#${TOKEN}.`, CTX)).toBe(TOKEN);
    expect(inviteTokenIn(`(${CTX.scheme}://invite/${TOKEN})`, CTX)).toBe(TOKEN);
    expect(inviteTokenIn('Your code is WDJ-BMA', CTX)).toBeNull();
    expect(inviteTokenIn('', CTX)).toBeNull();
  });
});

describe('the message it goes out in', () => {
  const link = inviteShareLink(TOKEN, { host: BRAND.universalLinkHost, expoGoBase: null });

  it('says who, where, the link, and the way in when a tap does not open the app', () => {
    const m = JOIN.share.message('Dana', 'Dana’s family', BRAND.appDisplayName, link);
    expect(m).toContain(`Dana invited you to join Dana’s family on ${BRAND.appDisplayName}.`);
    expect(m).toContain(`Tap to join: ${link}`);
    expect(m).toContain('It works once, for 48 hours.');
    expect(m).toContain('Join a household');
    expect(m).toContain(JOIN.door.button);
  });

  it('reads without a name, and never carries a dash', () => {
    const m = JOIN.share.message(' ', '', BRAND.appDisplayName, link);
    expect(m).toContain(`You’re invited to join their household on ${BRAND.appDisplayName}.`);
    for (const text of [m, JOIN.share.sent, JOIN.sheet.lede, JOIN.sheet.paste]) {
      expect(text.replace(link, '')).not.toMatch(/[‒-―]| - /);
    }
  });
});
