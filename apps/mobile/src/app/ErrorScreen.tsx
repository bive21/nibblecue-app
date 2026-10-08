/**
 * What the app shows instead of disappearing (docs/DESIGN_SYSTEM.md §9: an error says what
 * happened and what the app is doing about it; docs/CRASH_REPORTS.md). It catches a render error
 * as a boundary, and a throw from anywhere else through the global trap, then says the one thing a
 * parent needs (nothing you logged is lost, it is on this phone) and offers "Try again", which
 * mounts everything below it afresh.
 *
 * EVERY CRASH IT SEES IS RECORDED (2026-10-08): a report with everything personal taken out goes to
 * the phone's queue the moment it is caught, and to the server on a later launch
 * (`src/crash/`). "Copy the details" copies that same report, so what a parent pastes into a
 * message says no more than what the app would send.
 *
 * It mounts a theme of its own, in the default look, for the page (`crash/CrashPage.tsx`): the app's
 * appearance provider is inside the tree this guards, and an error screen that needs the thing that
 * broke is not one. A class, because a boundary has to be one, which also means it can call no hook
 * and so needs no provider above it (`providers.test.ts`).
 */
import { crashDetails, type CrashReport } from '@nibblecue/core';
import { ThemeProvider } from '@nibblecue/ui';
import * as Clipboard from 'expo-clipboard';
import { Component, Fragment, type ErrorInfo, type ReactNode } from 'react';
import { CrashPage } from '../crash/CrashPage';
import { recordCrash } from '../crash/onDevice';
import { asError, installGlobalErrorTrap, onFatalError } from './errorTrap';

interface State {
  error: Error | null;
  report: CrashReport | null;
  copied: boolean;
  /** Bumped by "Try again": the children's key, so everything below mounts afresh. */
  attempt: number;
}

export class ErrorScreen extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null, report: null, copied: false, attempt: 0 };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error: asError(error), copied: false };
  }

  override componentDidMount(): void {
    installGlobalErrorTrap();
    // the trap has recorded it already; this only brings the page up
    onFatalError((error, report) => this.setState({ error, report, copied: false }));
  }

  override componentWillUnmount(): void {
    onFatalError(null);
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[cuddlecue] render error', error, info.componentStack);
    const report = recordCrash(error, {
      source: 'render',
      fatal: true,
      componentStack: info.componentStack ?? null,
    });
    this.setState({ report });
  }

  private readonly retry = (): void => {
    this.setState(s => ({ error: null, report: null, copied: false, attempt: s.attempt + 1 }));
  };

  private readonly copy = (): void => {
    const { report, error } = this.state;
    const text = report !== null ? crashDetails(report) : (error?.name ?? 'Error');
    void Clipboard.setStringAsync(text)
      .then(() => this.setState({ copied: true }))
      .catch(() => undefined);
  };

  override render(): ReactNode {
    const { error, report, copied, attempt } = this.state;
    if (error === null) return <Fragment key={attempt}>{this.props.children}</Fragment>;
    return (
      <ThemeProvider>
        <CrashPage
          onRetry={this.retry}
          onCopy={this.copy}
          copied={copied}
          details={__DEV__ && report !== null ? crashDetails(report) : null}
        />
      </ThemeProvider>
    );
  }
}
