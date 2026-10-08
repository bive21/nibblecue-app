/**
 * NO MODULE IS DRAWN AS THE OLD GLYPH (the owner, 2026-09-26: *"Why does the Web use old icon??
 * Remove this everywhere."*).
 *
 * `Icon` draws the owner's picture for a module at `ILLUSTRATED_MIN_SIZE` and up, and the old line
 * glyph below it (`illustrated.ts` says why the threshold exists). So a module icon drawn smaller
 * than the threshold is the old icon on a phone, whatever its name says — which is how the Schedule
 * wheel's houses (11 pt) and pills (13 pt) kept it after every other surface had the picture.
 *
 * A static scan, because the size is a prop: every `<Icon>` in the ui package and the app whose name
 * is a module (a literal picture name, or an expression that looks one up) and whose size resolves
 * to a number below the threshold fails here. A size it cannot resolve (a prop, a computed value) is
 * left to the component that owns it; a tiny glyph that is not a module (a chevron, a lock, a sun)
 * is not a picture and is not this test's business.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ILLUSTRATED_MIN_SIZE, ILLUSTRATED_NAMES } from './illustrated';

function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error('repository root (pnpm-workspace.yaml) not found');
    dir = up;
  }
}

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== 'node_modules') out.push(...tsxFiles(path));
    } else if (entry.endsWith('.tsx') && !/\.test\.tsx$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

const PICTURE_NAMES = new Set<string>(ILLUSTRATED_NAMES);
/** An expression that looks a module's (or a supply's) icon up rather than naming a glyph. */
const LOOKS_UP_A_MODULE = /\b(iconForModule|MODULE_ICON|SUPPLY_ICON|moduleIcon)\b/;

/** Every `<Icon … />` in `source` drawing a module below the picture size, as "name @ size". */
export function smallModuleIcons(source: string): string[] {
  const offenders: string[] = [];
  for (const [, props] of source.matchAll(/<Icon\b([\s\S]*?)\/>/g)) {
    const literal = /\bname="([^"]+)"/.exec(props ?? '')?.[1];
    const expr = /\bname=\{([^}]*)\}/.exec(props ?? '')?.[1];
    const isModule =
      (literal !== undefined && PICTURE_NAMES.has(literal)) ||
      (expr !== undefined && LOOKS_UP_A_MODULE.test(expr));
    if (!isModule) continue;
    const sizeExpr = /\bsize=\{([^}]*)\}/.exec(props ?? '')?.[1]?.trim();
    if (sizeExpr === undefined) continue;
    let size: number | undefined;
    if (/^\d+(\.\d+)?$/.test(sizeExpr)) size = Number(sizeExpr);
    else if (/^[A-Za-z_$][\w$]*$/.test(sizeExpr)) {
      const decl = new RegExp(`\\bconst ${sizeExpr}\\s*=\\s*(\\d+(?:\\.\\d+)?)\\s*;`).exec(source);
      if (decl) size = Number(decl[1]);
    }
    if (size !== undefined && size < ILLUSTRATED_MIN_SIZE) {
      offenders.push(`${literal ?? expr} @ ${size}`);
    }
  }
  return offenders;
}

describe('module icons are always the owner’s picture', () => {
  it('catches a module drawn below the picture size, by literal and by constant', () => {
    expect(smallModuleIcons('<Icon name={iconForModule(a)} size={13} color={x} />')).toEqual([
      'iconForModule(a) @ 13',
    ]);
    expect(
      smallModuleIcons('const CELL_ICON = 11;\n<Icon name="bottle" size={CELL_ICON} />'),
    ).toEqual(['bottle @ 11']);
    // not a module, and a module at the picture size: both fine
    expect(smallModuleIcons('<Icon name="chev" size={10} />')).toEqual([]);
    expect(
      smallModuleIcons(`<Icon name={iconForModule(a)} size={${ILLUSTRATED_MIN_SIZE}} />`),
    ).toEqual([]);
  });

  it('holds across the ui package and the app', () => {
    const root = repoRoot();
    const offenders: string[] = [];
    for (const base of ['packages/ui/src', 'apps/mobile/src']) {
      for (const file of tsxFiles(join(root, base))) {
        for (const hit of smallModuleIcons(readFileSync(file, 'utf8'))) {
          offenders.push(`${relative(root, file)}: ${hit}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
