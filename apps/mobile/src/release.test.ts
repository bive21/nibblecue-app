/**
 * THE RELEASE RULES THAT MUST HOLD FOR REAL ENTRIES TO BE SAFE (docs/RELEASES.md).
 *
 * The trial runs on the production server with the household's real entries from its first day
 * (the owner, 2026-09-24: "prod from the start"), installed from the Play Store's internal testing
 * track. Three things decide which server a phone talks to — the EAS build profile, the EAS
 * environment it reads the server settings from, and the update channel the binary listens on —
 * and a mistake in any of them points a real phone at the wrong place. These are held here
 * because nothing else in the repository reads `eas.json`, and a build is the first time it would
 * otherwise be noticed.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runningUpdate, updateChannel } from './app/updates';
import brand from '@nibblecue/brand/brand.json';
import { identifierProblem } from '../env.guard.cjs';
import { readEnv, releaseEnvProblem } from './env';

const root = resolve(__dirname, '..');
/** The repository's root, where the toolchain is declared (package.json, .nvmrc). */
const REPO = resolve(root, '..', '..');
const eas = JSON.parse(readFileSync(join(root, 'eas.json'), 'utf8')) as {
  cli: { appVersionSource: string };
  build: Record<
    string,
    {
      node?: string;
      pnpm?: string;
      channel?: string;
      environment?: string;
      autoIncrement?: boolean;
      env?: Record<string, string>;
      android?: { buildType?: string };
    }
  >;
  submit: Record<string, { android?: { track?: string; releaseStatus?: string } }>;
};
const config = readFileSync(join(root, 'app.config.ts'), 'utf8');

describe('the build profiles', () => {
  it('builds for the store on the production channel, from the production environment, as a bundle', () => {
    const p = eas.build['production'];
    expect(p?.channel).toBe('production');
    expect(p?.environment).toBe('production');
    expect(p?.env?.['EXPO_PUBLIC_ENV']).toBe('production');
    expect(p?.env?.['EXPO_PUBLIC_AUTH_PROVIDER']).toBe('supabase');
    // social buttons are drawn only when these are true (AUTH_AND_TRIAL.md §2.0); baked into the
    // production profile so the 0.1.1 binary shows Apple and Google without a forgotten Expo flag
    expect(p?.env?.['EXPO_PUBLIC_GOOGLE_SIGN_IN_ENABLED']).toBe('true');
    expect(p?.env?.['EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED']).toBe('true');
    expect(p?.android?.buildType).toBe('app-bundle');
    // version codes live with EAS and only ever go up; a reused one is refused by Play
    expect(p?.autoIncrement).toBe(true);
    expect(eas.cli.appVersionSource).toBe('remote');
  });

  it('keeps staging on its own channel and environment, so a staging update never reaches the store build', () => {
    const p = eas.build['preview'];
    expect(p?.channel).toBe('preview');
    expect(p?.environment).toBe('preview');
    expect(p?.env?.['EXPO_PUBLIC_ENV']).toBe('staging');
    expect(p?.channel).not.toBe(eas.build['production']?.channel);
  });

  it('names no server in the repository: the URL and key come from each EAS environment', () => {
    for (const [name, p] of Object.entries(eas.build)) {
      expect(Object.keys(p.env ?? {}), name).not.toContain('EXPO_PUBLIC_SUPABASE_URL');
      expect(Object.keys(p.env ?? {}), name).not.toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY');
    }
  });

  /**
   * THE BUILD WORKER RUNS THE REPOSITORY'S NODE AND PNPM, not whatever its image carries
   * (2026-09-25). `app.config.ts` imports `coins.ts` by path, and Expo's config loader hands that
   * `.ts` file to Node's own type stripping — on by default only from Node 22.18 and 23.6. React
   * Native 0.86 still accepts Node 20.19 and 22.13, so an image default on either would stop every
   * build at "read app config", before anything is compiled. EAS reads neither `.nvmrc` nor
   * `engines`; it reads these two fields.
   */
  it('builds on the Node and pnpm the repository declares', () => {
    const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')) as {
      packageManager: string;
      engines: { node: string };
    };
    const floor = /^>=(\d+)\.(\d+)/.exec(pkg.engines.node);
    expect(floor, 'the root package.json names a minimum Node').not.toBeNull();
    const [, floorMajor, floorMinor] = (floor ?? []).map(Number);
    for (const [name, p] of Object.entries(eas.build)) {
      expect(p.pnpm, name).toBe(pkg.packageManager.replace(/^pnpm@/, ''));
      const node = /^(\d+)\.(\d+)\.(\d+)$/.exec(p.node ?? '');
      expect(node, `${name} pins an exact Node version`).not.toBeNull();
      const [, major, minor] = (node ?? []).map(Number);
      expect(major, name).toBe(floorMajor);
      expect(minor, name).toBeGreaterThanOrEqual(floorMinor ?? Infinity);
    }
    // the same major CI and every developer use
    expect(readFileSync(join(REPO, '.nvmrc'), 'utf8').trim()).toBe(String(floorMajor));
  });

  it('submits store builds to the internal testing track, where the trial runs', () => {
    // the owner, 2026-09-24: the trial comes from the Play Store rather than a downloaded APK.
    // Moving to production is a change to this line on launch day, never a default.
    expect(eas.submit['production']?.android?.track).toBe('internal');
  });
});

describe('over-the-air updates', () => {
  it('point at the owner’s EAS project, whose id is read from brand.json and never typed', () => {
    // NibbleCue's project does not exist yet (brand.json `unconfirmed.easProjectId` is a
    // placeholder until the owner runs `eas init`): the config then sets no update URL at all,
    // and a release build refuses to start until the id is recorded (`identifierProblem`)
    expect(config).toContain('unconfirmed.easProjectId');
    expect(config).toContain(
      'const easProjectId = /^\\{\\{.+\\}\\}$/.test(unconfirmed.easProjectId)',
    );
    expect(config).toContain('https://u.expo.dev/${easProjectId}');
    expect(config).toContain('eas: { projectId: easProjectId }');
    expect(config).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    const placeholder = /^\{\{.+\}\}$/.test(brand.unconfirmed.easProjectId);
    const problem = identifierProblem({ ...brand, proposed: {} });
    if (placeholder) expect(problem).toContain('easProjectId');
    else expect(problem).toBeNull();
  });

  it('are offered only to binaries that share this app version', () => {
    // `appVersion` (2026-10-02): an OTA for 0.1.0 never reaches a 0.1.1 binary, and a forgotten
    // native change is fixed by bumping package.json for the next store build — the safe miss
    // is an update that does not arrive, not a crash on launch from calling missing native code
    expect(config).toContain("runtimeVersion: { policy: 'appVersion' }");
  });

  it('never hold the app on the splash screen for a download', () => {
    expect(config).toContain("checkAutomatically: 'ON_LOAD'");
    expect(config).toContain('fallbackToCacheTimeout: 0');
  });

  it('read as none in node, Expo Go and a development build', () => {
    expect(updateChannel()).toBeNull();
    expect(runningUpdate()).toBeNull();
  });
});

describe('a store build never runs on the test backend', () => {
  const real = readEnv({
    EXPO_PUBLIC_AUTH_PROVIDER: 'supabase',
    EXPO_PUBLIC_SUPABASE_URL: 'https://example.invalid',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
    EXPO_PUBLIC_ENV: 'production',
  });
  const mock = readEnv({});

  it('lets Expo Go and a development build run on the mock, as they always have', () => {
    expect(mock.authProvider).toBe('mock');
    expect(releaseEnvProblem(null, mock)).toBeNull();
  });

  it('lets a store build run with its server settings', () => {
    expect(releaseEnvProblem('production', real)).toBeNull();
    expect(releaseEnvProblem('preview', real)).toBeNull();
  });

  it('stops a store build whose JavaScript lost its server settings, naming what is missing', () => {
    // an update bundled without the production environment would otherwise sign a parent into a
    // backend that lives on the phone, over the household's real entries
    for (const channel of ['production', 'preview']) {
      const problem = releaseEnvProblem(channel, mock);
      expect(problem, channel).toContain(`"${channel}"`);
      expect(problem, channel).toContain('EXPO_PUBLIC_SUPABASE_URL');
      expect(problem, channel).toMatch(/stopped/);
    }
  });

  it('is checked where the environment is first read, before any provider exists', () => {
    const auth = readFileSync(join(root, 'src/auth/AuthContext.tsx'), 'utf8');
    expect(auth).toMatch(/releaseEnvProblem\(updateChannel\(\), read\)/);
    expect(auth).toMatch(/if \(problem !== null\) throw new Error\(problem\)/);
  });
});
