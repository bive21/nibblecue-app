'use strict';
/**
 * EAS INSTALLS WITH THIS REPOSITORY'S PNPM, OR STOPS AND SAYS WHY (2026-10-01).
 *
 * The first store build (v0.1.0, EAS build 1a140fa2) died in "Install dependencies" seconds in:
 *
 *     WARN  Ignoring not compatible lockfile at /home/expo/workingdir/build/pnpm-lock.yaml
 *     ERR_PNPM_NO_LOCKFILE  Cannot install with "frozen-lockfile" because pnpm-lock.yaml is absent
 *
 * That is pnpm 8 meeting the lockfile pnpm 9 and later write (lockfileVersion 9.0, with catalogs):
 * the same lines come out of `pnpm@8.15.9 install --frozen-lockfile` on a clean checkout of that
 * commit, and pnpm 9 and 10 install it cleanly. eas.json asks every profile for the repository's
 * pnpm, and the worker's PATH still found an older one when it ran the install.
 *
 * So EAS runs this first, from this folder (`eas-build-pre-install`, before "Install dependencies",
 * with the environment the install will get). When `pnpm` on that PATH is not the version the root
 * package.json names in `packageManager`, it installs that version into a folder of its own and
 * writes a two-line launcher called `pnpm` into the first writable folder on the PATH that comes no
 * later than the old one, so the install finds it first; when the old one's folder belongs to root,
 * the launcher takes its place through sudo, which EAS workers allow. When neither works, the build
 * stops here with a sentence that says what it found, instead of a lockfile error that points at
 * the wrong thing. On a worker that already has the right pnpm it prints the versions and returns.
 *
 * ONLY ON AN EAS CLOUD WORKER does it change anything. Anywhere else (`eas build --local` on a
 * laptop) a wrong pnpm stops the build with the same sentence, and nobody's own folders are touched.
 *
 * PLAIN COMMONJS, NODE BUILT-INS ONLY: nothing is installed yet when it runs. The decisions are
 * the pure functions below, so `src/easPnpm.test.ts` holds them without a worker.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

/** The pnpm version this repository is built with: the root package.json's `packageManager`. */
function wantedPnpm(rootPackageJson) {
  const match = /^pnpm@(\d+\.\d+\.\d+)$/.exec(String(rootPackageJson.packageManager ?? ''));
  if (match === null) {
    throw new Error(
      'package.json: "packageManager" must name one exact pnpm version: pnpm@<major>.<minor>.<patch>.',
    );
  }
  return match[1];
}

/** The environment for a child command, without the `npm_*` values `pnpm run` adds for a script. */
function cleanEnv(env) {
  return Object.fromEntries(Object.entries(env).filter(([name]) => !name.startsWith('npm_')));
}

/** Whether `dir` is `root` or inside it. */
function isInside(dir, root) {
  const rel = path.relative(path.resolve(root), path.resolve(dir));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * The PATH the install will see: this script's, without what `pnpm run` put in front of it for
 * this one script (the `node_modules/.bin` folders of this package and its parents, and pnpm's own
 * `node-gyp-bin`). EAS starts the install from the PATH it started this hook with, so a launcher
 * written into one of those folders would answer here and never there.
 *
 * @param {string} value
 * @returns {string[]}
 */
function installPath(value) {
  return value
    .split(path.delimiter)
    .filter(dir => dir !== '')
    .filter(
      dir =>
        !(path.basename(dir) === '.bin' && path.basename(path.dirname(dir)) === 'node_modules'),
    )
    .filter(dir => path.basename(dir) !== 'node-gyp-bin');
}

/**
 * Where the launcher goes: the first folder on the install's PATH that can be written to and comes
 * no later than the folder the wrong pnpm was found in, so the install meets the launcher first.
 * Folders inside the repository are passed over: nothing there exists before the install. Null
 * when there is none.
 *
 * @param {{ pathDirs: readonly string[]; current: string | null; root: string; isWritable: (dir: string) => boolean }} args
 * @returns {string | null}
 */
function launcherDir({ pathDirs, current, root, isWritable }) {
  const currentDir = current === null ? null : path.resolve(path.dirname(current));
  for (const dir of pathDirs) {
    if (dir === '' || isInside(dir, root)) continue;
    if (isWritable(dir)) return dir;
    if (currentDir !== null && path.resolve(dir) === currentDir) return null;
  }
  return null;
}

/** The launcher: hands every argument to the pnpm this file installed. */
function launcherScript(target) {
  return `#!/bin/sh\nexec "${target}" "$@"\n`;
}

/** The sentence a build stops on when the right pnpm cannot be put first. */
function stopSentence({ found, at, want }) {
  return (
    `This build found pnpm ${found ?? '(none)'} at ${at ?? '(nowhere on the PATH)'}, and this ` +
    `repository installs with pnpm ${want} (package.json "packageManager"; eas.json asks for the ` +
    `same). An older pnpm stops on its lockfile with "Ignoring not compatible lockfile". Put ` +
    `pnpm ${want} first on the PATH and build again.`
  );
}

function writable(dir) {
  try {
    if (!fs.statSync(dir).isDirectory()) return false;
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function output(command, args, env) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function main() {
  const log = line => console.log(`[eas-pnpm] ${line}`);
  const want = wantedPnpm(JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')));
  const pathDirs = installPath(process.env.PATH ?? '');
  const env = { ...cleanEnv(process.env), PATH: pathDirs.join(path.delimiter) };
  const find = () => ({
    version: output('pnpm', ['--version'], env),
    at: output('sh', ['-c', 'command -v pnpm'], env),
  });

  const before = find();
  log(
    `node ${process.version}, pnpm ${before.version ?? '(none)'} at ${before.at ?? '(nowhere on the PATH)'}; ` +
      `this repository needs pnpm ${want}`,
  );
  if (before.version === want) return;

  // only an EAS cloud worker is changed; a laptop's own folders are never written to
  if (process.env.EAS_BUILD_RUNNER !== 'eas-build') {
    throw new Error(stopSentence({ found: before.version, at: before.at, want }));
  }
  log(`PATH: ${pathDirs.join(' ')}`);

  const home = path.join(os.homedir(), '.cache', 'cuddlecue-pnpm', want);
  log(`installing pnpm ${want} into ${home}`);
  execFileSync(
    'npm',
    [
      'install',
      '--prefix',
      home,
      '--no-audit',
      '--no-fund',
      '--no-save',
      '--no-package-lock',
      `pnpm@${want}`,
    ],
    { env, stdio: 'inherit' },
  );
  const script = launcherScript(path.join(home, 'node_modules', '.bin', 'pnpm'));

  const dir = launcherDir({ pathDirs, current: before.at, root: ROOT, isWritable: writable });
  if (dir !== null) {
    const launcher = path.join(dir, 'pnpm');
    fs.rmSync(launcher, { force: true });
    fs.writeFileSync(launcher, script, { mode: 0o755 });
    log(`wrote the launcher to ${launcher}`);
  } else if (before.at !== null && output('sudo', ['-n', 'true'], env) !== null) {
    // the old pnpm's folder belongs to root; EAS workers let the build use sudo
    const staged = path.join(home, 'pnpm-launcher');
    fs.writeFileSync(staged, script, { mode: 0o755 });
    execFileSync('sudo', ['-n', 'rm', '-f', before.at], { env, stdio: 'inherit' });
    execFileSync('sudo', ['-n', 'install', '-m', '0755', staged, before.at], {
      env,
      stdio: 'inherit',
    });
    log(`put the launcher in place of ${before.at}`);
  } else {
    throw new Error(stopSentence({ found: before.version, at: before.at, want }));
  }

  const after = find();
  if (after.version !== want)
    throw new Error(stopSentence({ found: after.version, at: after.at, want }));
  log(`pnpm ${want} now answers at ${after.at}`);
}

module.exports = {
  cleanEnv,
  installPath,
  isInside,
  launcherDir,
  launcherScript,
  stopSentence,
  wantedPnpm,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[eas-pnpm] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
