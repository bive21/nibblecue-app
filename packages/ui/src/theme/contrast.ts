/**
 * WCAG 2.1 contrast arithmetic, plus the one thing the token gate could not do before: the
 * ground a text token actually lands on once a translucent surface is composited over it.
 * `docs/DESIGN_SYSTEM.md` §12 rule 1 — a color is a color ON A GROUND — and
 * `docs/CONTRAST_FINDINGS.md` §2 (measure the composite, never guess the layer).
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(input: string): Rgba {
  const s = input.trim();
  if (s.startsWith('#')) {
    const h = s.slice(1);
    const full =
      h.length === 3 || h.length === 4
        ? h
            .split('')
            .map(c => c + c)
            .join('')
        : h;
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) / 255 : 1 };
  }
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (!m) throw new Error(`unparseable color: ${input}`);
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] === undefined ? 1 : Number(m[4]),
  };
}

export const toHex = (c: Rgba): string =>
  '#' +
  [c.r, c.g, c.b]
    .map(v =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase();

/** `top` painted over an opaque `under`, with an optional extra opacity on the top layer. */
export function composite(under: string, top: string, opacity = 1): string {
  const u = parseColor(under);
  const t = parseColor(top);
  const a = t.a * opacity;
  return toHex({
    r: t.r * a + u.r * (1 - a),
    g: t.g * a + u.g * (1 - a),
    b: t.b * a + u.b * (1 - a),
    a: 1,
  });
}

/**
 * `color` at `alpha`, as an rgba string — the alpha lives IN the color, not in an `opacity` prop.
 *
 * An `opacity` below 1 composites the whole subtree through a layer; alpha in the color
 * composites one fill in place. The same pixels for a plain view, one fewer layer, and a color
 * that can be read, tested and compared as a value (the box-shadow layers in shadows.ts are
 * built from it). An existing alpha on the input is multiplied, so `rgba(...,0.86)` at 0.5 is
 * 0.43, which is what `opacity: 0.5` on that color would have meant.
 */
export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color);
  const a = Math.max(0, Math.min(1, c.a * alpha));
  const ch = (v: number): number => Math.round(Math.max(0, Math.min(255, v)));
  return `rgba(${ch(c.r)},${ch(c.g)},${ch(c.b)},${a})`;
}

const lin = (c: number): number => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

export function luminance(color: string): number {
  const c = parseColor(color);
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

export function contrastRatio(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Body text and any control that contains a letter or a number. */
export const AA_TEXT = 4.5;
/** Large text, glyph-only controls, non-text UI. */
export const AA_GRAPHIC = 3.0;
