// Metro turns an image import into an asset id; the app's tsconfig pins `types` to node, so
// the module shape is declared here rather than pulled from expo/types.
declare module '*.png' {
  const source: number;
  export default source;
}

// The card backgrounds ship as JPEG (`render-card-art.mjs` says why). There is no `*.webp` here on
// purpose: the stash summary's WebP drew nothing on an iPhone (2026-10-01), so an import of one is
// a type error before it is a blank card.
declare module '*.jpg' {
  const source: number;
  export default source;
}

// The mono faces ship from the app's own folder, cut to what it sets (`tools/ui/subset-mono-fonts.py`).
declare module '*.ttf' {
  const source: number;
  export default source;
}
