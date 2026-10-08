/**
 * The pure half of `tools/ui/import-icons.mjs`: SVG text in, an `IconDef` out. No dependencies
 * and no file system, so `packages/ui/src/icons/import-icons.test.ts` runs every conversion in
 * node against small SVG strings, and the CLI is only the loop over the drop folder.
 *
 * WHY A PARSER OF ITS OWN. The owner will export these files from whatever they draw in —
 * Illustrator, Inkscape, Figma, a web tool — and each exporter writes a different dialect of the
 * same drawing: paint on the root (`<svg fill="none" stroke="currentColor">` with bare children,
 * the way the prototype's sprite is written), paint in a `<style>` block of CSS classes
 * (Illustrator's "Internal CSS"), paint inline (`style="fill:none;stroke:#000"`), a `<g>` that
 * carries a `translate`, a frame-sized `clipPath` around everything (Figma). A real XML parser
 * would read all of them and understand none of them; what is needed is the small SVG subset an
 * icon can be made of, resolved to the four element kinds `Icon.tsx` draws, plus a clear refusal
 * of everything that cannot be drawn that way — text, pictures, gradients, effects, symbols.
 *
 * WHAT COMES OUT is exactly the shape of the built-in `ICON_PATHS` entries, so a custom glyph is
 * indistinguishable from a built-in one everywhere downstream: one `viewBox`, `fill: 'none'` for
 * a stroke icon in the current color or `fill: 'currentColor'` for a filled glyph, and inside a
 * stroke icon a filled shape carries its own `fill: 'currentColor'` (the way `temp-ear`'s dot does).
 * Whatever color the owner drew in is discarded on purpose: the runtime paints the glyph in the
 * text or category color, which is why a file must use ONE color and a white "knockout" shape
 * is refused rather than rendered as a solid blob.
 */

export class IconImportError extends Error {
  constructor(message, file) {
    super(file ? `${file}: ${message}` : message);
    this.name = 'IconImportError';
    this.file = file ?? null;
  }
}

/**
 * The module glyphs, in the order the owner will look for them (CLAUDE.md §3's modules). They
 * head the README's table; everything else follows in the order `IconName` declares it.
 */
export const MODULE_ICON_NAMES = [
  'bottle',
  'breast',
  'pump',
  'diaper',
  'sleep',
  'solids',
  'med',
  'water',
  'growth',
  'temp',
  'bath',
  'tummy',
];

/**
 * What each glyph is used for, for the owner's README. Best effort, written from where each name
 * is drawn (2026-09-19); a name with no line here is listed without one, so a glyph added to
 * `IconName` later never blocks the import — it only reads "—" until someone describes it.
 */
export const ICON_NOTES = {
  bottle: 'the bottle feed — the Bottle module everywhere it appears',
  breast: 'breastfeeding (the module registry’s `heart` glyph draws this one too)',
  pump: 'pumping',
  diaper: 'diaper changes',
  sleep: 'sleep',
  solids: 'solid food',
  med: 'medicine — a care item',
  water: 'water',
  growth: 'growth measurements',
  temp: 'temperature',
  bath: 'bath',
  tummy: 'tummy time',
  star: 'the star — Plus, favorites, feature requests',
  note: 'a note; also what a module with no glyph of its own gets',
  info: 'information, the shopping list’s footnote',
  plus: 'the add control (+)',
  home: 'the Today tab',
  cal: 'the Schedule tab and every date control',
  chart: 'the Reports tab and the history charts',
  chat: 'Community discussions',
  more: 'the More tab (three dots — a filled glyph)',
  chev: 'the small › on a row that opens something',
  back: 'the back arrow in the top bar',
  up: 'move up',
  down: 'move down',
  clock: 'a time — time pickers and timer rows',
  check: 'the checkmark — done, selected, included',
  x: 'close or dismiss',
  snow: 'frozen — the freezer in the milk stash',
  box: 'a container — stash containers and supplies',
  bell: 'reminders and notifications',
  bellOff: 'a reminder that arrives silently — the Reminders picker',
  vibrate: 'a reminder that buzzes — the Reminders picker',
  users: 'the household — the people caring for the baby',
  flag: 'something went wrong — errors and warnings',
  bookmark: 'saved (Community)',
  undo: 'undo, after a delete',
  shield: 'privacy, account security and vaccines',
  export: 'export and download',
  lock: 'a Plus-only control, shown before it is tapped',
  card: 'billing — the payment card',
  grid: 'the Quick grid',
  sliders: 'settings and preferences',
  trash: 'delete',
  edit: 'edit (the pencil)',
  move: 'drag to reorder',
  cart: 'the shopping list',
  copy: 'duplicate',
  link: 'a link',
  tag: 'an NFC sticker (docs/NFC_TAGS.md)',
  play: 'start the timer (a filled glyph)',
  timer: 'a running timer',
  stop: 'stop — the one mark on every running timer’s stop button (a filled glyph)',
  babyface: 'a child — the child switcher’s photo row and the doodle wallpaper behind the pages',
  sun: 'day — quiet hours end, the light appearance',
  moon: 'night — quiet hours and night mode',
  drop: 'a wet diaper, outlined — a change on Reports’ day strip (a mixed one is the pile and the drop)',
  poo: 'a dirty diaper, outlined — a change on Reports’ day strip (a mixed one is the pile and the drop)',
  'drop-solid':
    'a wet diaper, solid — the count of them on Today’s report (a mixed one is the pile and the drop, touching)',
  'poo-solid':
    'a dirty diaper, solid, its tiers left open — the count of them on Today’s report (a mixed one is the pile and the drop, touching)',
  'care-vitamin':
    'a vitamin — what a care item is, on the add form and the medicine lists (a picture above 16 px)',
  'care-other':
    'anything else a household gives — a care item’s kind, on the add form and the lists (a picture above 16 px)',
  parent:
    'Parent, on setup’s first page — an adult holding a baby close (an answer to “Your role at home”)',
  caregiver:
    'Caregiver, on setup’s first page — an adult beside a small child, a heart between them',
  'tab-home-regular': 'the Today tab in the bar (the house)',
  'tab-home-active': 'the Today tab while you are on it — the same drawing with a light fill',
  'tab-schedule-regular': 'the Schedule tab in the bar (the calendar)',
  'tab-schedule-active': 'the Schedule tab while you are on it, with a light fill',
  'tab-stash-regular': 'the Stash tab in the bar (the milk bag)',
  'tab-stash-active': 'the Stash tab while you are on it, with a light fill',
  'tab-shopping-regular': 'the Shopping tab in the bar (the bag with a plus)',
  'tab-shopping-active': 'the Shopping tab while you are on it, with a light fill',
  'tab-more-regular': 'the More tab in the bar (four squares)',
  'tab-more-active': 'the More tab while you are on it, with a light fill',
};

/** The stroke width of the built-in set on its 24-unit grid (docs/DESIGN_SYSTEM.md §5). */
export const DEFAULT_STROKE = 1.7;
export const DEFAULT_GRID = 24;

/* ------------------------------------------------------------------ the names */

/**
 * Every `IconName`, read from the union in `paths.ts` rather than imported from it: this runs in
 * plain node, where a TypeScript file is text. The union is the contract the generated file is
 * typed against, so a file name that is not in it would fail `tsc` anyway — this only makes the
 * failure say which names exist.
 */
export function iconNamesFrom(pathsSource) {
  const m = /export type IconName\s*=([\s\S]*?);/.exec(pathsSource);
  if (!m) throw new IconImportError('could not find `export type IconName` in paths.ts');
  const body = m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const names = [...body.matchAll(/'([^']+)'/g)].map(x => x[1]);
  if (names.length === 0) throw new IconImportError('the IconName union is empty');
  return [...new Set(names)];
}

/** `bottle.svg` → `bottle`, or a refusal that names the nearest valid file name. */
export function iconNameForFile(fileName, names) {
  const name = fileName.replace(/\.svg$/i, '');
  if (names.includes(name)) return name;
  const near = names.find(n => n.toLowerCase() === name.toLowerCase());
  if (near) {
    throw new IconImportError(
      `"${fileName}" is not an icon name — did you mean "${near}.svg"? (names are case-sensitive)`,
      fileName,
    );
  }
  throw new IconImportError(
    `"${fileName}" is not an icon name. The file must be named after the icon it replaces, ` +
      `one of: ${names.join(', ')}`,
    fileName,
  );
}

/** Module glyphs first, then the rest as `IconName` lists them. */
export function orderedNames(names) {
  const modules = MODULE_ICON_NAMES.filter(n => names.includes(n));
  return [...modules, ...names.filter(n => !modules.includes(n))];
}

/* ------------------------------------------------------------------ numbers and paths */

const NUMBER = /[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/y;

/** Three decimals, trailing zeros dropped: enough for a 24-unit grid, readable in the file. */
export const fmt = n => {
  const r = Math.round(n * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

/** A length attribute: a plain number, `px` allowed, anything else refused. */
function length(value, what, file) {
  if (value === undefined) return undefined;
  const v = String(value).trim().replace(/px$/i, '');
  if (!/^[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?$/.test(v)) {
    throw new IconImportError(
      `${what}="${value}" is not a plain number (use user units on the 24 grid, no %, mm or em)`,
      file,
    );
  }
  return Number(v);
}

/** All the numbers in a `points` or a `viewBox` attribute. */
function numbersIn(text) {
  return (text.match(/[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g) ?? []).map(Number);
}

/** How many numbers each path command takes. */
const ARITY = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/**
 * Path data → commands, with implicit repeats made explicit (`M 1 2 3 4` is `M 1 2 L 3 4`) and
 * the arc flags read as the single characters they are (`a1 1 0 011 1` is legal SVG, and a
 * number regex would read `011` as eleven).
 */
export function parsePath(d, file) {
  const text = String(d);
  const segments = [];
  let i = 0;
  let cmd = null;
  const bad = why =>
    new IconImportError(
      `bad path data ${why} near "${text.slice(Math.max(0, i - 6), i + 14)}"`,
      file,
    );
  const skipSeparators = () => {
    while (i < text.length && /[\s,]/.test(text[i])) i += 1;
  };
  const readNumber = () => {
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(text);
    if (!m) throw bad('(expected a number)');
    i += m[0].length;
    return Number(m[0]);
  };
  const readFlag = () => {
    const c = text[i];
    if (c !== '0' && c !== '1') throw bad('(an arc flag must be 0 or 1)');
    i += 1;
    return Number(c);
  };
  for (;;) {
    skipSeparators();
    if (i >= text.length) break;
    const c = text[i];
    if (/[A-Za-z]/.test(c)) {
      if (!(c.toUpperCase() in ARITY)) throw bad(`(unknown command "${c}")`);
      cmd = c;
      i += 1;
    } else if (cmd === null) {
      throw bad('(it must start with a command letter)');
    } else if (cmd === 'Z' || cmd === 'z') {
      throw bad('(numbers after Z)');
    } else if (cmd === 'M') {
      cmd = 'L';
    } else if (cmd === 'm') {
      cmd = 'l';
    }
    const arity = ARITY[cmd.toUpperCase()];
    const args = [];
    for (let k = 0; k < arity; k += 1) {
      skipSeparators();
      args.push(arity === 7 && (k === 3 || k === 4) ? readFlag() : readNumber());
    }
    segments.push({ cmd, args });
  }
  if (segments.length === 0) throw new IconImportError('a <path> has no path data', file);
  return segments;
}

export function serializePath(segments) {
  return segments.map(s => s.cmd + s.args.map(fmt).join(' ')).join(' ');
}

/**
 * Moves a path by (dx, dy): absolute commands move, relative ones do not, and a leading `m` is
 * absolute by definition. An arc's radii, rotation and flags are untouched.
 */
export function translatePath(d, dx, dy, file) {
  const segments = parsePath(d, file);
  return serializePath(
    segments.map((s, index) => {
      const { cmd } = s;
      const args = [...s.args];
      const absolute = cmd === cmd.toUpperCase() || (index === 0 && cmd === 'm');
      if (!absolute) return s;
      switch (cmd.toUpperCase()) {
        case 'H':
          args[0] += dx;
          break;
        case 'V':
          args[0] += dy;
          break;
        case 'A':
          args[5] += dx;
          args[6] += dy;
          break;
        case 'Z':
          break;
        default:
          for (let k = 0; k < args.length; k += 2) {
            args[k] += dx;
            args[k + 1] += dy;
          }
      }
      return { cmd, args };
    }),
  );
}

/** `<polyline points>` / `<polygon points>` → path data. */
export function polyToPath(points, close, file) {
  const nums = numbersIn(String(points));
  if (nums.length < 4 || nums.length % 2 !== 0) {
    throw new IconImportError(`points="${points}" is not a list of x,y pairs`, file);
  }
  const pairs = [];
  for (let k = 0; k < nums.length; k += 2) pairs.push(`${fmt(nums[k])} ${fmt(nums[k + 1])}`);
  return `M${pairs[0]} L${pairs.slice(1).join(' ')}${close ? ' Z' : ''}`;
}

/** An ellipse (or circle) as two arcs, so opacity and non-uniform radii survive as a path. */
export function ellipseToPath(cx, cy, rx, ry) {
  return (
    `M${fmt(cx - rx)} ${fmt(cy)} A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx + rx)} ${fmt(cy)} ` +
    `A${fmt(rx)} ${fmt(ry)} 0 1 0 ${fmt(cx - rx)} ${fmt(cy)} Z`
  );
}

/** A rectangle, rounded or not, as a path — for the cases `IconElement`'s rect cannot carry. */
export function rectToPath(x, y, w, h, rx = 0, ry = rx) {
  if (rx <= 0 || ry <= 0) return `M${fmt(x)} ${fmt(y)} H${fmt(x + w)} V${fmt(y + h)} H${fmt(x)} Z`;
  const a = `A${fmt(rx)} ${fmt(ry)} 0 0 1`;
  return (
    `M${fmt(x + rx)} ${fmt(y)} H${fmt(x + w - rx)} ${a} ${fmt(x + w)} ${fmt(y + ry)} ` +
    `V${fmt(y + h - ry)} ${a} ${fmt(x + w - rx)} ${fmt(y + h)} H${fmt(x + rx)} ` +
    `${a} ${fmt(x)} ${fmt(y + h - ry)} V${fmt(y + ry)} ${a} ${fmt(x + rx)} ${fmt(y)} Z`
  );
}

/* ------------------------------------------------------------------ markup */

function stripNonMarkup(text) {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[^>[]*(?:\[[\s\S]*?\])?[^>]*>/gi, '');
}

function parseAttrs(raw) {
  const attrs = {};
  const re = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  for (const m of raw.matchAll(re)) attrs[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  return attrs;
}

/** Open, close and text tokens, tolerant of `>` inside a quoted attribute. */
function tokenize(text, file) {
  const tokens = [];
  const TAG = /<\s*(\/)?\s*([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/y;
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt < 0) {
      tokens.push({ type: 'text', text: text.slice(i) });
      break;
    }
    if (lt > i) tokens.push({ type: 'text', text: text.slice(i, lt) });
    TAG.lastIndex = lt;
    const m = TAG.exec(text);
    if (!m) {
      throw new IconImportError(
        `could not read the markup near "${text.slice(lt, lt + 40).replace(/\s+/g, ' ')}"`,
        file,
      );
    }
    const [, close, rawTag, rawAttrs] = m;
    // `svg:path` is `path`; any other prefix (inkscape:, sodipodi:) is editor metadata
    const tag = rawTag.startsWith('svg:') ? rawTag.slice(4) : rawTag;
    if (close) tokens.push({ type: 'close', tag });
    else {
      const selfClosing = /\/\s*$/.test(rawAttrs);
      tokens.push({
        type: 'open',
        tag,
        attrs: parseAttrs(selfClosing ? rawAttrs.replace(/\/\s*$/, '') : rawAttrs),
        selfClosing,
      });
    }
    i = lt + m[0].length;
  }
  return tokens;
}

/* ------------------------------------------------------------------ styles and paint */

const PRESENTATION = [
  'fill',
  'stroke',
  'stroke-width',
  'opacity',
  'fill-opacity',
  'stroke-opacity',
  'fill-rule',
  'stroke-dasharray',
  'clip-path',
  'mask',
  'filter',
  'display',
  'visibility',
];

function parseDeclarations(css) {
  const decls = {};
  for (const part of css.split(';')) {
    const colon = part.indexOf(':');
    if (colon < 0) continue;
    const prop = part.slice(0, colon).trim().toLowerCase();
    const value = part
      .slice(colon + 1)
      .replace(/!important/i, '')
      .trim();
    if (PRESENTATION.includes(prop) && value) decls[prop] = value;
  }
  return decls;
}

/**
 * The `<style>` blocks, as simple rules: `.cls-1{…}`, `#id{…}`, `path{…}` and comma lists of
 * those. A selector with a combinator or a pseudo-class is beyond what an icon needs and is
 * ignored with a note, so it can never silently repaint a shape.
 */
function parseStyles(text) {
  const rules = [];
  const notes = [];
  for (const block of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
    const css = block[1].replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const selectors = [];
      for (const raw of rule[1].split(',')) {
        const s = raw.trim();
        if (!s) continue;
        const m = /^([.#]?)([A-Za-z_][\w-]*)$/.exec(s);
        if (!m) {
          notes.push(`the CSS rule "${s}" was ignored (only .class, #id and tag rules are read)`);
          continue;
        }
        selectors.push({ kind: m[1] === '.' ? 'class' : m[1] === '#' ? 'id' : 'tag', name: m[2] });
      }
      const decls = parseDeclarations(rule[2]);
      if (selectors.length && Object.keys(decls).length) rules.push({ selectors, decls });
    }
  }
  return { rules, notes };
}

/** Presentation attributes, then the CSS rules that match, then the inline style: CSS order. */
function ownDeclarations(tag, attrs, styles) {
  const decls = {};
  for (const p of PRESENTATION) if (attrs[p] !== undefined) decls[p] = String(attrs[p]).trim();
  const classes = String(attrs.class ?? '')
    .split(/\s+/)
    .filter(Boolean);
  for (const rule of styles.rules) {
    const hit = rule.selectors.some(
      s =>
        (s.kind === 'class' && classes.includes(s.name)) ||
        (s.kind === 'id' && s.name === attrs.id) ||
        (s.kind === 'tag' && s.name === tag),
    );
    if (hit) Object.assign(decls, rule.decls);
  }
  if (attrs.style) Object.assign(decls, parseDeclarations(String(attrs.style)));
  return decls;
}

const NAMED = { black: '#000000', white: '#ffffff' };

/**
 * A paint, normalized far enough to tell "the same color written twice" from "two colors":
 * `#000`, `#000000`, `black` and `rgb(0,0,0)` are one color. Anything else is compared as text.
 */
export function normalizePaint(value) {
  if (value === undefined || value === null) return undefined;
  const v = String(value).trim();
  if (v === '' || /^inherit$/i.test(v)) return undefined;
  const lower = v.toLowerCase();
  if (lower === 'none' || lower === 'transparent') return 'none';
  if (lower === 'currentcolor') return 'currentColor';
  const url = /^url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/.exec(v);
  if (url) return { ref: url[1] };
  if (NAMED[lower]) return NAMED[lower];
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])?$/.exec(lower);
  if (short) {
    const [, r, g, b, a] = short;
    return `#${r}${r}${g}${g}${b}${b}${a && a !== 'f' ? a + a : ''}`;
  }
  const long = /^#([0-9a-f]{6})(ff)?$/.exec(lower);
  if (long) return `#${long[1]}`;
  const rgb =
    /^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)\s*(?:[,/]\s*(1|1\.0|100%))?\s*\)$/.exec(lower);
  if (rgb) {
    const hex = n =>
      Math.max(0, Math.min(255, Number(n)))
        .toString(16)
        .padStart(2, '0');
    return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`;
  }
  return lower;
}

function opacityOf(value, what, file) {
  if (value === undefined) return 1;
  const v = String(value).trim();
  const pct = /^([\d.]+)%$/.exec(v);
  const n = pct ? Number(pct[1]) / 100 : Number(v);
  if (!Number.isFinite(n)) throw new IconImportError(`${what}="${value}" is not a number`, file);
  return Math.max(0, Math.min(1, n));
}

/**
 * A `transform` that is only a move: `translate(x[,y])`, any number of them, or the identity
 * `matrix(1 0 0 1 tx ty)` Illustrator writes for one. Anything that scales, rotates or skews is
 * refused — flattening it in the editor is a click; re-deriving it here is a bug farm.
 */
export function parseTranslate(transform, file) {
  let dx = 0;
  let dy = 0;
  const text = String(transform).trim();
  if (!text) return { dx, dy };
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let consumed = 0;
  for (const m of text.matchAll(re)) {
    consumed += m[0].length;
    const fn = m[1].toLowerCase();
    const args = numbersIn(m[2]);
    if (fn === 'translate' && (args.length === 1 || args.length === 2)) {
      dx += args[0];
      dy += args[1] ?? 0;
    } else if (
      fn === 'matrix' &&
      args.length === 6 &&
      args[0] === 1 &&
      args[1] === 0 &&
      args[2] === 0 &&
      args[3] === 1
    ) {
      dx += args[4];
      dy += args[5];
    } else {
      throw new IconImportError(
        `transform="${text}" is more than a move — only translate() is supported. ` +
          'Flatten transforms in your editor before exporting (Illustrator: Object → Expand; ' +
          'Inkscape: Edit → Preferences → Transforms → "Store transformation: optimized"; ' +
          'Figma: flatten the layer).',
        file,
      );
    }
  }
  if (consumed === 0 || text.replace(re, '').trim() !== '') {
    throw new IconImportError(`transform="${text}" could not be read`, file);
  }
  return { dx, dy };
}

/* ------------------------------------------------------------------ the conversion */

const SHAPES = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon']);
const GROUPS = new Set(['g', 'a', 'switch']);
const SILENT = new Set(['title', 'desc', 'metadata', 'style', 'defs', 'symbol', 'marker']);
const DEFS_KINDS = new Set([
  'linearGradient',
  'radialGradient',
  'pattern',
  'mask',
  'filter',
  'clipPath',
]);
const REFUSED = {
  text: 'contains text — convert the text to outlines (paths) in your editor before exporting',
  tspan: 'contains text — convert the text to outlines (paths) in your editor before exporting',
  textPath: 'contains text — convert the text to outlines (paths) in your editor before exporting',
  image: 'contains an embedded picture — an icon is vector shapes only, no raster',
  use: 'uses <use> — expand or flatten the symbols so every shape is in the file',
  foreignObject: 'contains HTML (<foreignObject>) — an icon is vector shapes only',
};

/**
 * Where every `url(#id)` reference would land, read up front: a shape's `fill="url(#g)"` is a
 * gradient only if `g` is one, and a `clip-path` is harmless only when what it clips to is the
 * whole frame — the clip Figma puts around every export.
 */
function indexDefs(text) {
  const kinds = {};
  for (const m of text.matchAll(
    /<\s*(linearGradient|radialGradient|pattern|mask|filter|clipPath|symbol|marker)\b([^>]*)>/g,
  )) {
    const id = /\bid\s*=\s*["']([^"']+)["']/.exec(m[2]);
    if (id) kinds[id[1]] = m[1];
  }
  const clips = {};
  for (const m of text.matchAll(/<\s*clipPath\b([^>]*)>([\s\S]*?)<\/\s*clipPath\s*>/g)) {
    const id = /\bid\s*=\s*["']([^"']+)["']/.exec(m[1]);
    if (id) clips[id[1]] = m[2];
  }
  return { kinds, clips };
}

function clipCoversFrame(inner, frame) {
  const shapes = [...inner.matchAll(/<\s*([A-Za-z]+)\b([^>]*)>/g)].filter(m => SHAPES.has(m[1]));
  if (shapes.length !== 1 || shapes[0][1] !== 'rect') return false;
  const a = parseAttrs(shapes[0][2]);
  const x = Number(a.x ?? 0);
  const y = Number(a.y ?? 0);
  const w = Number(a.width);
  const h = Number(a.height);
  return x <= frame.x && y <= frame.y && x + w >= frame.x + frame.w && y + h >= frame.y + frame.h;
}

/**
 * One SVG file → `{ def, notes, summary }`, or an `IconImportError` that says what to change.
 * `def` has the exact shape of an `ICON_PATHS` entry.
 */
export function parseSvg(svgText, file) {
  const text = stripNonMarkup(String(svgText));
  const styles = parseStyles(text);
  const notes = [...styles.notes];
  const defs = indexDefs(text);
  const tokens = tokenize(text, file);

  let frame = null; // { x, y, w, h }
  let viewBox = null;
  const shapes = [];
  const stack = [];
  let skipDepth = 0;

  const refuseRefs = (decls, tag) => {
    for (const prop of ['fill', 'stroke']) {
      const paint = normalizePaint(decls[prop]);
      if (paint && typeof paint === 'object') {
        const kind = defs.kinds[paint.ref];
        const what =
          kind === 'linearGradient' || kind === 'radialGradient'
            ? 'a gradient'
            : kind === 'pattern'
              ? 'a pattern'
              : `a reference (#${paint.ref})`;
        throw new IconImportError(
          `a <${tag}> is painted with ${what} (${prop}="${decls[prop]}") — an icon is one flat color`,
          file,
        );
      }
    }
    if (decls.filter && decls.filter !== 'none') {
      throw new IconImportError(
        `a <${tag}> has an effect (filter="${decls.filter}") — remove shadows, blurs and other effects`,
        file,
      );
    }
    if (decls.mask && decls.mask !== 'none') {
      throw new IconImportError(
        `a <${tag}> uses a mask — flatten the mask into plain shapes`,
        file,
      );
    }
    if (decls['clip-path'] && decls['clip-path'] !== 'none') {
      const ref = /url\(\s*['"]?#([^'")\s]+)/.exec(decls['clip-path']);
      const inner = ref ? defs.clips[ref[1]] : undefined;
      if (!(inner !== undefined && frame && clipCoversFrame(inner, frame))) {
        throw new IconImportError(
          `a <${tag}> uses a clipping mask (clip-path="${decls['clip-path']}") that is not the whole frame — flatten it into plain shapes`,
          file,
        );
      }
    }
  };

  const inherited = () => stack[stack.length - 1];

  for (let t = 0; t < tokens.length; t += 1) {
    const token = tokens[t];
    if (skipDepth > 0) {
      if (token.type === 'open' && !token.selfClosing) skipDepth += 1;
      else if (token.type === 'close') skipDepth -= 1;
      continue;
    }
    if (token.type === 'text') continue;
    if (token.type === 'close') {
      if (stack.length && stack[stack.length - 1].tag === token.tag) stack.pop();
      continue;
    }

    const { tag, attrs, selfClosing } = token;
    const skip = () => {
      if (!selfClosing) skipDepth = 1;
    };

    if (tag in REFUSED) throw new IconImportError(REFUSED[tag], file);
    if (SILENT.has(tag) || DEFS_KINDS.has(tag)) {
      skip();
      continue;
    }
    if (tag.includes(':')) {
      skip();
      continue;
    }

    if (tag === 'svg' && frame === null) {
      const box = attrs.viewBox !== undefined ? numbersIn(attrs.viewBox) : null;
      if (box && box.length === 4 && box[2] > 0 && box[3] > 0) {
        frame = { x: box[0], y: box[1], w: box[2], h: box[3] };
      } else if (attrs.width !== undefined && attrs.height !== undefined) {
        const w = length(attrs.width, 'width', file);
        const h = length(attrs.height, 'height', file);
        frame = { x: 0, y: 0, w, h };
        notes.push(`no viewBox — using width and height (${w}×${h})`);
      } else {
        throw new IconImportError('the <svg> has no viewBox (expected viewBox="0 0 24 24")', file);
      }
      viewBox = `${fmt(frame.x)} ${fmt(frame.y)} ${fmt(frame.w)} ${fmt(frame.h)}`;
      if (viewBox !== `0 0 ${DEFAULT_GRID} ${DEFAULT_GRID}`) {
        notes.push(
          `viewBox is "${viewBox}", not "0 0 24 24" — it will be scaled to fit; draw on the 24 grid to match the built-in set`,
        );
      }
      const decls = ownDeclarations(tag, attrs, styles);
      stack.push({
        tag,
        fill: normalizePaint(decls.fill) ?? '#000000',
        stroke: normalizePaint(decls.stroke) ?? 'none',
        strokeWidth: length(decls['stroke-width'], 'stroke-width', file),
        fillRule: decls['fill-rule'],
        fillOpacity: opacityOf(decls['fill-opacity'], 'fill-opacity', file),
        strokeOpacity: opacityOf(decls['stroke-opacity'], 'stroke-opacity', file),
        opacity: opacityOf(decls.opacity, 'opacity', file),
        dx: 0,
        dy: 0,
      });
      continue;
    }
    if (frame === null) {
      throw new IconImportError('not an SVG file (no <svg> root before the first shape)', file);
    }

    const parent = inherited();
    const decls = ownDeclarations(tag, attrs, styles);
    if (decls.display === 'none' || decls.visibility === 'hidden') {
      notes.push(`a hidden <${tag}> was skipped`);
      skip();
      continue;
    }
    refuseRefs(decls, tag);
    const move =
      attrs.transform !== undefined ? parseTranslate(attrs.transform, file) : { dx: 0, dy: 0 };
    const paint = {
      tag,
      fill: normalizePaint(decls.fill) ?? parent.fill,
      stroke: normalizePaint(decls.stroke) ?? parent.stroke,
      strokeWidth: length(decls['stroke-width'], 'stroke-width', file) ?? parent.strokeWidth,
      fillRule: decls['fill-rule'] ?? parent.fillRule,
      fillOpacity: opacityOf(decls['fill-opacity'], 'fill-opacity', file) * parent.fillOpacity,
      strokeOpacity:
        opacityOf(decls['stroke-opacity'], 'stroke-opacity', file) * parent.strokeOpacity,
      opacity: opacityOf(decls.opacity, 'opacity', file) * parent.opacity,
      dx: parent.dx + move.dx,
      dy: parent.dy + move.dy,
    };

    if (GROUPS.has(tag) || tag === 'svg') {
      if (tag === 'svg') notes.push('a nested <svg> was read as a group');
      if (selfClosing) continue;
      stack.push(paint);
      continue;
    }

    if (!SHAPES.has(tag)) {
      notes.push(`<${tag}> is not a shape and was skipped`);
      skip();
      continue;
    }

    // a shape's own content (a <title>, an <animate>) is never drawn
    skip();

    const strokeOn = paint.stroke !== 'none' && (paint.strokeWidth ?? 1) > 0;
    const fillOn = paint.fill !== 'none' && tag !== 'line' && tag !== 'polyline';
    if (!strokeOn && !fillOn) {
      notes.push(`a <${tag}> with no fill and no stroke was skipped (it is invisible)`);
      continue;
    }
    if (decls['stroke-dasharray'] && decls['stroke-dasharray'] !== 'none') {
      notes.push(`a dashed stroke on a <${tag}> will draw solid (dashes are not supported)`);
    }
    if (fillOn && /evenodd/i.test(paint.fillRule ?? '')) {
      notes.push(
        `fill-rule="evenodd" on a <${tag}> is dropped — if a hole in this icon renders filled, reverse the direction of the inner shape`,
      );
    }

    const strength = v => Math.round(v * 100) / 100;
    /*
      A TINTED SHAPE — a fill fainter than its own outline, the "selected" look of the owner's
      tab icons (2026-09-23: `fill="currentColor" fill-opacity="0.16"` under a full stroke). An
      element here paints its fill and its stroke at ONE opacity, so this used to take the
      stronger of the two and draw the tint as a solid fill, burying every line inside it. It is
      drawn as two elements instead: the tint, a filled copy at the fill's strength, and over it
      the outline at the stroke's, which covers the tint's own faint stroke exactly because it is
      the same geometry at the same width.
    */
    const tinted = fillOn && strokeOn && paint.fillOpacity < paint.strokeOpacity;
    let opacity = paint.opacity;
    if (fillOn && !strokeOn) opacity *= paint.fillOpacity;
    else if (strokeOn && (!fillOn || tinted)) opacity *= paint.strokeOpacity;
    else opacity *= Math.max(paint.fillOpacity, paint.strokeOpacity);
    opacity = strength(opacity);

    const { dx, dy } = paint;
    const n = (attr, what, fallback) => {
      const v = length(attrs[attr], what ?? attr, file);
      if (v === undefined) {
        if (fallback === undefined) {
          throw new IconImportError(`a <${tag}> is missing its ${attr}`, file);
        }
        return fallback;
      }
      return v;
    };

    /** The element for this shape; a faded one is always a path, the one kind with an opacity. */
    const draw = faded => {
      let element;
      switch (tag) {
        case 'path': {
          if (attrs.d === undefined || String(attrs.d).trim() === '') {
            throw new IconImportError('a <path> has no path data (d)', file);
          }
          let d;
          if (dx === 0 && dy === 0) {
            // the owner's own path data, kept verbatim (whitespace collapsed) once it parses
            parsePath(attrs.d, file);
            d = String(attrs.d).replace(/\s+/g, ' ').trim();
          } else {
            d = translatePath(attrs.d, dx, dy, file);
          }
          element = { type: 'path', d };
          break;
        }
        case 'circle': {
          const cx = n('cx', 'cx', 0) + dx;
          const cy = n('cy', 'cy', 0) + dy;
          const r = n('r');
          element = faded
            ? { type: 'path', d: ellipseToPath(cx, cy, r, r) }
            : { type: 'circle', cx: round(cx), cy: round(cy), r: round(r) };
          break;
        }
        case 'ellipse': {
          const cx = n('cx', 'cx', 0) + dx;
          const cy = n('cy', 'cy', 0) + dy;
          element = { type: 'path', d: ellipseToPath(cx, cy, n('rx'), n('ry')) };
          break;
        }
        case 'rect': {
          const x = n('x', 'x', 0) + dx;
          const y = n('y', 'y', 0) + dy;
          const w = n('width');
          const h = n('height');
          const rx = length(attrs.rx, 'rx', file);
          const ry = length(attrs.ry, 'ry', file);
          const cornerX = rx ?? ry ?? 0;
          const cornerY = ry ?? rx ?? 0;
          element =
            faded || cornerX !== cornerY
              ? { type: 'path', d: rectToPath(x, y, w, h, cornerX, cornerY) }
              : {
                  type: 'rect',
                  x: round(x),
                  y: round(y),
                  width: round(w),
                  height: round(h),
                  ...(cornerX > 0 ? { rx: round(cornerX) } : {}),
                };
          break;
        }
        case 'line': {
          const x1 = n('x1', 'x1', 0) + dx;
          const y1 = n('y1', 'y1', 0) + dy;
          const x2 = n('x2', 'x2', 0) + dx;
          const y2 = n('y2', 'y2', 0) + dy;
          element = faded
            ? { type: 'path', d: `M${fmt(x1)} ${fmt(y1)} L${fmt(x2)} ${fmt(y2)}` }
            : { type: 'line', x1: round(x1), y1: round(y1), x2: round(x2), y2: round(y2) };
          break;
        }
        case 'polyline':
        case 'polygon': {
          if (attrs.points === undefined)
            throw new IconImportError(`a <${tag}> has no points`, file);
          const d = polyToPath(attrs.points, tag === 'polygon', file);
          element = { type: 'path', d: dx === 0 && dy === 0 ? d : translatePath(d, dx, dy, file) };
          break;
        }
        default:
          return null;
      }
      return element;
    };

    const shape = (element, fill) => ({
      element,
      fillOn: fill,
      strokeOn,
      fill: paint.fill,
      stroke: paint.stroke,
      strokeWidth: paint.strokeWidth,
    });
    const element = draw(opacity < 1);
    if (element === null) continue;
    if (opacity < 1 && element.type === 'path') element.opacity = opacity;
    if (tinted) {
      const tint = draw(true);
      tint.opacity = strength(paint.opacity * paint.fillOpacity);
      shapes.push(shape(tint, true));
      // the outline over it carries no fill: the tint below is the whole of the shape's fill
      shapes.push(shape(element, false));
      continue;
    }
    shapes.push(shape(element, fillOn));
  }

  if (frame === null) throw new IconImportError('not an SVG file (no <svg> root)', file);
  if (shapes.length === 0) throw new IconImportError('no shapes found — nothing to draw', file);
  const referenced = new Set([...text.matchAll(/url\(\s*['"]?#([^'")\s]+)/g)].map(m => m[1]));
  for (const [id, kind] of Object.entries(defs.kinds)) {
    if (/Gradient$/.test(kind) && !referenced.has(id)) {
      notes.push(`the gradient "${id}" is defined but never used; it was ignored`);
    }
  }

  // ONE COLOR, OR TWO TONES OF IT. Whatever is painted becomes the runtime ink, so no drawn
  // color survives as itself — but a second, LIGHTER color survives as the secondary tone (the
  // owner, 2026-09-19: "I want to have a two tone color for each module icon"): the darker of
  // the two is the primary and is painted in the text or category color, the lighter is painted
  // in that same color at half strength (`ICON_SECONDARY_ALPHA` in Icon.tsx). Three colors is a
  // picture rather than a glyph and is refused. So is white as a tone: a white shape "cutting
  // out" part of a black one — what a second color used to mean — would become a pale blob of
  // the same ink, and no real detail tone is pure white.
  const colors = new Set();
  for (const s of shapes) {
    if (s.fillOn && s.fill !== 'currentColor') colors.add(s.fill);
    if (s.strokeOn && s.stroke !== 'currentColor') colors.add(s.stroke);
  }
  if (colors.size > 2) {
    throw new IconImportError(
      `uses ${colors.size} colors (${[...colors].join(', ')}). An icon is ONE color, or TWO tones ` +
        'of it: the darker is painted in the text or category color at runtime and the lighter in ' +
        'the same color at half strength. Merge the extra colors into those two, or set their fill ' +
        'or stroke to none.',
      file,
    );
  }
  let secondary;
  if (colors.size === 2) {
    const [a, b] = [...colors];
    const la = hexLuminance(a);
    const lb = hexLuminance(b);
    if (la === null || lb === null) {
      throw new IconImportError(
        `uses two colors (${a}, ${b}) and one of them is not a hex color — write both as #rrggbb ` +
          'so the tool can tell which is the lighter tone',
        file,
      );
    }
    if (la === lb) {
      throw new IconImportError(
        `uses two colors of the same lightness (${a}, ${b}) — the second tone must be the LIGHTER ` +
          'one, so the tool can tell which is the main ink',
        file,
      );
    }
    secondary = la > lb ? a : b;
    const primary = secondary === a ? b : a;
    if (secondary === '#ffffff') {
      throw new IconImportError(
        `uses white (#ffffff) as its lighter tone — a white shape cannot "cut out" part of ` +
          'another; at runtime it would be the same ink at half strength. Remove it, or draw the ' +
          'detail in a lighter shade of the main color instead.',
        file,
      );
    }
    notes.push(`two tones: ${primary} is the main ink, ${secondary} the lighter detail tone`);
  }
  const secondaryFill = s => s.fillOn && secondary !== undefined && s.fill === secondary;
  const secondaryStroke = s => s.strokeOn && secondary !== undefined && s.stroke === secondary;
  const primary = [...colors].find(c => c !== secondary);

  const anyStroke = shapes.some(s => s.strokeOn);
  const gridScale = Math.min(frame.w, frame.h) / DEFAULT_GRID;
  let def;
  if (anyStroke) {
    const widths = shapes
      .filter(s => s.strokeOn && s.strokeWidth !== undefined)
      .map(s => s.strokeWidth);
    let strokeWidth;
    if (widths.length === 0) {
      strokeWidth = gridScale === 1 ? undefined : round(DEFAULT_STROKE * gridScale);
      notes.push(
        `no stroke-width in the file — the app's ${fmt(DEFAULT_STROKE * gridScale)} will be used`,
      );
    } else {
      const counts = new Map();
      for (const w of widths) counts.set(w, (counts.get(w) ?? 0) + 1);
      strokeWidth = round([...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]);
      if (counts.size > 1) {
        notes.push(
          `strokes of different widths (${[...counts.keys()].map(fmt).join(', ')}) — an icon has one stroke width; ${fmt(strokeWidth)} is used for all of them`,
        );
      }
    }
    def = {
      viewBox,
      fill: 'none',
      ...(strokeWidth !== undefined ? { strokeWidth } : {}),
      elements: shapes.map(s => ({
        ...s.element,
        // a filled shape inside a stroke icon names its tone; a plain line has no fill at all
        ...(s.fillOn && s.element.type !== 'line'
          ? { fill: secondaryFill(s) ? 'secondaryColor' : 'currentColor' }
          : {}),
        ...(secondaryStroke(s) ? { tone: 'secondary' } : {}),
      })),
    };
  } else {
    def = {
      viewBox,
      fill: 'currentColor',
      elements: shapes.map(s =>
        secondaryFill(s) ? { ...s.element, fill: 'secondaryColor' } : s.element,
      ),
    };
  }
  return {
    def,
    notes,
    summary: {
      mode: anyStroke ? 'stroke' : 'filled',
      strokeWidth: def.strokeWidth ?? (anyStroke ? DEFAULT_STROKE : undefined),
      shapes: shapes.length,
      viewBox,
      tones: secondary === undefined ? 1 : 2,
      ...(secondary !== undefined ? { primary, secondary } : {}),
    },
  };
}

const round = n => Math.round(n * 1000) / 1000;

/**
 * Relative luminance of a `#rrggbb`, or null for anything else. Only used to tell the LIGHTER of
 * two tones from the darker, so the sRGB curve is the whole of the arithmetic — nothing here is
 * a contrast claim.
 */
function hexLuminance(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex));
  if (!m) return null;
  const lin = c => {
    const s = parseInt(c, 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
}

/* ------------------------------------------------------------------ rendering */

const IDENT = /^[A-Za-z_$][\w$]*$/;
const q = s => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const key = k => (IDENT.test(k) ? k : q(k));

function literal(value) {
  if (Array.isArray(value)) return `[${value.map(literal).join(', ')}]`;
  if (value && typeof value === 'object') {
    return `{ ${Object.entries(value)
      .map(([k, v]) => `${key(k)}: ${literal(v)}`)
      .join(', ')} }`;
  }
  if (typeof value === 'string') return q(value);
  return String(value);
}

/**
 * The generated module, before prettier. `entries` is `[{ name, file, def }]` in the order the
 * files were read; with none it exports an empty object and says so.
 */
export function renderCustomPaths(entries) {
  const sources = entries.length
    ? entries.map(e => `\`${e.file}\``).join(', ')
    : 'none yet — the folder holds no SVG';
  const body = entries.length
    ? `{\n${entries.map(e => `  ${key(e.name)}: ${literal(e.def)},`).join('\n')}\n}`
    : '{}';
  return `/**
 * GENERATED by tools/ui/import-icons.mjs from assets/brand/kit/08-icons — do not edit by hand.
 *
 * The owner's own glyphs, one per SVG file, each replacing the built-in glyph of the same name in
 * every screen: Icon.tsx reads this table before ICON_PATHS. A name with no file here keeps the
 * built-in drawing, so the set can be replaced one icon at a time. To change one: put the SVG in
 * the folder (its README says how) and run \`node tools/ui/import-icons.mjs\`; \`pnpm check:icons\`
 * fails the build when this file is stale.
 *
 * Sources: ${sources}
 */
import type { IconDef, IconName } from './paths';

export const CUSTOM_ICON_PATHS: Partial<Record<IconName, IconDef>> = ${body};
`;
}

export const README_START = '<!-- icon-names:start';
export const README_END = '<!-- icon-names:end -->';

/** The table of file names in the drop folder's README, between its two markers. */
export function renderReadmeBlock(names, present = []) {
  const rows = orderedNames(names).map(name => {
    const note = ICON_NOTES[name] ?? '—';
    const state = present.includes(name) ? 'yours' : 'built-in';
    return `| \`${name}.svg\` | ${note} | ${state} |`;
  });
  return [
    `${README_START} — generated by tools/ui/import-icons.mjs from the IconName list in packages/ui/src/icons/paths.ts; do not edit between the markers -->`,
    '',
    '| File name | What it draws | Currently |',
    '| --- | --- | --- |',
    ...rows,
    '',
    README_END,
  ].join('\n');
}

/** The README with its generated block replaced; refuses a README that has lost its markers. */
export function spliceReadme(readme, block) {
  const text = String(readme).replace(/\r\n/g, '\n');
  const start = text.indexOf(README_START);
  const end = text.indexOf(README_END);
  if (start < 0 || end < 0 || end < start) {
    throw new IconImportError(
      `the README has lost its "${README_START}" / "${README_END}" markers — restore them from git`,
    );
  }
  return text.slice(0, start) + block + text.slice(end + README_END.length);
}
