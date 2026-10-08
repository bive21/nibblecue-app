import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { guardApplies, productionEnvProblem, readEnv } from './env';

describe('the subsystem switch (EXPO_PUBLIC_OFF)', () => {
  it('is empty by default, and reads the names it knows', () => {
    expect([...readEnv({}).off]).toEqual([]);
    expect([...readEnv({ EXPO_PUBLIC_OFF: 'sync' }).off]).toEqual(['sync']);
    expect([...readEnv({ EXPO_PUBLIC_OFF: ' SYNC , ground ' }).off].sort()).toEqual([
      'ground',
      'sync',
    ]);
  });

  it('ignores a name it does not know, rather than failing a launch over a typo', () => {
    expect([...readEnv({ EXPO_PUBLIC_OFF: 'syncc,database' }).off]).toEqual([]);
  });

  it('is ignored in production: a way to find a crash, never a way to ship without a part', () => {
    const env = readEnv({ EXPO_PUBLIC_OFF: 'sync,notifications', EXPO_PUBLIC_ENV: 'production' });
    expect([...env.off]).toEqual([]);
  });

  it('leaves the rest of the environment exactly as it was', () => {
    const env = readEnv({ EXPO_PUBLIC_OFF: 'sync' });
    expect(env.authProvider).toBe('mock');
    expect(env.stage).toBe('development');
    expect(env.communityEnabled).toBe(false);
  });
});

/**
 * COMMUNITY FOLLOWS THE SERVER (the owner, 2026-09-28: "why wouldnt it be available on staging
 * DB?"). Staging's Expo Go settings name the server and nothing else, and it kept every post on
 * the phone; a store build that missed the old switch would have done the same.
 */
describe('Community reaches a server whenever the build has one', () => {
  const staging = {
    EXPO_PUBLIC_AUTH_PROVIDER: 'supabase',
    EXPO_PUBLIC_ENV: 'staging',
    EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_x',
  };

  it('is on for a real server with no switch at all, as staging in Expo Go is set up', () => {
    expect(readEnv(staging).communityEnabled).toBe(true);
    expect(readEnv({ ...staging, EXPO_PUBLIC_COMMUNITY_ENABLED: 'true' }).communityEnabled).toBe(
      true,
    );
  });

  it('is kept on the phone only when a build says false', () => {
    expect(readEnv({ ...staging, EXPO_PUBLIC_COMMUNITY_ENABLED: 'false' }).communityEnabled).toBe(
      false,
    );
    expect(readEnv({ ...staging, EXPO_PUBLIC_COMMUNITY_ENABLED: ' FALSE ' }).communityEnabled).toBe(
      false,
    );
  });

  it('is never on for the in-app test server, whatever the switch says', () => {
    expect(readEnv({}).communityEnabled).toBe(false);
    expect(readEnv({ EXPO_PUBLIC_COMMUNITY_ENABLED: 'true' }).communityEnabled).toBe(false);
    const keysButMock = { ...staging, EXPO_PUBLIC_AUTH_PROVIDER: 'mock' };
    expect(
      readEnv({ ...keysButMock, EXPO_PUBLIC_COMMUNITY_ENABLED: 'true' }).communityEnabled,
    ).toBe(false);
  });
});

/**
 * THE GUARD A STORE BUILD RUNS FIRST (`app.config.ts`). A production build with the keys missing
 * is a mock app in a store listing — every parent's household on their own phone, shared with
 * nobody — and nothing on the screen would have said so.
 */
describe('a production build refuses to be the mock', () => {
  it('says nothing about a development or staging build', () => {
    expect(productionEnvProblem({})).toBe(null);
    expect(productionEnvProblem({ EXPO_PUBLIC_ENV: 'staging' })).toBe(null);
  });

  it('names every missing value, so the fix is the value', () => {
    const problem = productionEnvProblem({ EXPO_PUBLIC_ENV: 'production' });
    expect(problem).toContain('EXPO_PUBLIC_SUPABASE_URL');
    expect(problem).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    expect(problem).toContain('EXPO_PUBLIC_AUTH_PROVIDER=supabase');
  });

  it('refuses a provider that was left on mock even with keys present', () => {
    const problem = productionEnvProblem({
      EXPO_PUBLIC_ENV: 'production',
      EXPO_PUBLIC_AUTH_PROVIDER: 'mock',
      EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_x',
    });
    expect(problem).toContain('EXPO_PUBLIC_AUTH_PROVIDER=supabase');
    expect(problem).not.toContain('EXPO_PUBLIC_SUPABASE_URL');
  });

  it('refuses a plain-http project URL', () => {
    const problem = productionEnvProblem({
      EXPO_PUBLIC_ENV: 'production',
      EXPO_PUBLIC_AUTH_PROVIDER: 'supabase',
      EXPO_PUBLIC_SUPABASE_URL: 'http://x.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_x',
    });
    expect(problem).toContain('https://');
  });

  it('is satisfied by a real provider with both keys', () => {
    expect(
      productionEnvProblem({
        EXPO_PUBLIC_ENV: 'production',
        EXPO_PUBLIC_AUTH_PROVIDER: 'supabase',
        EXPO_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'sb_publishable_x',
      }),
    ).toBe(null);
  });
});

/**
 * WHERE IT HOLDS (2026-09-25). EAS reads the config on the owner's computer before it has the
 * EAS environment — once, with only the profile's env, to learn the project id. Refused there,
 * every production build stopped before it began. It holds where the app is made.
 */
describe('the production guard holds where the app is built or bundled', () => {
  it('holds on an EAS build worker, whatever the command', () => {
    expect(guardApplies({ EAS_BUILD: 'true' }, ['prebuild'])).toBe(true);
    expect(guardApplies({ EAS_BUILD: 'true' }, ['config', '--json'])).toBe(true);
  });

  it('holds in the export `eas update` runs here, and the embed a local release build runs', () => {
    expect(guardApplies({}, ['export', '--output-dir', 'dist', '--platform', 'all'])).toBe(true);
    expect(guardApplies({}, ['export:embed', '--platform', 'android'])).toBe(true);
  });

  it('does not hold on the read EAS makes first, or on a developer’s own commands', () => {
    expect(guardApplies({}, ['config', '--json', '--type', 'public'])).toBe(false);
    expect(guardApplies({}, ['build', '-p', 'android', '--profile', 'production'])).toBe(false);
    expect(guardApplies({}, ['update', '--channel', 'production'])).toBe(false);
    expect(guardApplies({}, ['start'])).toBe(false);
    expect(guardApplies({ EAS_BUILD: 'false' }, [])).toBe(false);
  });

  it('is what app.config.ts asks before it refuses', () => {
    const config = readFileSync(join(__dirname, '..', 'app.config.ts'), 'utf8');
    // NibbleCue's config names the answer `releasing` and adds the identifier check to it
    expect(config).toContain('const releasing = guardApplies(process.env, process.argv.slice(2));');
    expect(config).toMatch(/const problem = releasing\s*\?\s*\(productionEnvProblem\(/);
    expect(config).toContain('if (problem !== null) throw new Error(`app.config.ts: ${problem}`);');
  });
});

describe('the store keys', () => {
  it('are read per platform, and absent until the owner has a RevenueCat project', () => {
    expect(readEnv({}).revenueCat).toEqual({ android: null, ios: null });
    expect(
      readEnv({
        EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: ' goog_abc ',
        EXPO_PUBLIC_REVENUECAT_IOS_KEY: '',
      }).revenueCat,
    ).toEqual({ android: 'goog_abc', ios: null });
  });
});
