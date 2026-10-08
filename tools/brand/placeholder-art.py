"""
PLACEHOLDER ARTWORK for NibbleCue, until the designer's kit arrives.

The owner, 2026-10-08: "you can generate simple temporary icons that i will redesign later once we
know clearly what it's for." So this draws the simplest honest stand-in: a bowl with a spoon, in
the app's default scheme (Leaf, green), nothing traced from CuddleCue's logo. Every file it writes
carries `placeholder` in its name (CuddleCue CLAUDE.md §7: no placeholder asset without the word
in its filename), and brand.test.ts holds that.

    python3 tools/brand/placeholder-art.py <path to a bold .ttf for the wordmark>
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[2] / 'packages' / 'brand' / 'brand'
GREEN = (58, 125, 24, 255)     # Leaf g1 (#3A7D18): white clears 4.5:1 on it
GREEN2 = (36, 96, 15, 255)     # Leaf g2 (#24600F)
CREAM = (246, 243, 236, 255)    # the paper ground (#F6F3EC)
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)


def bowl(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float, ink, rim) -> None:
    """A bowl (lower half disc on a rim) with a spoon leaning in: scaled to radius r."""
    # spoon: a handle and an oval head, behind the bowl
    w = r * 0.12
    draw.line([(cx + r * 0.15, cy - r * 0.05), (cx + r * 0.85, cy - r * 0.95)], fill=ink, width=int(w))
    draw.ellipse([cx + r * 0.62, cy - r * 1.25, cx + r * 1.02, cy - r * 0.78], fill=ink)
    # bowl body
    draw.pieslice([cx - r, cy - r * 0.9, cx + r, cy + r * 1.1], 0, 180, fill=ink)
    # rim
    draw.rounded_rectangle([cx - r * 1.08, cy + r * 0.02, cx + r * 1.08, cy + r * 0.2], radius=r * 0.09, fill=rim)


def icon(size: int, background, ink, rim, scale: float) -> Image.Image:
    img = Image.new('RGBA', (size, size), background)
    d = ImageDraw.Draw(img)
    bowl(d, size * 0.47, size * 0.5, size * scale, ink, rim)
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    font_path = sys.argv[1] if len(sys.argv) > 1 else None
    # the store icon: opaque, unrounded (iOS applies the mask)
    icon(1024, GREEN, WHITE, CREAM, 0.30).save(OUT / 'app-icon-1024-placeholder.png')
    # Android adaptive: the glyph inside the 66 dp safe zone (about 61% of 432 px)
    icon(432, CLEAR, WHITE, CREAM, 0.17).save(OUT / 'adaptive-foreground-placeholder.png')
    Image.new('RGBA', (432, 432), GREEN).save(OUT / 'adaptive-background-placeholder.png')
    icon(432, CLEAR, WHITE, WHITE, 0.17).save(OUT / 'adaptive-monochrome-placeholder.png')
    icon(96, CLEAR, WHITE, WHITE, 0.30).save(OUT / 'notification-icon-placeholder.png')
    # the mark: the glyph in the brand orange on transparent
    icon(1024, CLEAR, GREEN, GREEN2, 0.30).save(OUT / 'mark-1024-placeholder.png')
    icon(512, CLEAR, GREEN, GREEN2, 0.30).save(OUT / 'mark-placeholder.png')
    # the wordmark: the name in the UI face, in the brand orange
    if font_path:
        font = ImageFont.truetype(font_path, 150)
        text = 'NibbleCue'
        bbox = font.getbbox(text)
        w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        img = Image.new('RGBA', (768, 192), CLEAR)
        d = ImageDraw.Draw(img)
        scale = min(740 / w, 170 / h)
        font = ImageFont.truetype(font_path, int(150 * scale))
        bbox = font.getbbox(text)
        w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        d.text(((768 - w) / 2 - bbox[0], (192 - h) / 2 - bbox[1]), text, font=font, fill=GREEN)
        img.save(OUT / 'wordmark-placeholder.png')


if __name__ == '__main__':
    main()
