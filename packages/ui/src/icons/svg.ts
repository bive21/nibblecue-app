/**
 * AN ICON AS AN SVG STRING, in one color. The widget on Android draws this (its picture of a glyph
 * is not the React Native one), and it is the same drawing `Icon` paints: the owner's file when
 * there is one, otherwise the built-in sprite, the second tone at half strength.
 *
 * No React and no React Native, so a widget layout and a node test can build one.
 */
import { ICON_PATHS, type IconElement, type IconName } from './paths';
import { CUSTOM_ICON_PATHS } from './paths.custom';

export type { IconName };

/**
 * The second tone, as `Icon` paints it (`ICON_SECONDARY_ALPHA`). Inlined so this file stays free
 * of React Native: a widget builds an SVG on the phone's widget task, which must not pull the
 * icon component in just to read a number.
 */
const SECONDARY = 0.5;

const esc = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * `name` drawn in `color` (a hex or rgba the caller already trusts). The second tone is the same
 * color at half strength, which is what `Icon` does with `withAlpha`.
 */
export function iconSvg(name: IconName, color: string): string {
  const def = CUSTOM_ICON_PATHS[name] ?? ICON_PATHS[name];
  const filled = def.fill === 'currentColor';
  const sw = def.strokeWidth ?? 1.7;
  const ink = esc(color);
  const body = def.elements.map(el => element(el, filled, ink)).join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${esc(def.viewBox)}" width="24" height="24" ` +
    `fill="${filled ? ink : 'none'}" stroke="${filled ? 'none' : ink}" ` +
    `stroke-width="${filled ? 0 : sw}" stroke-linecap="round" stroke-linejoin="round">` +
    `${body}</svg>`
  );
}

function element(el: IconElement, filled: boolean, ink: string): string {
  const fillValue = 'fill' in el ? el.fill : undefined;
  const opacityValue = 'opacity' in el ? el.opacity : undefined;
  const soft = el.tone === 'secondary' || fillValue === 'secondaryColor';
  const opacity = soft ? SECONDARY : (opacityValue ?? 1);
  const fade = opacity < 1 ? ` opacity="${opacity}"` : '';
  const stroke = el.tone === 'secondary' ? ` stroke="${ink}"` : '';
  const fill =
    fillValue === 'currentColor'
      ? ink
      : fillValue === 'secondaryColor'
        ? ink
        : (fillValue ?? (filled ? ink : 'none'));
  const paint = `fill="${esc(fill)}"${stroke}${fade}`;
  switch (el.type) {
    case 'path':
      return `<path d="${esc(el.d)}" ${paint}/>`;
    case 'circle':
      return `<circle cx="${el.cx}" cy="${el.cy}" r="${el.r}" ${paint}/>`;
    case 'rect':
      return `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="${el.rx ?? 0}" ${paint}/>`;
    case 'line':
      return `<line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" ${paint}/>`;
  }
}
