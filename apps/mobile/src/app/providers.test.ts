/**
 * WHERE A COMPONENT IS MOUNTED IS A CONSTRAINT THE TYPE SYSTEM DOES NOT CHECK, and twice now it
 * has been the difference between an app that opens and one that does not.
 *
 * `useShell()`, `usePlan()`, `useTheme()` and five more THROW when there is no provider above
 * them — that is deliberate, because returning a default would hide the mistake until something
 * looked wrong on a screen. But nothing checked the other half of the bargain. The tour learned
 * this the hard way: `TourTabPilot` called `useNavigationState` from a component mounted BESIDE
 * the root navigator instead of inside it, and the app did not open at all
 * (docs/PREFLIGHT.md §8). Lint was green, typecheck was green, 1,361 tests were green.
 * `navigation.tsx` still says of its own three children that this is "a constraint on what they
 * may do and is not checked by anything but this comment and the tour's own test". This file is
 * what checks it.
 *
 * IT IS NOT A RENDER TEST, and it does not pretend to be. The mobile suite runs in node and
 * cannot parse React Native, so nothing here mounts anything. The boot smoke test does render the
 * shell (`src/testing/smoke`, PREFLIGHT §8, "The boot smoke test", 2026-10-08), on react-native-web;
 * this stays because it names the rung and the hook, and it costs nothing. What this does is read
 * the ladder out of `App.tsx` and hold every rung to the providers above it — which is the
 * specific mistake that has shipped, twice, and it costs 20 ms rather than a native module and a
 * development build.
 *
 * THE LADDER IS READ, NOT WRITTEN DOWN. The order comes from `App.tsx`'s own JSX and the file
 * each rung lives in comes from `App.tsx`'s own imports, so moving a provider moves the rule that
 * governs it. The one thing written down is the hook→provider table, and the last test in this
 * file fails if the app grows a required context that is not in it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const mobile = join(here, '..', '..');
const src = join(mobile, 'src');
const repo = join(mobile, '..', '..');

const read = (p: string): string => readFileSync(p, 'utf8');

/** Comments are prose about the rules; a hook named in one is not a hook that runs. */
const code = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/**
 * Does this code CALL that hook? `[<(]` rather than `(`, because a call with a type argument is
 * still a call — `useRoute<RouteProp<TabParams, 'Stash'>>()` is how two screens write it, and a
 * pattern that only matched `useRoute(` read them as not using it at all.
 */
const calls = (text: string, hook: string): boolean =>
  new RegExp(`\\b${hook}\\b\\s*[<(]`).test(text);

/**
 * THE HOOKS THAT THROW WITHOUT AN ANCESTOR, and the component that has to be above them.
 *
 * `useNavigation` is deliberately absent and that is the interesting entry. It falls back to the
 * container ref when there is no navigator above it, which is how `RecoveryRedirect` dispatches
 * `navigate('NewPassword')` from beside the navigator — legitimately. `useNavigationState` has no
 * such fallback: it reads a navigator's state, and outside one there is none to read. Same
 * folder, same mount point, one throws and one does not (PREFLIGHT §8).
 *
 * `useTheme`'s provider is `AppearanceProvider` rather than `ThemeProvider`: the appearance
 * provider is what mounts the design system's, after resolving the stored choice against the OS
 * and the plan, so nothing above it may read a token (App.tsx's header says why).
 */
const NEEDS_ANCESTOR: Record<string, string> = {
  useAuth: 'AuthProviderRoot',
  usePlan: 'PlanProvider',
  useBilling: 'BillingProviderView',
  useAppearance: 'AppearanceProvider',
  useTheme: 'AppearanceProvider',
  useChild: 'ChildProvider',
  useToast: 'ToastProvider',
  useShell: 'ShellProvider',
  useSafeAreaInsets: 'SafeAreaProvider',
  useSafeAreaFrame: 'SafeAreaProvider',
  useNavigationState: 'NavigationContainer',
  useRoute: 'NavigationContainer',
};

/**
 * The hooks that answer `null` or a default instead of throwing, listed so the table above can be
 * checked for completeness rather than trusted. A hook on this list may be called anywhere — that
 * is what its return type is for.
 */
const OPTIONAL_HOOKS = [
  'useMemberPictures',
  'useTour',
  'useSnooze',
  'useShellOpen',
  'useSyncBanner',
  'useCommunity',
  'useMessages',
  'useNavigation',
];

/** `import { A, B } from './src/x/y'` → A and B both point at `src/x/y`. */
function importMap(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g)) {
    for (const raw of (m[1] as string).split(',')) {
      const name = raw
        .trim()
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)
        .pop();
      if (name) out.set(name, m[2] as string);
    }
  }
  return out;
}

/**
 * The body of a top-level `function Name(` — or `class Name`, because the error boundary has to be
 * one — to its closing brace in column 1.
 */
function bodyOf(text: string, name: string): string | null {
  const start = new RegExp(`^(?:export (?:default )?)?(?:function|class) ${name}\\b`, 'm').exec(
    text,
  );
  if (start === null) return null;
  const from = start.index;
  const end = text.indexOf('\n}', from);
  return end === -1 ? text.slice(from) : text.slice(from, end + 2);
}

/**
 * Every `<Capitalised` JSX tag, in source order.
 *
 * The lookbehind is not decoration: `useNavigationContainerRef<RootParams>()` is a generic call,
 * not a component, and without it the type argument reads as a rung of the ladder.
 */
const tagsIn = (jsx: string): string[] =>
  [...jsx.matchAll(/(?<![A-Za-z0-9_$)\]])<([A-Z][A-Za-z0-9]*)\b/g)].map(m => m[1] as string);

const appText = read(join(mobile, 'App.tsx'));
const imports = importMap(appText);

/**
 * The provider ladder, outermost first: `App`'s own chain with `<Navigation />` replaced by the
 * chain inside it. Both are strictly nested one-per-rung today, so source order IS depth — which
 * is the assumption the first test pins, so that a future sibling forces a look at this file
 * rather than quietly reading as a descendant.
 */
const appChain = tagsIn(bodyOf(appText, 'App') ?? '');
const navChain = tagsIn(bodyOf(appText, 'Navigation') ?? '');
const LADDER = [...appChain.filter(n => n !== 'Navigation'), ...navChain];

/** Where a rung's own code lives, or null when it comes from a package (the two roots do). */
function fileOf(name: string): string | null {
  const spec = imports.get(name);
  if (spec === undefined || !spec.startsWith('./')) return null;
  for (const ext of ['.tsx', '.ts']) {
    const p = join(mobile, `${spec.slice(2)}${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

describe('the provider ladder in App.tsx', () => {
  it('is the chain this file reasons about, outermost first', () => {
    expect(LADDER).toEqual([
      'SafeAreaProvider',
      'ErrorScreen',
      'AuthProviderRoot',
      // the switcher (0153): a keyed Fragment, so everything under it remounts when another family
      // comes on screen. It calls `useAuth`, whose provider is the rung above
      'HouseholdKey',
      'PlanProvider',
      'BillingProviderView',
      'AppearanceProvider',
      'ChildProvider',
      'ToastProvider',
      // a SIBLING of the sync engine, not a wrapper (2026-09-27): it renders nothing and says the
      // account-kept sentence. Read as a rung, it is held to the same rule, and its two hooks'
      // providers — AuthProviderRoot and ToastProvider — are above it either way
      'AccountKeptToast',
      // a sibling that renders nothing (0153): "Now showing …" once a switch has landed. Its hooks'
      // providers, AuthProviderRoot and ToastProvider, are above it
      'SwitchedToast',
      // the same kind of sibling (2026-09-28): it renders nothing and counts the days Night and the
      // colors were painted during the preview. Its hooks' providers — AuthProviderRoot,
      // PlanProvider and AppearanceProvider — are all above it
      'PlusUsageWatch',
      'SyncProvider',
      // every member's picture (0148, 2026-09-30), resolved once for every surface. Below Sync
      // because it reads the mirror Sync keeps; its hook answers a default outside it (the initial)
      // rather than throwing, and its own hook's provider, AuthProviderRoot, is above it
      'MemberPicturesProvider',
      // (CuddleCue's MessagesProvider, CommunityProvider, LocalNotificationsHost and WidgetsHost
      // are not in NibbleCue: no in-app messages, community, notifications or widgets)
      // the ground under every page (2026-09-29): a plain view in the theme's paper, so Android's
      // back transition fades the pages over paper rather than the white window. It calls no hook
      'View',
      'NavigationContainer',
      // (no TourProvider: NibbleCue has no first-run tour, `src/tour/` is a stand-in)
      'ShellProvider',
      'RootNavigator',
      'LinkRouter',
      // (no ReminderResponder: NibbleCue sends no reminders)
    ]);
  });

  it('every provider the table names is on the ladder', () => {
    const missing = [...new Set(Object.values(NEEDS_ANCESTOR))].filter(p => !LADDER.includes(p));
    expect(missing).toEqual([]);
  });

  /**
   * THE RULE: a rung may only call a throwing hook whose provider is STRICTLY ABOVE it.
   *
   * Read out of each rung's own function body rather than its whole file, because a provider file
   * routinely also defines a child that renders inside its own provider — and that child is not
   * mounted where the provider is.
   */
  it('calls no hook whose provider is at or below it', () => {
    const offenders: string[] = [];
    LADDER.forEach((rung, depth) => {
      const file = fileOf(rung);
      if (file === null) return; // a package's component: SafeAreaProvider, NavigationContainer
      // a class body is scanned the same way, and finds nothing: a class component cannot call a
      // hook at all, which is the reason the error boundary is one and sits above every provider
      const body = bodyOf(code(read(file)), rung);
      if (body === null) {
        offenders.push(`${rung}: no top-level function of that name in ${file}`);
        return;
      }
      for (const [hook, provider] of Object.entries(NEEDS_ANCESTOR)) {
        if (!calls(body, hook)) continue;
        const at = LADDER.indexOf(provider);
        if (at < depth) continue;
        offenders.push(
          at === depth
            ? `${rung} calls ${hook}(), which needs itself above itself`
            : `${rung} (rung ${String(depth)}) calls ${hook}(), whose ${provider} is rung ${String(at)} — below it`,
        );
      }
    });
    expect(offenders).toEqual([]);
  });
});

/**
 * The children mounted BESIDE `Root.Navigator` rather than inside it. `navigation.tsx` explains
 * the constraint in a comment; this is the part that holds them to it, and it follows imports so
 * a helper two files away cannot smuggle the hook in.
 */
describe('what is mounted outside the root navigator', () => {
  const navPath = join(src, 'app', 'navigation.tsx');
  const navBody = bodyOf(read(navPath), 'RootNavigator') ?? '';
  /*
    The function's LAST return — the one at the top level of the body, so indented two — then the
    navigator cut out of it: what remains is what sits beside it. Taking the whole body would pick
    up the early `<View testID="booting" />` return, which is a different frame of the app rather
    than a sibling of anything; taking the last `<>` would land inside the navigator, which holds
    fragments of its own.
  */
  const tree = navBody.slice(navBody.lastIndexOf('\n  return ('));
  const beside = tree.replace(/<Root\.Navigator[\s\S]*?<\/Root\.Navigator>/, ' ');
  const siblings = [...new Set(tagsIn(beside))];

  it('is the one component the file says it is', () => {
    // CuddleCue also mounts SetupSeeder and TourOverlay here; NibbleCue's one-page onboarding
    // seeds nothing after the navigator, and it has no tour
    expect(siblings).toEqual(['RecoveryRedirect']);
  });

  /**
   * THE SCOPE OF THIS CHECK, and why it is not the whole import graph.
   *
   * Import reachability is not render reachability. `navigation.tsx` imports every screen in the
   * app, and two of those screens call `useRoute` perfectly legitimately — they are inside the
   * navigator. A walk that followed imports from here would fail on correct code, which is worse
   * than not walking: a check that cries wolf gets deleted.
   *
   * What is checked is what can be known from where a thing is written: the component's own body,
   * and — when it lives in its own file — that whole file, because everything declared there
   * renders under it. That is exactly the shape that shipped: `TourTabPilot` was its own file.
   * The tour's deeper sweep (every file in `src/tour`) stays in `tour/tour.test.ts`.
   */
  const BANNED = ['useNavigationState', 'useRoute'];

  it('calls no hook that needs a navigator above it', () => {
    const navImports = importMap(read(navPath));
    const offenders: string[] = [];
    for (const name of siblings) {
      const spec = navImports.get(name);
      const file =
        spec === undefined
          ? navPath
          : ['.tsx', '.ts'].map(ext => join(src, 'app', `${spec}${ext}`)).find(p => existsSync(p));
      if (file === undefined) {
        offenders.push(`${name}: cannot resolve ${spec ?? '(local)'}`);
        continue;
      }
      // its own file when it has one; only its own body when it shares navigation.tsx
      const scope = spec === undefined ? (bodyOf(code(read(file)), name) ?? '') : code(read(file));
      if (scope === '') {
        offenders.push(`${name}: no function of that name in ${file.slice(src.length + 1)}`);
        continue;
      }
      for (const hook of BANNED) {
        if (calls(scope, hook)) offenders.push(`${name} calls ${hook}()`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('the hook table', () => {
  /** Every app source file git knows about, committed or not (packages/brand's scan says why). */
  const appSources = execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard', 'apps/mobile/src'],
    { cwd: repo, encoding: 'utf8' },
  )
    .split('\0')
    .filter(f => f && /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map(f => join(repo, f))
    .filter(existsSync);

  /**
   * A context hook that THROWS is one this file has to know about; one that answers null is not.
   * Finding them by shape rather than by name is what keeps the table honest: add a provider whose
   * hook throws, and this fails until the table says which component has to be above it.
   */
  it('names every context hook in the app that throws without its provider', () => {
    const throwing: string[] = [];
    for (const file of [...appSources, join(repo, 'packages/ui/src/theme/ThemeProvider.tsx')]) {
      const text = code(read(file));
      for (const m of text.matchAll(/export (?:function|const) (use[A-Z][A-Za-z0-9]*)/g)) {
        const name = m[1] as string;
        const body = text.slice(m.index, m.index + 400);
        const stop = body.search(/\n(?:export|const|function|\})/);
        const slice = stop === -1 ? body : body.slice(0, stop + 1);
        if (/useContext\s*\(/.test(slice) && /throw new Error/.test(slice)) throwing.push(name);
      }
    }
    expect([...new Set(throwing)].sort()).toEqual(
      Object.keys(NEEDS_ANCESTOR)
        .filter(
          h => !h.startsWith('useSafeArea') && !['useNavigationState', 'useRoute'].includes(h),
        )
        .sort(),
    );
  });

  it('keeps the two lists apart: no hook is both required and optional', () => {
    const both = OPTIONAL_HOOKS.filter(h => h in NEEDS_ANCESTOR);
    expect(both).toEqual([]);
  });
});
