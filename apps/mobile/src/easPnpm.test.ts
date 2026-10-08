/**
 * EAS INSTALLS WITH THE REPOSITORY'S PNPM (`eas-pnpm.cjs` has the account of build 1a140fa2).
 *
 * The version lives in one place, the root package.json's `packageManager`; eas.json asks every
 * profile for the same one (`release.test.ts` holds that), and the pre-install hook reads it rather
 * than typing it. The hook's decisions are pure, so they are held here without a worker: which PATH
 * the install will see, where the launcher may go, and that nothing past the old pnpm's folder can
 * ever be chosen.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const APP = resolve(__dirname, '..');
const ROOT = resolve(APP, '..', '..');
const hook = require('../eas-pnpm.cjs') as typeof import('../eas-pnpm.cjs');

const json = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;

describe('the pnpm EAS installs with', () => {
  const want = hook.wantedPnpm(json(join(ROOT, 'package.json')) as { packageManager?: string });

  it('is put first by the pre-install hook, which reads the version and never types it', () => {
    const scripts = (json(join(APP, 'package.json')).scripts ?? {}) as Record<string, string>;
    expect(scripts['eas-build-pre-install']).toBe('node ./eas-pnpm.cjs');
    expect(existsSync(join(APP, 'eas-pnpm.cjs'))).toBe(true);
    expect(readFileSync(join(APP, 'eas-pnpm.cjs'), 'utf8')).not.toContain(want);
  });

  it('must be named exactly in packageManager', () => {
    expect(hook.wantedPnpm({ packageManager: 'pnpm@10.33.0' })).toBe('10.33.0');
    expect(() => hook.wantedPnpm({ packageManager: 'pnpm@^10' })).toThrow(/exact pnpm version/);
    expect(() => hook.wantedPnpm({ packageManager: 'yarn@4.1.0' })).toThrow(/exact pnpm version/);
    expect(() => hook.wantedPnpm({})).toThrow(/exact pnpm version/);
  });
});

describe('the PATH the install will see', () => {
  it('drops what `pnpm run` put in front for the hook, and keeps the rest in order', () => {
    expect(
      hook.installPath(
        [
          '/home/expo/workingdir/build/apps/mobile/node_modules/.bin',
          '/home/expo/workingdir/build/node_modules/.bin',
          '/usr/local/lib/node_modules/pnpm/dist/node-gyp-bin',
          '/home/expo/.nvm/versions/node/v24.21.0/bin',
          '',
          '/usr/local/bin',
          '/usr/bin',
        ].join(':'),
      ),
    ).toEqual(['/home/expo/.nvm/versions/node/v24.21.0/bin', '/usr/local/bin', '/usr/bin']);
  });

  it('keeps the environment, without the npm_ values a script run adds', () => {
    expect(
      hook.cleanEnv({
        PATH: '/bin',
        npm_config_user_agent: 'pnpm/8',
        npm_lifecycle_event: 'x',
        HOME: '/h',
      }),
    ).toEqual({
      PATH: '/bin',
      HOME: '/h',
    });
  });
});

describe('where the launcher goes', () => {
  const root = '/home/expo/workingdir/build';
  const nvm = '/home/expo/.nvm/versions/node/v24.21.0/bin';
  const writableIn =
    (...dirs: string[]) =>
    (dir: string) =>
      dirs.includes(dir);

  it('is the first writable folder ahead of the old pnpm', () => {
    expect(
      hook.launcherDir({
        pathDirs: [nvm, '/usr/local/bin', '/usr/bin'],
        current: '/usr/local/bin/pnpm',
        root,
        isWritable: writableIn(nvm, '/usr/bin'),
      }),
    ).toBe(nvm);
  });

  it("is the old pnpm's own folder when that is the first one writable", () => {
    expect(
      hook.launcherDir({
        pathDirs: ['/opt/a', nvm, '/usr/bin'],
        current: `${nvm}/pnpm`,
        root,
        isWritable: writableIn(nvm, '/usr/bin'),
      }),
    ).toBe(nvm);
  });

  it('is never a folder after the old pnpm: the old one would still answer first', () => {
    expect(
      hook.launcherDir({
        pathDirs: ['/usr/local/bin', nvm, '/usr/bin'],
        current: '/usr/local/bin/pnpm',
        root,
        isWritable: writableIn(nvm, '/usr/bin'),
      }),
    ).toBeNull();
  });

  it('is never inside the repository, where nothing exists before the install', () => {
    expect(
      hook.launcherDir({
        pathDirs: [`${root}/tools`, nvm],
        current: `${nvm}/pnpm`,
        root,
        isWritable: writableIn(`${root}/tools`, nvm),
      }),
    ).toBe(nvm);
  });

  it('is the first writable folder when no pnpm is on the PATH at all', () => {
    expect(
      hook.launcherDir({
        pathDirs: ['/usr/bin', nvm],
        current: null,
        root,
        isWritable: writableIn(nvm),
      }),
    ).toBe(nvm);
  });

  it('hands every argument to the installed pnpm', () => {
    const script = hook.launcherScript('/home/expo/.cache/cuddlecue-pnpm/x/node_modules/.bin/pnpm');
    expect(script.startsWith('#!/bin/sh\n')).toBe(true);
    expect(script).toContain(
      'exec "/home/expo/.cache/cuddlecue-pnpm/x/node_modules/.bin/pnpm" "$@"',
    );
  });

  it('says what it found when it cannot', () => {
    const line = hook.stopSentence({ found: '8.15.9', at: '/usr/local/bin/pnpm', want: '10.33.0' });
    expect(line).toContain('pnpm 8.15.9 at /usr/local/bin/pnpm');
    expect(line).toContain('pnpm 10.33.0');
    expect(line).toContain('Ignoring not compatible lockfile');
  });
});
