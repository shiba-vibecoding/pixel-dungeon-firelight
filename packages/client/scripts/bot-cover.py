"""
The Mini App's picture for the bot's menu (BotFather > Edit Bot > Edit Mini App), 640x360,
as the design system draws it (PD.share.cover): a sewer floor, our logo three times over,
the four heroes, and a line of text in Galmuri with a pixel outline.

    python packages/client/scripts/bot-cover.py [tagline]

Writes docs/design/bot-cover-640x360.png. Needs Pillow and fontTools (with brotli, for woff2).
"""
import io
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[3]
ASSETS = ROOT / 'packages/client/public/assets'
FONTS = ROOT / 'packages/client/public/fonts'
OUT = ROOT / 'docs/design/bot-cover-640x360.png'
W, H = 640, 360


def font(size: int) -> ImageFont.FreeTypeFont:
    """Galmuri11 from its woff2, at a whole multiple of its 12-pixel grid."""
    ttf = TTFont(FONTS / 'Galmuri11.woff2')
    ttf.flavor = None
    buffer = io.BytesIO()
    ttf.save(buffer)
    buffer.seek(0)
    return ImageFont.truetype(buffer, size)


def floor(image: Image.Image, tiles: Image.Image, scale: int, seed: int) -> None:
    """The design's floor: walls along the edges and every seventh column, a seeded scatter of grass and decor."""
    size = 16 * scale
    r = seed

    def rnd() -> float:
        nonlocal r
        r = (r * 9301 + 49297) % 233280
        return r / 233280

    rows, cols = -(-H // size), -(-W // size)
    for y in range(rows):
        for x in range(cols):
            wall = y == 0 or y == rows - 1 or (x % 7 == 0 and y % 3 != 1)
            tile = (12 if rnd() < .15 else 4) if wall else (2 if rnd() < .2 else 24 if rnd() < .08 else 1)
            cell = tiles.crop(((tile % 16) * 16, (tile // 16) * 16, (tile % 16) * 16 + 16, (tile // 16) * 16 + 16))
            image.paste(cell.resize((size, size), Image.NEAREST), (x * size, y * size))


def shade(image: Image.Image, box: tuple[int, int, int, int], alpha: float) -> None:
    layer = Image.new('RGBA', image.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).rectangle(box, fill=(11, 11, 9, round(alpha * 255)))
    image.alpha_composite(layer)


def text(image: Image.Image, line: str, cx: int, baseline: int, size: int, pixel: int, color: str) -> None:
    """Centred text, crisp, outlined with eight copies a font pixel off, as PD.fx.text draws it."""
    draw = ImageDraw.Draw(image)
    draw.fontmode = '1'
    face = font(size)
    width = draw.textlength(line, font=face)
    x, y = round(cx - width / 2), baseline - size
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            if dx or dy:
                draw.text((x + dx * pixel, y + dy * pixel), line, font=face, fill='#0b0b09')
    draw.text((x, y), line, font=face, fill=color)


def main() -> None:
    tagline = sys.argv[1] if len(sys.argv) > 1 else 'Кооперативный рогалик'
    tiles = Image.open(ASSETS / 'tiles0.png').convert('RGBA')
    avatars = Image.open(ASSETS / 'avatars.png').convert('RGBA')
    logo = Image.open(ASSETS / 'banner-title.png').convert('RGBA')
    image = Image.new('RGBA', (W, H), '#0b0b09')
    floor(image, tiles, 3, 5)
    shade(image, (0, 0, W, H), 0.6)
    shade(image, (0, 56, W, 288), 0.55)
    # Our logo already says TELEGRAM.
    big = logo.resize((logo.width * 3, logo.height * 3), Image.NEAREST)
    image.alpha_composite(big, (W // 2 - big.width // 2, 62))
    for i in range(4):
        hero = avatars.crop((i * 24, 0, i * 24 + 24, 32)).resize((72, 96), Image.NEAREST)
        x = 24 + i * 60 if i < 2 else W - 24 - 72 - (3 - i) * 60
        image.alpha_composite(hero, (x, H - 132))
    text(image, tagline, W // 2, H - 28, 24, 2, '#e8e2c8')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    image.convert('RGB').save(OUT)
    print(OUT)


if __name__ == '__main__':
    main()
