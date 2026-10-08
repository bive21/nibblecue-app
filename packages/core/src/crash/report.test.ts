/**
 * WHAT A CRASH REPORT KEEPS (docs/CRASH_REPORTS.md). Each test is one way a person could have
 * reached a report, and the proof that they do not.
 */
import { describe, expect, it } from 'vitest';
import {
  CRASH_LIMITS,
  crashDetails,
  crashReportFrom,
  type CrashFacts,
  frameLocation,
  parseCrashReport,
  scrubNames,
  scrubText,
  trimComponentStack,
  trimStack,
} from './report';

const NAMES = ['Dana Iversen', 'Emma', 'The Iversen family', 'dana@example.test'];

const facts = (over: Partial<CrashFacts> = {}): CrashFacts => ({
  error: new TypeError('boom'),
  source: 'render',
  fatal: true,
  at: Date.parse('2026-10-08T12:00:00.000Z'),
  appVersion: '0.2.1',
  runtime: 'embedded',
  platform: 'android',
  osVersion: '15',
  route: 'Today',
  names: NAMES,
  ...over,
});

describe('scrubText', () => {
  it('takes out an email, a uuid, a date and a long number', () => {
    const out = scrubText(
      'dana@example.test saved 7f9c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b at 2026-08-15T10:00:00Z, 123456 g',
    );
    expect(out).toBe('[email] saved [id] at [date], [number] g');
  });

  it('takes a date and the number after it out as two things', () => {
    expect(scrubText('2026-08-15 123456')).toBe('[date] [number]');
    expect(scrubText('2026-08-15 10:30:00.123+02:00 ok')).toBe('[date] ok');
  });

  it('keeps a number of four digits or fewer, which is code, not a person', () => {
    expect(scrubText('index 12 of 4096')).toBe('index 12 of 4096');
  });

  it('takes out a phone number written with separators', () => {
    expect(scrubText('call +1 (555) 123-4567 now')).toBe('call [number] now');
  });

  it('takes out a token and a long quoted string, and leaves an apostrophe alone', () => {
    expect(
      scrubText('jwt eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc12345xyz'),
    ).toBe('jwt [token]');
    expect(scrubText('Unexpected value "she ate half a banana and some yogurt"')).toBe(
      'Unexpected value "[text]"',
    );
    expect(
      scrubText("Couldn't get the navigation state. Is your component inside a navigator?"),
    ).toBe("Couldn't get the navigation state. Is your component inside a navigator?");
  });

  it('keeps a long identifier with no digit in it, which is code', () => {
    expect(scrubText('useNavigationStateFromSomewhereDeep failed')).toBe(
      'useNavigationStateFromSomewhereDeep failed',
    );
  });

  it('takes out a home folder', () => {
    expect(scrubText('/Users/dana/app/x.ts and /home/brad/y.ts')).toBe(
      '/Users/[user]/app/x.ts and /home/[user]/y.ts',
    );
  });

  it('takes out every name the phone knows, whole and by word, in any case', () => {
    expect(scrubText("Emma's bottle for DANA in The Iversen family", NAMES)).toBe(
      "[name]'s bottle for [name] in [name]",
    );
    expect(scrubText('emmanuel is not emma', ['Emma'])).toBe('emmanuel is not [name]');
  });

  it('takes a name in another script out as a word', () => {
    expect(scrubText('Zoë logged', ['Zoë'])).toBe('[name] logged');
    expect(scrubText('名前は さくら です', ['さくら'])).toBe('名前は [name] です');
  });
});

describe('scrubNames', () => {
  it('splits a name into its words of three letters or more, longest first', () => {
    expect(scrubNames(['Ana Li', 'Emma Rose'])).toEqual([
      'Emma Rose',
      'Ana Li',
      'Emma',
      'Rose',
      'Ana',
    ]);
  });

  it('ignores an empty or one-letter name', () => {
    expect(scrubNames(['', ' ', 'A'])).toEqual([]);
  });
});

describe('frameLocation', () => {
  it('keeps a release bundle frame as its file and position', () => {
    expect(
      frameLocation(
        'address at /data/user/0/app.example/files/.expo-internal/7f9c1a2b.bundle:1:234567',
      ),
    ).toBe('7f9c1a2b.bundle:1:234567');
  });

  it('drops a Metro URL’s host and query', () => {
    expect(
      frameLocation(
        'http://192.168.1.20:8081/index.bundle//&platform=android&dev=true?x=1:1201:33',
      ),
    ).toBe('index.bundle:1201:33');
  });

  it('keeps a source path from the repository’s own folders on', () => {
    expect(frameLocation('/Users/dana/code/app/apps/mobile/src/app/navigation.tsx:12:3')).toBe(
      'apps/mobile/src/app/navigation.tsx:12:3',
    );
  });
});

describe('trimStack', () => {
  const V8 = [
    'TypeError: Cannot read properties of undefined (reading x) for Emma',
    '    at TodayScreen (/Users/dana/app/apps/mobile/src/screens/today/TodayScreen.tsx:120:9)',
    '    at renderWithHooks (/Users/dana/app/node_modules/react-dom/cjs/react-dom.js:1:2)',
    '    at /Users/dana/app/apps/mobile/src/app/navigation.tsx:40:1',
  ].join('\n');

  it('keeps the app’s own frames and drops the message and the library frames', () => {
    expect(trimStack(V8)).toBe(
      [
        'TodayScreen (apps/mobile/src/screens/today/TodayScreen.tsx:120:9)',
        'anonymous (apps/mobile/src/app/navigation.tsx:40:1)',
      ].join('\n'),
    );
  });

  it('reads a Hermes and a JSC stack', () => {
    expect(trimStack('Error: x\n    at onPress (address at index.android.bundle:1:9999)')).toBe(
      'onPress (index.android.bundle:1:9999)',
    );
    expect(trimStack('onPress@main.jsbundle:1:5\n[native code]')).toBe(
      'onPress (main.jsbundle:1:5)',
    );
  });

  it('stops at the frame cap', () => {
    const many = Array.from({ length: 60 }, (_, i) => `    at f${i} (index.bundle:1:${i})`).join(
      '\n',
    );
    expect(trimStack(many).split('\n')).toHaveLength(CRASH_LIMITS.frames);
  });

  it('is empty for no stack', () => {
    expect(trimStack(undefined)).toBe('');
  });
});

describe('trimComponentStack', () => {
  it('names the components, innermost first', () => {
    expect(
      trimComponentStack(
        '\n    in TodayScreen (at x.tsx:1)\n    in Freeze\n    at AppTabs (y.js:2:3)',
      ),
    ).toBe('TodayScreen < Freeze < AppTabs');
  });
});

describe('crashReportFrom', () => {
  it('builds a report the schema accepts', () => {
    const r = crashReportFrom(facts());
    expect(parseCrashReport(r)).toEqual(r);
    expect(r).toMatchObject({
      error_name: 'TypeError',
      message: 'boom',
      source: 'render',
      fatal: true,
      platform: 'android',
      route: 'Today',
      occurred_at: '2026-10-08T12:00:00.000Z',
    });
  });

  it('carries no name, address or id the phone knows, anywhere in the report', () => {
    const err = new Error(
      'Emma could not be saved for dana@example.test in The Iversen family (7f9c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b)',
    );
    err.stack = `Error: ${err.message}\n    at saveEmma (index.bundle:1:2)`;
    const r = crashReportFrom(facts({ error: err, componentStack: '    in Emma\n    in Today' }));
    const all = JSON.stringify(r);
    for (const leak of ['Emma', 'Dana', 'dana@', 'Iversen', '7f9c1a2b'])
      expect(all).not.toContain(leak);
    expect(r.message).toBe('[name] could not be saved for [email] in [name] ([id])');
    // a function name is camel case: the name is taken out from inside it too
    expect(r.stack).toContain('save[name] (index.bundle:1:2)');
  });

  it('keeps the update id in the runtime tag, which is the build and not a person', () => {
    const r = crashReportFrom(
      facts({ runtime: 'production/7f9c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b' }),
    );
    expect(r.runtime).toBe('production/7f9c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b');
    expect(crashReportFrom(facts({ runtime: '<script>' })).runtime).toBe('script');
  });

  it('clips every field to its column', () => {
    const r = crashReportFrom(
      facts({
        error: new Error('x'.repeat(5000)),
        appVersion: '9'.repeat(100),
        osVersion: 'v'.repeat(100),
        runtime: 'r'.repeat(100),
      }),
    );
    expect(r.message.length).toBeLessThanOrEqual(CRASH_LIMITS.message);
    expect(r.app_version.length).toBeLessThanOrEqual(CRASH_LIMITS.appVersion);
    expect(r.os_version?.length).toBeLessThanOrEqual(CRASH_LIMITS.osVersion);
    expect(r.runtime?.length).toBeLessThanOrEqual(CRASH_LIMITS.runtime);
    expect(parseCrashReport(r)).not.toBeNull();
  });

  it('describes a thrown value that is not an error without printing it', () => {
    expect(crashReportFrom(facts({ error: { secret: 'Emma' } })).message).toBe(
      'A value that is not an error was thrown',
    );
    expect(crashReportFrom(facts({ error: 42 })).message).toBe('A number was thrown');
    expect(crashReportFrom(facts({ error: 'plain words' })).message).toBe('plain words');
  });

  it('keeps an error name only when it is a class name', () => {
    const odd = new Error('x');
    odd.name = 'Emma broke it';
    expect(crashReportFrom(facts({ error: odd })).error_name).toBe('Error');
  });

  it('drops a route that is not one of the app’s own names', () => {
    expect(crashReportFrom(facts({ route: 'Emma Rose' })).route).toBeNull();
    expect(crashReportFrom(facts({ route: null })).route).toBeNull();
  });
});

describe('parseCrashReport', () => {
  it('refuses what is not a report', () => {
    expect(parseCrashReport(null)).toBeNull();
    expect(parseCrashReport({ error_name: 'x' })).toBeNull();
  });
});

describe('crashDetails', () => {
  it('is the report, nothing more', () => {
    const r = crashReportFrom(facts());
    const text = crashDetails(r);
    expect(text.startsWith('TypeError: boom')).toBe(true);
    expect(text).toContain('on Today');
    expect(text).not.toContain('Emma');
  });
});
