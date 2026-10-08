/**
 * THE EXPO GO IMPORT GATE: a native module that Expo Go does not carry must never be reached by
 * a static import.
 *
 * Three crashes have reached the owner's phone through a green test suite, and every one of them
 * was the same shape. A module with a native side ends at `requireNativeModule('Expo…')`, which
 * runs the MOMENT the module is evaluated — so a static `import` makes the demand for native code
 * the bundle's first act, before React exists to catch anything. In Expo Go, where that code is
 * absent, the app dies between "Android Bundled" and its first frame: no red screen, no stack, one
 * silent line in the Metro terminal. Nothing in `pnpm test` can see it, because node never
 * evaluates a screen, and `pnpm build` cannot either, because Metro resolves the module happily —
 * the file is there, it is the native half behind it that is not.
 *
 * `apps/mobile/src/growth/storeReview.ts` and `apps/mobile/src/notifications/expoDriver.ts` are the
 * shipped answer: the lookup happens at CALL time, inside a `try`, via `require` — the only
 * construct that defers it — so a build without the native side degrades to a missing feature
 * instead of a dead process. This script is what stops the fourth one being written.
 *
 *   pnpm check:expo-go
 *   pnpm check:expo-go --list      # what it decided about every native package the app reaches
 *
 * It checks two things, because the guard is two things. First: no module with a native side that
 * Expo Go does not carry may be reached by a static import. Second: the deferred lookup that
 * replaces one has to sit inside a `try` — a `require` in a function but outside a `try` still
 * kills the process, just later and somewhere harder to find.
 *
 * Exit code: 0 when both hold, 1 otherwise. It reads files and nothing else, so it costs a second
 * and belongs on every push.
 *
 * WHAT IT DOES NOT CLAIM. It proves nothing about a module's behavior, only about WHEN the app
 * asks for it. A guarded `require` that is wrong is still wrong; this only guarantees that being
 * wrong is survivable.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Everything that ends up in the Metro bundle, because a crash from a design-system component is
 * exactly as fatal as a crash from a screen. `packages/core`, `packages/brand` and `packages/db`
 * are omitted deliberately: eslint's `no-restricted-imports` already forbids React, React Native
 * and Expo in all three, so there is nothing here for this script to find in them.
 *
 * Tests and `src/testing/` are omitted for the opposite reason — they never reach a bundle at all,
 * which `apps/mobile/src/testing/no-bundle.test.ts` is the gate for.
 */
const BUNDLE_ROOTS = [
  'apps/mobile/index.ts',
  'apps/mobile/App.tsx',
  'apps/mobile/src',
  'packages/ui/src',
];

/**
 * THE ONE HAND-MAINTAINED LIST, AND HOW TO REFRESH IT.
 *
 * The allow-list itself is NOT written down here. It is read from the installed SDK's own
 * `expo/bundledNativeModules.json`, which is the version map `expo install` uses and therefore
 * moves with the SDK rather than with this file. Anything a screen imports that is not in that map
 * is, by definition, not something Expo Go was built with.
 *
 * What the map cannot tell us is the handful of packages Expo ships in the SDK but NOT inside the
 * Expo Go client, or ships in a form that throws there. Those are below, each with the evidence
 * for it. To refresh after an SDK bump: open the Expo changelog for the new SDK and each module's
 * documentation page, which carries an "Expo Go" support line, and add or remove an entry here —
 * with the reason, in a sentence, because a bare package name in a deny-list is unmaintainable.
 *
 * Erring is one-directional on purpose. A module wrongly listed here costs a guard nobody needed;
 * a module wrongly missing costs a crash on a parent's phone.
 */
const NOT_IN_EXPO_GO = {
  'expo-notifications':
    'removed from Expo Go on Android in SDK 53 — the module throws on load there ' +
    '(docs/MOBILE.md §1; src/notifications/expoDriver.ts is the guarded version)',
  'expo-dev-client':
    'the development client is the thing Expo Go is an alternative to; it has no native side inside Expo Go',
  'react-native-purchases':
    'RevenueCat ships a store SDK and StoreKit / Play Billing capabilities that no general-purpose client can carry',
  'expo-widgets':
    'a WidgetKit extension target and an App Group entitlement: only a development or store build ' +
    'carries them (docs/WIDGETS.md §1.1; src/widgets/expoWidgetsDriver.ts is the guarded version)',
  '@expo/ui':
    'the SwiftUI host views expo-widgets renders layouts with; reached only through the widget ' +
    "extension's own runtime, never from the app bundle (src/widgets/layouts/runtime.d.ts)",
  'react-native-android-widget':
    'AppWidget receivers and a native renderer that only a development or store build carries; ' +
    'the module asks for its native half on load (docs/WIDGETS.md §8; src/widgets/android/lib.ts ' +
    'is the guarded version)',
};

/** Native evidence, in the order autolinking itself looks for it. */
function nativeSideOf(pkgDir) {
  if (existsSync(join(pkgDir, 'expo-module.config.json'))) return 'expo module';
  let entries;
  try {
    entries = readdirSync(pkgDir);
  } catch {
    return null;
  }
  if (entries.some(e => e.endsWith('.podspec'))) return 'podspec';
  for (const platform of ['android', 'ios']) {
    const dir = join(pkgDir, platform);
    try {
      if (statSync(dir).isDirectory()) return `${platform}/`;
    } catch {
      // not this one
    }
  }
  return null;
}

/* ------------------------------------------------------------------ the installed SDK */

const mobilePkg = JSON.parse(readFileSync(join(ROOT, 'apps/mobile/package.json'), 'utf8'));
const declaredExpo = mobilePkg.dependencies?.expo;
if (typeof declaredExpo !== 'string') {
  console.error(
    'apps/mobile/package.json declares no `expo` dependency — nothing to check against.',
  );
  process.exit(1);
}
const declaredSdk = Number(/(\d+)/.exec(declaredExpo)?.[1]);

const expoDir = join(ROOT, 'apps/mobile/node_modules/expo');
if (!existsSync(join(expoDir, 'bundledNativeModules.json'))) {
  console.error(
    `expo is not installed under apps/mobile/node_modules. Run \`pnpm install\` — without the SDK's\n` +
      'own module map this script would have to guess, and a gate that guesses is worse than none.',
  );
  process.exit(1);
}
const installedExpo = JSON.parse(readFileSync(join(expoDir, 'package.json'), 'utf8')).version;
const installedSdk = Number(/(\d+)/.exec(installedExpo)?.[1]);
if (installedSdk !== declaredSdk) {
  // The allow-list below comes from the INSTALLED package. If that is a different SDK from the one
  // the app declares, every verdict this script prints is about the wrong client.
  console.error(
    `apps/mobile declares expo ${declaredExpo} but expo ${installedExpo} is installed. ` +
      'Run `pnpm install` before trusting this gate.',
  );
  process.exit(1);
}

const bundledMap = JSON.parse(readFileSync(join(expoDir, 'bundledNativeModules.json'), 'utf8'));
const allowed = new Set(Object.keys(bundledMap).filter(name => !(name in NOT_IN_EXPO_GO)));
// `expo` names itself nowhere in its own version map, for the obvious reason: it is the client.
// `registerRootComponent` comes from it and every Expo Go build has it by construction.
allowed.add('expo');

/* ------------------------------------------------------------------ reading the source */

function walk(path) {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    return [];
  }
  if (!stats.isDirectory()) return [path];
  return readdirSync(path).flatMap(entry => walk(join(path, entry)));
}

const files = BUNDLE_ROOTS.flatMap(root => walk(join(ROOT, root)))
  .filter(f => /\.tsx?$/.test(f))
  .filter(f => !/\.test\.tsx?$/.test(f))
  .filter(f => !f.includes(`${sep}testing${sep}`))
  .sort();

/**
 * Comments removed, strings kept. A crude `//` strip would eat half of a URL and a crude block
 * strip would eat a regular expression, so this walks the text once and knows which it is in — a
 * comment that merely TALKS about a static import (this repository has several, explaining why one
 * would be fatal) must not be reported as one.
 */
function withoutComments(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '/' && next === '/') {
      while (i < n && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') out += '\n'; // keep line numbers honest
        i++;
      }
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      out += ch;
      i++;
      while (i < n) {
        if (text[i] === '\\') {
          out += text[i] + (text[i + 1] ?? '');
          i += 2;
          continue;
        }
        out += text[i];
        if (text[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * A static, VALUE import — the only kind that can kill a process at load.
 *
 * `import type` and `export type` are erased by the compiler and never reach the bundle, and so is
 * a brace clause whose every specifier carries `type`. `import('x')` and `require('x')` are not
 * matched at all: they are the guarded forms this gate exists to push people towards.
 *
 * The clause between the keyword and `from` is restricted to what an import clause can actually
 * contain — names, `*`, `as`, commas and braces. An unrestricted `[\s\S]*?` looked right and was
 * not: it happily spanned an exported object literal down to some unrelated `from` in a sentence
 * and reported a copy string as a package.
 */
const STATIC_IMPORT =
  /^[ \t]*(?:import|export)\s+([\w$*,{}\s]*?)\s*from\s*(['"])([^'"]+)\2|^[ \t]*import\s*(['"])([^'"]+)\4/gm;

function typeOnly(clause) {
  const trimmed = clause.trim();
  if (/^type\b/.test(trimmed)) return true;
  const braces = /^\{([\s\S]*)\}$/.exec(trimmed);
  if (braces === null) return false;
  const specifiers = braces[1]
    .split(',')
    .map(s => s.trim())
    .filter(s => s !== '');
  return specifiers.length > 0 && specifiers.every(s => /^type\b/.test(s));
}

/** `expo-file-system/next` and `@react-native-community/netinfo/x` both resolve to their package. */
function packageOf(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/**
 * Every `try { … }` in a file, as index ranges.
 *
 * A deferred lookup is only half the pattern. `require('expo-notifications')` inside a function
 * but OUTSIDE a `try` still takes the process down — later, on the first reminder instead of at
 * launch, which is harder to find rather than safer. So the ranges are computed and the guarded
 * lookups below are checked against them.
 *
 * Braces inside string and template literals are skipped, because `'{'` in a copy string would
 * otherwise unbalance the count and silently move every range after it.
 */
function tryRanges(text) {
  const ranges = [];
  const opener = /\btry\s*\{/g;
  let m;
  while ((m = opener.exec(text)) !== null) {
    let depth = 1;
    let i = opener.lastIndex;
    while (i < text.length && depth > 0) {
      const ch = text[i];
      if (ch === "'" || ch === '"' || ch === '`') {
        const quote = ch;
        i += 1;
        while (i < text.length) {
          if (text[i] === '\\') {
            i += 2;
            continue;
          }
          if (text[i] === quote) break;
          i += 1;
        }
      } else if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      i += 1;
    }
    ranges.push([m.index, i]);
  }
  return ranges;
}

/** node's own resolution order: the nearest node_modules, then upwards. */
function packageDirFor(pkg, fromFile) {
  let dir = dirname(fromFile);
  for (;;) {
    const candidate = join(dir, 'node_modules', pkg);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    const up = dirname(dir);
    if (up === dir || !dir.startsWith(ROOT)) return null;
    dir = up;
  }
}

/* ------------------------------------------------------------------ the verdict */

const offenders = [];
const seenNative = new Set();
let guarded = 0;
let staticImports = 0;

for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  const text = withoutComments(raw);
  const rel = file.slice(ROOT.length + 1);

  // The deferred forms. They are counted so the summary can show this scan is not looking at an
  // empty tree, and the dangerous ones are then checked for the `try` that makes them survivable.
  const ranges = tryRanges(text);
  const DEFERRED = /\b(?:require|import)\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
  let d;
  while ((d = DEFERRED.exec(text)) !== null) {
    // `typeof import('expo-notifications')` is a TYPE, erased before the bundle exists — it is how
    // `bindings.ts` types the module it then loads properly, three lines further down.
    if (/\btypeof\s*$/.test(text.slice(Math.max(0, d.index - 12), d.index))) continue;
    guarded += 1;
    const pkg = packageOf(d[2]);
    if (d[2].startsWith('.') || d[2].startsWith('node:') || pkg.startsWith('@cuddlecue/')) continue;
    const pkgDir = packageDirFor(pkg, file);
    // An uninstalled package cannot be checked for a native side, but it is exactly the case the
    // guard exists for (expo-store-review is not a dependency), so it is held to the same rule.
    if (pkgDir !== null && (nativeSideOf(pkgDir) === null || allowed.has(pkg))) continue;
    if (ranges.some(([from, to]) => d.index > from && d.index < to)) continue;
    offenders.push({
      rel,
      line: text.slice(0, d.index).split('\n').length,
      pkg,
      why: 'looked up at run time but not inside a try — this throws later instead of at launch',
      fix: 'wrap the lookup in a try/catch and return a degraded result when it throws',
    });
  }

  STATIC_IMPORT.lastIndex = 0;
  let m;
  while ((m = STATIC_IMPORT.exec(text)) !== null) {
    const specifier = m[3] ?? m[5];
    const clause = m[1] ?? '';
    if (specifier === undefined) continue;
    if (typeOnly(clause)) continue;
    staticImports += 1;
    if (specifier.startsWith('.') || specifier.startsWith('node:')) continue;

    const pkg = packageOf(specifier);
    if (pkg.startsWith('@cuddlecue/')) continue;

    const pkgDir = packageDirFor(pkg, file);
    const line = text.slice(0, m.index).split('\n').length;
    if (pkgDir === null) {
      // Metro cannot resolve what pnpm did not install either, so this is a red screen waiting to
      // happen whatever its native status is.
      offenders.push({ rel, line, pkg, why: 'not installed for this package' });
      continue;
    }
    const native = nativeSideOf(pkgDir);
    if (native === null) continue;
    seenNative.add(pkg);
    if (allowed.has(pkg)) continue;
    offenders.push({
      rel,
      line,
      pkg,
      why:
        pkg in NOT_IN_EXPO_GO
          ? NOT_IN_EXPO_GO[pkg]
          : `has a native side (${native}) and is not in expo ${installedExpo}'s bundled module map`,
    });
  }
}

/* A scanner that quietly stops seeing anything reports a clean tree, which is the failure mode
 * this whole file exists to prevent. So it has to have found a source tree, real imports, native
 * packages among them, and the guarded requires the two shipped examples are built on. */
const vacuous = [];
if (files.length < 50) vacuous.push(`only ${files.length} source files found`);
if (staticImports < 100) vacuous.push(`only ${staticImports} static imports parsed`);
if (seenNative.size < 5) vacuous.push(`only ${seenNative.size} native-backed packages seen`);
if (guarded < 2) vacuous.push(`only ${guarded} guarded require/import() calls seen`);

console.log(`Expo Go import gate — SDK ${installedSdk} (expo ${installedExpo})`);
if (process.argv.includes('--list')) {
  // Maintenance view: the allow-list is derived, so the only way to audit it is to see what it
  // decided about the packages this app actually reaches.
  for (const pkg of [...seenNative].sort()) {
    console.log(`  ${allowed.has(pkg) ? 'in Expo Go ' : 'NOT bundled'}  ${pkg}`);
  }
}
console.log(
  `${files.length} bundled source files · ${staticImports} static imports · ` +
    `${seenNative.size} native-backed packages · ${guarded} guarded lookups`,
);
console.log(
  `allow-list: ${allowed.size} modules from expo/bundledNativeModules.json, ` +
    `less ${Object.keys(NOT_IN_EXPO_GO).length} Expo Go does not carry`,
);

if (vacuous.length > 0) {
  console.error(`\nThis scan proved nothing: ${vacuous.join('; ')}.`);
  console.error('Check BUNDLE_ROOTS and the import pattern before trusting a green run.');
  process.exit(1);
}

if (offenders.length === 0) {
  console.log(
    '\nNo native module Expo Go cannot answer is reached by a static import, or by a run-time\n' +
      'lookup that nothing would catch.',
  );
  process.exit(0);
}

console.error(
  `\n${offenders.length} unguarded reference(s) to native code Expo Go cannot answer:\n`,
);
for (const o of offenders) {
  console.error(`  ${o.rel}:${o.line}  ${o.pkg}`);
  console.error(`      ${o.why}`);
  console.error(
    `      Fix: ${
      o.fix ??
      `drop the import and look the module up at call time inside a try/catch (\`require('${o.pkg}')\`), returning a degraded result when it is absent`
    } — see apps/mobile/src/growth/storeReview.ts.`,
  );
}
process.exit(1);
