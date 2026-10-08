import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * THE CODE SHEET'S TWO WAYS OUT, proved with the router the app runs (2026-09-29), in the manner of
 * `tour/pagesOver.test.ts`: React Navigation's own pure reducer, reached through
 * `@react-navigation/native`'s dependencies because this app does not list it directly.
 *
 *   1. "Create an account to join" goes back DOWN to the sign-in page under the sheet. React
 *      Navigation 7's `navigate` PUSHES a route that is in the stack but not on top, which would
 *      have put a second sign-in page over the sheet; `pop` finds the one there is.
 *   2. A phase change keeps every open route whose name the next branch registers too. The sheet
 *      is registered in three branches, so a join made from setup's sheet turned `ready` with the
 *      sheet as the ONLY route. Its `navigationKey` changes with the branch (`app/navigation.tsx`),
 *      which is what drops it: the branch then opens on its first screen, the confirmation.
 */
interface Route {
  key?: string;
  name: string;
  params?: object;
}
interface NavState {
  routes: Route[];
  index: number;
}
interface RouterConfig {
  routeNames: string[];
  routeParamList: Record<string, object | undefined>;
  routeGetIdList: Record<string, undefined>;
}
interface Routers {
  StackRouter: (options: object) => {
    getInitialState: (config: RouterConfig) => NavState;
    getStateForAction: (state: NavState, action: object, config: RouterConfig) => NavState | null;
    getStateForRouteNamesChange: (
      state: NavState,
      change: {
        routeNames: string[];
        routeParamList: Record<string, object | undefined>;
        routeKeyChanges: string[];
      },
    ) => NavState;
  };
  CommonActions: {
    navigate: (name: string, params?: object, options?: { pop?: boolean }) => object;
  };
}
const routers = (): Routers => {
  const here = createRequire(import.meta.url);
  const native = createRequire(realpathSync(here.resolve('@react-navigation/native')));
  const core = createRequire(realpathSync(native.resolve('@react-navigation/core')));
  return core('@react-navigation/routers') as Routers;
};

const { StackRouter, CommonActions } = routers();
const router = StackRouter({});
const configOf = (routeNames: string[]): RouterConfig => ({
  routeNames,
  routeParamList: {},
  routeGetIdList: Object.fromEntries(routeNames.map(n => [n, undefined])),
});

/** The routes each branch of `RootNavigator` registers, as far as this sheet is concerned. */
const SIGNED_OUT = ['Auth', 'Verify', 'ResetPassword', 'JoinCode'];
const SETUP = ['Onboarding', 'JoinCode', 'NewPassword'];
const READY_WITH_NOTE = ['Joined', 'Tabs', 'Family', 'JoinCode', 'NewPassword'];

/** Open `names` in order from the branch's first screen, as the person tapping through would. */
function opened(routeNames: string[], ...names: string[]): NavState {
  const config = configOf(routeNames);
  let state = router.getInitialState(config);
  for (const name of names) {
    state = router.getStateForAction(state, CommonActions.navigate(name), config) ?? state;
  }
  return state;
}

const namesOf = (s: NavState) => s.routes.map(r => r.name);

describe('the sheet’s buttons go back down to the sign-in page, on the side they name', () => {
  const config = configOf(SIGNED_OUT);
  const overAuth = opened(SIGNED_OUT, 'JoinCode');

  it('would push a second sign-in page over the sheet with navigate alone', () => {
    expect(namesOf(overAuth)).toEqual(['Auth', 'JoinCode']);
    const pushed = router.getStateForAction(
      overAuth,
      CommonActions.navigate('Auth', { mode: 'create' }),
      config,
    );
    expect(namesOf(pushed as NavState)).toEqual(['Auth', 'JoinCode', 'Auth']);
  });

  it('pops to the one there is with `pop`, carrying the side to open on', () => {
    const back = router.getStateForAction(
      overAuth,
      CommonActions.navigate('Auth', { mode: 'create', at: 1 }, { pop: true }),
      config,
    ) as NavState;
    expect(namesOf(back)).toEqual(['Auth']);
    expect(back.routes[0]?.params).toEqual({ mode: 'create', at: 1 });
  });
});

describe('a join made from the sheet opens on the confirmation, never on the sheet', () => {
  const onSetup = opened(SETUP, 'JoinCode');

  it('would leave the sheet as the only route if its key stayed the same', () => {
    expect(namesOf(onSetup)).toEqual(['Onboarding', 'JoinCode']);
    const kept = router.getStateForRouteNamesChange(onSetup, {
      routeNames: READY_WITH_NOTE,
      routeParamList: {},
      routeKeyChanges: [],
    });
    expect(namesOf(kept)).toEqual(['JoinCode']);
  });

  it('drops it when its key changes with the branch, and opens on the branch’s first screen', () => {
    const dropped = router.getStateForRouteNamesChange(onSetup, {
      routeNames: READY_WITH_NOTE,
      routeParamList: {},
      routeKeyChanges: ['JoinCode'],
    });
    expect(namesOf(dropped)).toEqual(['Joined']);
  });

  it('does the same from the first screen, and from Ended', () => {
    const onAuth = opened(SIGNED_OUT, 'JoinCode');
    expect(
      namesOf(
        router.getStateForRouteNamesChange(onAuth, {
          routeNames: SETUP,
          routeParamList: {},
          routeKeyChanges: ['JoinCode'],
        }),
      ),
    ).toEqual(['Onboarding']);
    const onEnded = opened(['Ended', ...SETUP], 'JoinCode');
    expect(namesOf(onEnded)).toEqual(['Ended', 'JoinCode']);
    expect(
      namesOf(
        router.getStateForRouteNamesChange(onEnded, {
          routeNames: READY_WITH_NOTE,
          routeParamList: {},
          routeKeyChanges: ['JoinCode'],
        }),
      ),
    ).toEqual(['Joined']);
  });
});
