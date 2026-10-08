/** The EAS pre-install hook that puts the repository's pnpm first; the account is in `eas-pnpm.cjs`. */
export function wantedPnpm(rootPackageJson: { packageManager?: string }): string;

export function cleanEnv(env: {
  readonly [name: string]: string | undefined;
}): Record<string, string | undefined>;

export function isInside(dir: string, root: string): boolean;

export function launcherDir(args: {
  pathDirs: readonly string[];
  current: string | null;
  root: string;
  isWritable: (dir: string) => boolean;
}): string | null;

export function launcherScript(target: string): string;

export function stopSentence(args: {
  found: string | null;
  at: string | null;
  want: string;
}): string;

export function installPath(value: string): string[];
