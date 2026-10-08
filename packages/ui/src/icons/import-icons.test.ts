import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ICON_NOTES,
  IconImportError,
  MODULE_ICON_NAMES,
  README_END,
  README_START,
  iconNameForFile,
  iconNamesFrom,
  orderedNames,
  parseSvg,
  parseTranslate,
  polyToPath,
  renderCustomPaths,
  renderReadmeBlock,
  spliceReadme,
  translatePath,
} from '../../../../tools/ui/import-icons.lib.mjs';
import { ICON_NAMES, ICON_PATHS, type IconDef } from './paths';
import { CUSTOM_ICON_PATHS } from './paths.custom';

/**
 * The owner's icons arrive as SVG files (assets/brand/kit/08-icons/README.md) and reach the
 * app through tools/ui/import-icons.mjs. The converter is pure, so every dialect an exporter
 * writes is a string here, and every refusal is asserted by the message the owner would read.
 */
const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const svg = (attrs: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" ${attrs}>${body}</svg>`;

describe('parseSvg: a stroke icon', () => {
  it('reads paint on the root with bare shapes (the sprite and Feather write it this way)', () => {
    const { def, summary } = parseSvg(
      svg(
        'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"',
        '<path d="M3 12h18"/><circle cx="12" cy="12" r="3"/>',
      ),
      'bottle.svg',
    );
    expect(def).toEqual({
      viewBox: '0 0 24 24',
      fill: 'none',
      strokeWidth: 1.7,
      elements: [
        { type: 'path', d: 'M3 12h18' },
        { type: 'circle', cx: 12, cy: 12, r: 3 },
      ],
    });
    expect(summary).toEqual({
      mode: 'stroke',
      strokeWidth: 1.7,
      shapes: 2,
      viewBox: '0 0 24 24',
      tones: 1,
    });
  });

  it("reads Illustrator's internal CSS classes, prolog, DOCTYPE and CDATA", () => {
    const text =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">' +
      svg(
        'viewBox="0 0 24 24"',
        '<style type="text/css"><![CDATA[ .st0{fill:none;stroke:#231F20;stroke-width:1.7px;} ]]></style>' +
          '<g id="Layer_1"><path class="st0" d="M4 4L20 20"/></g>',
      );
    const { def } = parseSvg(text, 'sleep.svg');
    expect(def.fill).toBe('none');
    expect(def.strokeWidth).toBe(1.7);
    expect(def.elements).toEqual([{ type: 'path', d: 'M4 4L20 20' }]);
  });

  it('reads an inline style, and a line stays a line', () => {
    const { def } = parseSvg(
      svg(
        'viewBox="0 0 24 24"',
        '<line x1="2" y1="2" x2="22" y2="22" style="stroke:#000;fill:none"/>',
      ),
      'x.svg',
    );
    expect(def.elements).toEqual([{ type: 'line', x1: 2, y1: 2, x2: 22, y2: 22 }]);
    // no width in the file: the built-in 1.7 applies at render time, so none is written
    expect(def.strokeWidth).toBeUndefined();
  });

  it('keeps the path data verbatim (whitespace collapsed) so nothing is re-derived', () => {
    const d =
      'M11 1.7c-.9 0-1.5.7-1.5 1.6 0 .6.3 1.2.7 1.5h3.6c.4-.3.7-.9.7-1.5 0-.9-.6-1.6-1.5-1.6';
    const { def } = parseSvg(
      svg('viewBox="0 0 24 24" stroke="#000" fill="none"', `<path d="${d}"/>`),
      'a.svg',
    );
    expect(def.elements[0]).toEqual({ type: 'path', d });
  });
});

describe('parseSvg: a filled icon', () => {
  it('reads shapes with a fill and no stroke as a filled glyph in currentColor', () => {
    const { def, summary } = parseSvg(
      svg('viewBox="0 0 24 24"', '<circle cx="12" cy="12" r="4" fill="#000"/>'),
      'more.svg',
    );
    expect(def).toEqual({
      viewBox: '0 0 24 24',
      fill: 'currentColor',
      elements: [{ type: 'circle', cx: 12, cy: 12, r: 4 }],
    });
    expect(summary.mode).toBe('filled');
  });

  it('discards the drawn color: white, black and teal all come out as the runtime ink', () => {
    for (const color of ['#fff', 'white', 'rgb(63,177,180)', 'currentColor']) {
      const { def } = parseSvg(
        svg('viewBox="0 0 24 24"', `<rect width="10" height="10" fill="${color}"/>`),
        'f.svg',
      );
      expect(def.fill).toBe('currentColor');
      expect(JSON.stringify(def)).not.toContain(color === 'currentColor' ? 'zzz' : color);
    }
  });
});

describe('parseSvg: a mixed file', () => {
  /*
    THE BUILT-IN EXAMPLE IS THE EAR THERMOMETER'S DOT, a filled circle inside a line drawing (it was
    the milk drop until 2026-09-27, when every stop took the one stop square and the drop had nothing
    left to draw). The fixture is an ear's outline and its dot as an exporter would write them, with
    the owner's black on the dot; the last line holds the example to the sprite, so the day `temp-ear`
    stops drawing its dot this way the test says to pick another rather than naming a stale one.
  */
  it('carries a filled shape inside a stroke icon as its own fill, the way temp-ear’s dot is drawn', () => {
    const { def } = parseSvg(
      svg(
        'viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.7"',
        '<path d="M7.4 9.6a5.1 5.1 0 0 1 10.2 0"/><circle cx="11.4" cy="13.4" r="1.3" fill="#000" stroke="none"/>',
      ),
      'temp-ear.svg',
    );
    expect(def.fill).toBe('none');
    expect(def.elements).toEqual([
      { type: 'path', d: 'M7.4 9.6a5.1 5.1 0 0 1 10.2 0' },
      { type: 'circle', cx: 11.4, cy: 13.4, r: 1.3, fill: 'currentColor' },
    ]);
    expect(ICON_PATHS['temp-ear'].fill).toBe('none');
    expect(ICON_PATHS['temp-ear'].elements).toContainEqual(def.elements[1]);
  });

  it('uses one stroke width for the icon and says so when the file has several', () => {
    const { def, notes } = parseSvg(
      svg(
        'viewBox="0 0 24 24" fill="none" stroke="#000"',
        '<path d="M2 2h4" stroke-width="2"/><path d="M2 6h4" stroke-width="2"/><path d="M2 9h4" stroke-width="1"/>',
      ),
      'w.svg',
    );
    expect(def.strokeWidth).toBe(2);
    expect(notes.join('\n')).toContain('different widths');
  });
});

describe('parseSvg: shapes that become paths', () => {
  it('converts a polygon to closed path data and a polyline to open path data', () => {
    expect(polyToPath('2,2 6,2 4,6', true)).toBe('M2 2 L6 2 4 6 Z');
    expect(polyToPath('2 2 6 2 4 6', false)).toBe('M2 2 L6 2 4 6');
    const { def } = parseSvg(
      svg('viewBox="0 0 24 24"', '<polygon points="2,2 6,2 4,6" fill="#000"/>'),
      'play.svg',
    );
    expect(def.elements).toEqual([{ type: 'path', d: 'M2 2 L6 2 4 6 Z' }]);
  });

  it('converts an ellipse to two arcs', () => {
    const { def } = parseSvg(
      svg(
        'viewBox="0 0 24 24" fill="none" stroke="#000"',
        '<ellipse cx="12" cy="12" rx="6" ry="4"/>',
      ),
      'e.svg',
    );
    expect(def.elements).toEqual([{ type: 'path', d: 'M6 12 A6 4 0 1 0 18 12 A6 4 0 1 0 6 12 Z' }]);
  });

  it('keeps a rounded rect as a rect, and makes a path of one whose corners differ', () => {
    const rounded = parseSvg(
      svg('viewBox="0 0 24 24"', '<rect x="1" y="2" width="10" height="6" rx="1" fill="#000"/>'),
      'r.svg',
    ).def.elements[0];
    expect(rounded).toEqual({ type: 'rect', x: 1, y: 2, width: 10, height: 6, rx: 1 });
    const uneven = parseSvg(
      svg('viewBox="0 0 24 24"', '<rect width="10" height="6" rx="1" ry="2" fill="#000"/>'),
      'r.svg',
    ).def.elements[0];
    expect(uneven?.type).toBe('path');
  });

  it('keeps a faded shape as a path with its opacity, which is the one element that carries it', () => {
    const { def } = parseSvg(
      svg('viewBox="0 0 24 24"', '<circle cx="12" cy="12" r="4" fill="#000" opacity="0.5"/>'),
      'o.svg',
    );
    expect(def.elements[0]).toEqual({
      type: 'path',
      d: 'M8 12 A4 4 0 1 0 16 12 A4 4 0 1 0 8 12 Z',
      opacity: 0.5,
    });
  });

  /**
   * A TINT UNDER A FULL OUTLINE — the owner's active tab icons (2026-09-23) fill a shape at 16%
   * and stroke it at full strength. An element paints its fill and its stroke at one opacity, so
   * this used to come out as a SOLID fill, burying the door, the calendar lines and the wave
   * inside it. It is two elements now: the tint, then the outline over it.
   */
  it('draws a fill fainter than its outline as a tint under the outline, never a solid fill', () => {
    const { def } = parseSvg(
      svg(
        'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"',
        '<rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" fill-opacity="0.16"/>' +
          '<path d="M8 12h8"/>',
      ),
      'tab-schedule-active.svg',
    );
    expect(def.elements).toEqual([
      // the tint: a path, the one element that carries an opacity
      {
        type: 'path',
        d: 'M6 4 H18 A2 2 0 0 1 20 6 V18 A2 2 0 0 1 18 20 H6 A2 2 0 0 1 4 18 V6 A2 2 0 0 1 6 4 Z',
        opacity: 0.16,
        fill: 'currentColor',
      },
      // the outline over it at full strength, with no fill of its own
      { type: 'rect', x: 4, y: 4, width: 16, height: 16, rx: 2 },
      { type: 'path', d: 'M8 12h8' },
    ]);
    expect(def.fill).toBe('none');
  });

  it('leaves a shape whose fill and outline are equally strong as one element', () => {
    const { def } = parseSvg(
      svg(
        'viewBox="0 0 24 24" fill="none" stroke="currentColor"',
        '<path d="M4 4h16v16H4Z" fill="currentColor"/>',
      ),
      'solid.svg',
    );
    expect(def.elements).toEqual([{ type: 'path', d: 'M4 4h16v16H4Z', fill: 'currentColor' }]);
  });
});

describe('parseSvg: a moved group', () => {
  it('applies translate() on a <g> to every shape inside it', () => {
    const { def } = parseSvg(
      svg(
        'viewBox="0 0 24 24" fill="none" stroke="#000"',
        '<g transform="translate(2, 3)"><path d="M1 1 L5 5 h3"/><rect x="1" y="1" width="4" height="4"/>' +
          '<circle cx="1" cy="1" r="1"/><line x1="0" y1="0" x2="1" y2="1"/></g>',
      ),
      'g.svg',
    );
    expect(def.elements).toEqual([
      { type: 'path', d: 'M3 4 L7 8 h3' },
      { type: 'rect', x: 3, y: 4, width: 4, height: 4 },
      { type: 'circle', cx: 3, cy: 4, r: 1 },
      { type: 'line', x1: 2, y1: 3, x2: 3, y2: 4 },
    ]);
  });

  it('moves absolute commands only, treats a leading m as absolute, and leaves arc flags alone', () => {
    expect(translatePath('m1 2 3 4 M5 6 H7 V8 A1 1 0 0 1 9 10 a1 1 0 011 1 z', 10, 20)).toBe(
      'm11 22 l3 4 M15 26 H17 V28 A1 1 0 0 1 19 30 a1 1 0 0 1 1 1 z',
    );
  });

  it("accepts Illustrator's identity matrix as a move, and nothing else as a transform", () => {
    expect(parseTranslate('matrix(1 0 0 1 4 5)')).toEqual({ dx: 4, dy: 5 });
    expect(parseTranslate('translate(1) translate(2 3)')).toEqual({ dx: 3, dy: 3 });
    expect(() => parseTranslate('rotate(45)', 'r.svg')).toThrow(/only translate\(\) is supported/);
    expect(() => parseTranslate('scale(2)', 'r.svg')).toThrow(/flatten/i);
  });
});

describe('parseSvg: what is refused, and why the owner would read', () => {
  const refuse =
    (body: string, attrs = 'viewBox="0 0 24 24"') =>
    () =>
      parseSvg(svg(attrs, body), 'bad.svg');

  it('text', () => {
    expect(refuse('<text x="1" y="1">hi</text>')).toThrow(IconImportError);
    expect(refuse('<text x="1" y="1">hi</text>')).toThrow(/convert the text to outlines/);
  });

  it('an embedded picture', () => {
    expect(refuse('<image href="data:image/png;base64,AAAA" width="24" height="24"/>')).toThrow(
      /embedded picture/,
    );
  });

  it('a gradient, named as one', () => {
    expect(
      refuse(
        '<defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs>' +
          '<rect width="24" height="24" fill="url(#g)"/>',
      ),
    ).toThrow(/painted with a gradient/);
  });

  it('a <use>', () => {
    expect(refuse('<defs><path id="a" d="M0 0h1"/></defs><use href="#a"/>')).toThrow(/uses <use>/);
  });

  it('an effect and a mask', () => {
    expect(refuse('<rect width="4" height="4" filter="url(#shadow)"/>')).toThrow(/effect/);
    expect(refuse('<rect width="4" height="4" mask="url(#m)"/>')).toThrow(/mask/);
  });

  it('white as the lighter tone — the knockout that would become a pale blob', () => {
    expect(refuse('<path d="M0 0h24v24" fill="#000"/><path d="M4 4h4v4" fill="#fff"/>')).toThrow(
      /uses white \(#ffffff\) as its lighter tone/,
    );
  });

  it('a third color — a picture, not a glyph', () => {
    expect(
      refuse(
        '<path d="M0 0h4" stroke="#208fb3"/><path d="M0 4h4" stroke="#75c8e4"/><path d="M0 8h4" stroke="#ff0000"/>',
        'viewBox="0 0 24 24" fill="none"',
      ),
    ).toThrow(/uses 3 colors/);
  });

  it('a second color the tool cannot weigh', () => {
    // two hues of different lightness are two tones, whatever the hues are
    const bare = 'viewBox="0 0 24 24" fill="none"';
    expect(
      refuse('<path d="M0 0h4" stroke="#ff0000"/><path d="M0 4h4" stroke="#0000ff"/>', bare),
    ).not.toThrow();
    // a named color has no lightness the tool will guess at
    expect(
      refuse('<path d="M0 0h4" stroke="#208fb3"/><path d="M0 4h4" stroke="teal"/>', bare),
    ).toThrow(/not a hex color/);
  });

  it('a file with no viewBox and no size, and one with nothing to draw', () => {
    expect(refuse('<path d="M0 0h1" stroke="#000"/>', '')).toThrow(/no viewBox/);
    expect(refuse('<path d="M0 0h1" fill="none"/>')).toThrow(/no shapes found/);
    expect(refuse('')).toThrow(/no shapes found/);
  });

  it('a file name that is not an icon name — with the list, or the near miss', () => {
    const names = ['bottle', 'sleep', 'bellOff'];
    expect(iconNameForFile('bottle.svg', names)).toBe('bottle');
    expect(iconNameForFile('bottle.SVG', names)).toBe('bottle');
    expect(() => iconNameForFile('bottel.svg', names)).toThrow(/one of: bottle, sleep, bellOff/);
    expect(() => iconNameForFile('belloff.svg', names)).toThrow(/did you mean "bellOff\.svg"/);
  });
});

describe('parseSvg: what is tolerated', () => {
  it("skips Figma's frame-sized clip, and refuses a clip that is not the frame", () => {
    const figma = (rect: string) =>
      svg(
        'width="24" height="24" viewBox="0 0 24 24" fill="none"',
        `<g clip-path="url(#clip0_1_2)"><path d="M4 4L20 20" stroke="black" stroke-width="1.7"/></g>` +
          `<defs><clipPath id="clip0_1_2">${rect}</clipPath></defs>`,
      );
    expect(
      parseSvg(figma('<rect width="24" height="24" fill="white"/>'), 'edit.svg').def.elements,
    ).toEqual([{ type: 'path', d: 'M4 4L20 20' }]);
    expect(() => parseSvg(figma('<rect width="12" height="24"/>'), 'edit.svg')).toThrow(
      /clipping mask/,
    );
  });

  it('skips editor metadata, hidden shapes and comments, and notes what it skipped', () => {
    const { def, notes } = parseSvg(
      '<!-- exported -->' +
        svg(
          'viewBox="0 0 24 24" xmlns:sodipodi="x" fill="none" stroke="#000"',
          '<sodipodi:namedview id="n"/><title>bath</title><path d="M1 1h2" display="none"/><path d="M2 2h2"/>',
        ),
      'bath.svg',
    );
    expect(def.elements).toEqual([{ type: 'path', d: 'M2 2h2' }]);
    expect(notes.join('\n')).toContain('hidden <path> was skipped');
  });

  it('reads width and height when there is no viewBox, and says the grid is not 24', () => {
    const { def, notes } = parseSvg(
      svg('width="48" height="48"', '<rect width="10" height="10" fill="#000"/>'),
      'w.svg',
    );
    expect(def.viewBox).toBe('0 0 48 48');
    expect(notes.join('\n')).toMatch(/not "0 0 24 24"/);
  });
});

describe('the round trip over the built-in set', () => {
  // Every built-in glyph, written out as the SVG an exporter would produce and read back: the
  // converter must return exactly the entry it started from, or an owner's file that matches
  // the sprite would still come out different from it.
  //
  // A TWO-TONE GLYPH IS WRITTEN IN TWO INKS, as the owner's files are (`parseSvg: two tones`,
  // above): a file has no other way to say which part is the detail, so a `tone: 'secondary'`
  // stroke and a `secondaryColor` fill are written in the lighter ink and everything else in the
  // main one. The built-in set was all one tone until setup's role glyphs (2026-09-27); a one-tone
  // glyph is still written in `currentColor`, exactly as before.
  const MAIN = '#208fb3';
  const DETAIL = '#75c8e4';
  const twoTone = (def: IconDef): boolean =>
    def.elements.some(
      el => el.tone === 'secondary' || ('fill' in el && el.fill === 'secondaryColor'),
    );
  const paint = (fill: string) => (fill === 'secondaryColor' ? DETAIL : fill);
  const attr = (el: { fill?: string; opacity?: number; tone?: string }) =>
    `${el.fill ? ` fill="${paint(el.fill)}"` : ''}` +
    `${el.opacity !== undefined ? ` opacity="${el.opacity}"` : ''}` +
    `${el.tone === 'secondary' ? ` stroke="${DETAIL}"` : ''}`;
  const toSvg = (def: IconDef) => {
    const ink = twoTone(def) ? MAIN : 'currentColor';
    return svg(
      `viewBox="${def.viewBox}" fill="${def.fill === 'none' ? 'none' : ink}"` +
        (def.fill === 'none'
          ? ` stroke="${ink}"${def.strokeWidth !== undefined ? ` stroke-width="${def.strokeWidth}"` : ''}`
          : ''),
      def.elements
        .map(el => {
          switch (el.type) {
            case 'path':
              return `<path d="${el.d}"${attr(el)}/>`;
            case 'circle':
              return `<circle cx="${el.cx}" cy="${el.cy}" r="${el.r}"${attr(el)}/>`;
            case 'rect':
              return (
                `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}"` +
                `${el.rx !== undefined ? ` rx="${el.rx}"` : ''}${attr(el)}/>`
              );
            case 'line':
              return `<line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}"${attr(el)}/>`;
          }
        })
        .join(''),
    );
  };

  it('writes a two-tone glyph in two inks, and every one-tone glyph as before', () => {
    // the role glyphs are the built-in set's two-tone members: a detail stroke, and a detail fill
    expect(twoTone(ICON_PATHS.parent)).toBe(true);
    expect(twoTone(ICON_PATHS.caregiver)).toBe(true);
    expect(toSvg(ICON_PATHS.parent)).toContain(`stroke="${DETAIL}"`);
    expect(toSvg(ICON_PATHS.caregiver)).toContain(`fill="${DETAIL}"`);
    expect(toSvg(ICON_PATHS.check)).toContain('stroke="currentColor"');
    expect(toSvg(ICON_PATHS.check)).not.toContain(MAIN);
  });

  it.each(ICON_NAMES)('%s survives export and import unchanged', name => {
    const { alias: _alias, ...expected } = ICON_PATHS[name];
    void _alias;
    const { def } = parseSvg(toSvg(ICON_PATHS[name]), `${name}.svg`);
    expect(def).toEqual({
      ...expected,
      elements: expected.elements.map(el =>
        el.type === 'rect' && el.rx === 0 ? { ...el, rx: undefined } : el,
      ),
    });
  });
});

describe('the names', () => {
  const source = read('paths.ts');

  it('reads the IconName union from paths.ts as text, and it is the set the module exports', () => {
    expect([...iconNamesFrom(source)].sort()).toEqual([...ICON_NAMES].sort());
  });

  it('knows every module glyph, and describes only names that exist', () => {
    const names = iconNamesFrom(source);
    for (const m of MODULE_ICON_NAMES) expect(names).toContain(m);
    for (const k of Object.keys(ICON_NOTES)) expect(names).toContain(k);
  });

  it('lists the module glyphs first, and every name once', () => {
    const ordered = orderedNames(iconNamesFrom(source));
    expect(ordered.slice(0, MODULE_ICON_NAMES.length)).toEqual([...MODULE_ICON_NAMES]);
    expect([...ordered].sort()).toEqual([...ICON_NAMES].sort());
  });
});

describe('what is generated', () => {
  it('renders an empty table when there is no SVG, typed against IconName and IconDef', () => {
    const out = renderCustomPaths([]);
    expect(out).toContain("import type { IconDef, IconName } from './paths';");
    expect(out).toContain(
      'export const CUSTOM_ICON_PATHS: Partial<Record<IconName, IconDef>> = {};',
    );
    expect(out).toContain('GENERATED by tools/ui/import-icons.mjs');
  });

  it('renders an entry under its name, quoting the names that need it', () => {
    const def: IconDef = {
      viewBox: '0 0 24 24',
      fill: 'none',
      strokeWidth: 1.7,
      elements: [{ type: 'path', d: 'M1 1h2' }],
    };
    const out = renderCustomPaths([
      { name: 'supply-wipes', file: 'supply-wipes.svg', def },
      { name: 'bottle', file: 'bottle.svg', def },
    ]);
    expect(out).toContain(
      "'supply-wipes': { viewBox: '0 0 24 24', fill: 'none', strokeWidth: 1.7, elements: [{ type: 'path', d: 'M1 1h2' }] },",
    );
    expect(out).toContain('bottle: { viewBox');
    expect(out).toContain('Sources: `supply-wipes.svg`, `bottle.svg`');
  });

  it("renders the README's table between its markers, and refuses a README without them", () => {
    const block = renderReadmeBlock(['bottle', 'chev', 'supply-wipes'], ['chev']);
    expect(block.startsWith(README_START)).toBe(true);
    expect(block.endsWith(README_END)).toBe(true);
    expect(block).toContain(
      '| `bottle.svg` | the bottle feed — the Bottle module everywhere it appears | built-in |',
    );
    expect(block).toContain('| `chev.svg` | the small › on a row that opens something | yours |');
    expect(block.indexOf('bottle.svg')).toBeLessThan(block.indexOf('chev.svg'));
    const readme = `# Title\n\nintro\n\n${README_START} old -->\nstale\n${README_END}\n\ntail\n`;
    expect(spliceReadme(readme, block)).toBe(`# Title\n\nintro\n\n${block}\n\ntail\n`);
    expect(() => spliceReadme('# Title\n', block)).toThrow(/markers/);
  });
});

describe('Icon.tsx: the owner’s glyph wins', () => {
  const src = withoutComments(read('Icon.tsx'));

  it('consults CUSTOM_ICON_PATHS before ICON_PATHS, by name', () => {
    expect(src).toMatch(/import \{ CUSTOM_ICON_PATHS \} from '\.\/paths\.custom';/);
    expect(src).toMatch(/const def = CUSTOM_ICON_PATHS\[name\] \?\? ICON_PATHS\[name\];/);
  });

  it('reads the built-in table nowhere else, so no code path can bypass the override', () => {
    expect(src.match(/(?<!CUSTOM_)ICON_PATHS\[/g)?.length).toBe(1);
  });

  it('holds a generated custom table whose every key is an icon name', () => {
    expect(read('paths.custom.ts')).toContain('GENERATED by tools/ui/import-icons.mjs');
    for (const [name, def] of Object.entries(CUSTOM_ICON_PATHS)) {
      expect(ICON_NAMES).toContain(name);
      expect(def.viewBox).toMatch(/^\S+ \S+ \S+ \S+$/);
      expect(def.elements.length).toBeGreaterThan(0);
    }
  });
});

/**
 * TWO TONES OF ONE INK (the owner, 2026-09-19: "I want to have a two tone color for each module
 * icon"). Their files draw the silhouette in a dark hue and the detail in a lighter one; the
 * darker is the icon's main ink and the lighter is marked as the secondary tone, which Icon.tsx
 * paints in the same runtime color at half strength. Which of the two is which is decided by
 * lightness, never by order in the file.
 */
describe('parseSvg: two tones', () => {
  const root = 'viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"';

  it('marks the lighter color as the secondary tone on strokes and on fills', () => {
    const { def, summary, notes } = parseSvg(
      svg(
        root,
        '<path d="M3 12h18" stroke="#208FB3" stroke-width="1.7"/>' +
          '<path d="M5 15h14" stroke="#75C8E4" stroke-width="1.7"/>' +
          '<circle cx="17.6" cy="6.4" r="1.4" fill="#75C8E4"/>' +
          '<circle cx="4" cy="4" r="1" fill="#75C8E4" stroke="#208FB3" stroke-width="1.7"/>',
      ),
      'bath.svg',
    );
    expect(def.fill).toBe('none');
    expect(def.elements).toEqual([
      { type: 'path', d: 'M3 12h18' },
      { type: 'path', d: 'M5 15h14', tone: 'secondary' },
      { type: 'circle', cx: 17.6, cy: 6.4, r: 1.4, fill: 'secondaryColor' },
      // a lighter fill inside a main-ink outline: the fill takes the tone, the stroke does not
      { type: 'circle', cx: 4, cy: 4, r: 1, fill: 'secondaryColor' },
    ]);
    expect(summary.tones).toBe(2);
    expect(summary.primary).toBe('#208fb3');
    expect(summary.secondary).toBe('#75c8e4');
    expect(notes).toContain('two tones: #208fb3 is the main ink, #75c8e4 the lighter detail tone');
  });

  it('weighs the two by lightness, whatever order they are drawn in', () => {
    const { def } = parseSvg(
      svg(
        root,
        '<path d="M0 0h4" stroke="#75C8E4" stroke-width="1.7"/>' +
          '<path d="M0 4h4" stroke="#208FB3" stroke-width="1.7"/>',
      ),
      'bath.svg',
    );
    expect(def.elements).toEqual([
      { type: 'path', d: 'M0 0h4', tone: 'secondary' },
      { type: 'path', d: 'M0 4h4' },
    ]);
  });

  it('a filled glyph keeps its lighter parts as the secondary fill', () => {
    const { def, summary } = parseSvg(
      svg(
        'viewBox="0 0 24 24"',
        '<path d="M0 0h24v24H0Z" fill="#000000"/><path d="M4 4h4v4H4Z" fill="#808080"/>',
      ),
      'play.svg',
    );
    expect(def.fill).toBe('currentColor');
    expect(def.elements).toEqual([
      { type: 'path', d: 'M0 0h24v24H0Z' },
      { type: 'path', d: 'M4 4h4v4H4Z', fill: 'secondaryColor' },
    ]);
    expect(summary.tones).toBe(2);
  });

  it('a one-color file is still one tone, exactly as before', () => {
    const { def, summary } = parseSvg(
      svg(root, '<path d="M3 12h18" stroke="#208FB3" stroke-width="1.7"/>'),
      'bath.svg',
    );
    expect(def.elements).toEqual([{ type: 'path', d: 'M3 12h18' }]);
    expect(summary.tones).toBe(1);
    expect(summary.secondary).toBeUndefined();
  });
});
