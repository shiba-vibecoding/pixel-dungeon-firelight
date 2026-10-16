# Part 1 · Telegram and GitHub art: welcome (PNG + GIF), link preview, channel pin, README header, social preview, badges.
import os, math, random, numpy as np
from PIL import Image, ImageDraw, ImageFont
from fl_scene import scene
from brand import lockup, campfire, spark_px, FIRE, i_cols
OUT = '/home/claude/firelight/p1/out/'
TG, GH = OUT + 'docs/telegram/', OUT + 'docs/github/'
G11 = '/home/claude/firelight/p1/Galmuri11.ttf'
F = lambda n: ImageFont.truetype(G11, n)
INK, MUTED, GOLD, VOID = '#e8e2c8', '#b0b5a3', '#ffeba4', '#0b0b09'
HEROES = ['mage', 'warrior', 'rogue', 'ranger']
POS4 = [(-25, 1), (-13, -2), (13, -2), (25, 1)]
def up(im, k): return im.resize((im.width * k, im.height * k), Image.NEAREST)
def text(d, xy, s, font, fill, sh=None):
    d.fontmode = '1'; sh = sh or max(1, font.size // 12)
    d.text((xy[0], xy[1] + sh), s, font=font, fill=VOID); d.text(xy, s, font=font, fill=fill)

# ---------------------------------------------------------------- badges (x2 pixels, 68 px tall, README shows them at 44)
def badge(label, fill, hi, lo, color, icon=None):
    f = F(36); tw = int(f.getlength(label)); iw = icon.width + 14 if icon else 0
    W = tw + iw + 44; H = 68
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rectangle((0, 0, W - 1, H - 1), fill=(20, 21, 15, 255))
    d.rectangle((2, 2, W - 3, H - 3), fill=fill); d.rectangle((2, 2, W - 3, 5), fill=hi); d.rectangle((2, H - 8, W - 3, H - 3), fill=lo)
    for (x, y) in [(0, 0), (W - 2, 0), (0, H - 2), (W - 2, H - 2)]: d.rectangle((x, y, x + 1, y + 1), fill=(0, 0, 0, 0))
    x = 22
    if icon: im.alpha_composite(icon, (x, (H - 2 - icon.height) // 2)); x += iw
    text(d, (x, 12), label, f, color, sh=3)
    return im
PLANE = ['..........##', '.......####.', '....######..', '.#########..', '..#######...', '....#.##....', '....##.#....', '.....#......']
def plane(col=(255, 235, 164)):
    a = np.zeros((len(PLANE), len(PLANE[0]), 4), np.uint8)
    for y, r in enumerate(PLANE):
        for x, c in enumerate(r):
            if c == '#': a[y, x] = (*col, 255)
    return up(Image.fromarray(a), 3)
ITEMS = Image.open('/home/claude/pdf/packages/client/public/assets/items.png').convert('RGBA')
cell = lambda i: ITEMS.crop(((i % 8) * 16, (i // 8) * 16, (i % 8) * 16 + 16, (i // 8) * 16 + 16))
FORK = ['.###...###.', '#...#.#...#', '#...#.#...#', '.###...###.', '..#.....#..', '..#.....#..', '...#...#...', '....#.#....', '.....#.....', '....###....', '...#...#...', '...#...#...', '....###....']
def fork_icon(col=(232, 226, 200)):
    a = np.zeros((len(FORK), 11, 4), np.uint8)
    for y, r in enumerate(FORK):
        for x, c in enumerate(r.ljust(11, '.')):
            if c == '#': a[y, x] = (*col, 255)
    return up(Image.fromarray(a), 3)
SWORD = fork_icon()
HOUR = up(cell(25) if False else cell(18), 2)
BADGES = {
    'play': ({'ru': 'Играть в Telegram', 'en': 'Play in Telegram'}, ((178, 42, 42), (219, 79, 53), (134, 28, 45), GOLD), up(campfire(), 2)),
    'fork': ({'ru': 'Форк Pixel Dungeon', 'en': 'Pixel Dungeon fork'}, ((59, 62, 54), (122, 129, 115), (40, 42, 36), INK), SWORD),
    'gpl': ({'ru': 'GPL-3.0', 'en': 'GPL-3.0'}, ((59, 62, 54), (122, 129, 115), (40, 42, 36), INK), None),
    'daily': ({'ru': 'Подземелье дня', 'en': 'Daily dungeon'}, ((110, 22, 26), (178, 42, 42), (58, 10, 14), '#ffcc66'), None),
}
for k, (labels, (fill, hi, lo, col), ic) in BADGES.items():
    for lang in ('ru', 'en'):
        badge(labels[lang], fill, hi, lo, col, ic).save(GH + f'badge-{k}-{lang}.png', optimize=True)

# ---------------------------------------------------------------- scenes
def social(lang, kind):
    """1280x640 at x6: the logo on the night sky over the hill, the four heroes round the fire at the dungeon door."""
    art, _ = scene(214, 107, cx=156, gh=20, moon=(198, 6), heroes=HEROES, pos=POS4, stones=[(.05, .4), (.4, .8), (.97, .5)], hide_src_moon=True, seed=4, nostar=(8, 5, 70, 30))
    img = up(art, 6).crop((0, 1, 1280, 641))
    lk = lockup(lang); img.alpha_composite(up(lk, 4), (56, 40))
    d = ImageDraw.Draw(img); y = 40 + lk.height * 4 + 18
    if kind == 'github':
        lines = {'ru': [('Форк Pixel Dungeon 1.9.2a', GOLD), ('для Telegram', INK)], 'en': [('A Pixel Dungeon 1.9.2a fork', GOLD), ('for Telegram', INK)]}[lang]
    else:
        lines = {'ru': [('Классический рогалик', GOLD), ('прямо в Telegram', INK)], 'en': [('The classic roguelike', GOLD), ('right in Telegram', INK)]}[lang]
    for i, (s, c) in enumerate(lines): text(d, (60, y + i * 52), s, F(48), c, sh=4)
    if kind != 'github' or True:
        b = Image.open(GH + f'badge-play-{lang}.png').convert('RGBA'); img.alpha_composite(b, (60, min(640 - 96, y + len(lines) * 52 + 22)))
    return img.convert('RGB')
for lang in ('ru', 'en'):
    social(lang, 'github').save(GH + f'social-preview-{lang}.png', optimize=True)
    social(lang, 'link').save(TG + f'link-preview-{lang}.png', optimize=True)

def header(lang):
    art, _ = scene(240, 80, cx=188, gh=17, moon=(150, 5), heroes=HEROES, pos=POS4, stones=[(.05, .4), (.35, .8), (.97, .5)], seed=8, nostar=(11, 4, 92, 50))
    img = up(art, 5)
    lk = lockup(lang); img.alpha_composite(up(lk, 4), (64, 40 if lang == 'en' else 30))
    d = ImageDraw.Draw(img)
    s = {'ru': 'Pixel Dungeon 1.9.2a · в Telegram', 'en': 'Pixel Dungeon 1.9.2a · in Telegram'}[lang]
    text(d, (68, (40 if lang == 'en' else 30) + lk.height * 4 + 14), s, F(36), INK, sh=3)
    return img.convert('RGB')
for lang in ('ru', 'en'): header(lang).save(GH + f'header-{lang}.png', optimize=True)

def pin(lang):
    """«Firelight здесь» 1280x640: a panel over the camp, the heading, four lines about the game, «Play»."""
    art, _ = scene(214, 107, cx=162, gh=20, moon=(200, 6), heroes=HEROES, pos=POS4, stones=[(.06, .3), (.33, .7), (.6, .85), (.97, .5)], seed=9, hide_src_moon=True)
    img = up(art, 6).crop((0, 1, 1280, 641))
    a = np.array(img).astype(np.int32)
    a[28:612, 28:676, :3] = (a[28:612, 28:676, :3] * 0.3 + np.array([0x1f, 0x21, 0x1c]) * 0.7).astype(np.int32)
    # the panel's edge warmed by the fire, the way part 2 lights windows
    a[28:612, 672:676, :3] = np.minimum(255, a[28:612, 672:676, :3] + np.array([90, 40, 10]))
    img = Image.fromarray(a.astype(np.uint8)[..., :3]).convert('RGBA'); d = ImageDraw.Draw(img)
    d.rectangle((28, 28, 675, 611), outline='#62665b', width=2); d.rectangle((24, 24, 679, 615), outline=VOID, width=2)
    m = up(campfire(), 3); img.alpha_composite(m, (60, 52))
    head = {'ru': 'Firelight здесь', 'en': 'Firelight is here'}[lang]
    text(d, (136, 64), head, F(48), GOLD, sh=4)
    text(d, (138, 118), {'ru': 'Pixel Dungeon: У костра', 'en': 'Pixel Dungeon: Firelight'}[lang], F(24), '#ffcc66', sh=2)
    lines = {
        'ru': ['Оригинальный Pixel Dungeon 1.9.2a', 'Четыре героя у костра', 'Подземелье дня — одно на всех', 'Каждый забег проверяет сервер'],
        'en': ['The original Pixel Dungeon 1.9.2a', 'Four heroes by the fire', 'One daily dungeon for everyone', 'The server checks every run'],
    }[lang]
    for i, s in enumerate(lines):
        y = 196 + i * 70
        sp = Image.new('RGBA', (5, 5)); spark_px(sp, 2, 2, 0); img.alpha_composite(up(sp, 4), (60, y + 6))
        text(d, (100, y), s, F(36), INK, sh=3)
    b = Image.open(GH + f'badge-play-{lang}.png').convert('RGBA'); img.alpha_composite(b, (60, 500))
    return img.convert('RGB')
for lang in ('ru', 'en'): pin(lang).save(TG + f'channel-pin-{lang}.png', optimize=True)

# ---------------------------------------------------------------- the bot's welcome: 640x360, the hero by the fire, the logo
def welcome(i=0, still=True):
    hf = None if still else [1 if (i // 8) % 4 in (1, 3) and i % 8 >= 4 else 0]
    art, (fx, fy) = scene(160, 90, cx=112, gh=20, moon=(146, 6), heroes=['warrior'], pos=[(16, -1)], stones=[(.05, .35), (.3, .75), (.55, .9), (.97, .5)],
                          seed=11, hide_src_moon=True, nostar=(4, 7, 96, 42), fire_frame=2 if still else i % 6,
                          torch_frames=(1, 3) if still else ((i // 2) % 4, (i // 2 + 2) % 4), hero_frames=hf, embers=still)
    art = art.copy()
    if not still:   # sparks rising from the fire, each on its own 24-frame path
        rnd = random.Random(5)
        for k in range(5):
            ph = rnd.random(); x0 = fx + rnd.randint(-3, 3); drift = rnd.choice((-1, 1)) * rnd.randint(2, 6)
            t = ((i / 24) + ph) % 1
            sx, sy = int(x0 + drift * t + math.sin(t * 6 + k) * 1.2), int(fy - 18 - t * 26)
            if 0 <= sy < art.height: spark_px(art, sx, sy, 1 if t < .55 else 2)
    img = up(art, 4)
    lk = lockup('en')
    if not still and i % 12 in (5, 6):   # the i-dots twinkle
        for xi in i_cols(): spark_px(lk, 19 + 1 + xi + 1, 9 - 1, 1)
    img.alpha_composite(up(lk, 4), (24, 36))
    return img.convert('RGB')
welcome().save(TG + 'bot-welcome.png', optimize=True)
frames = [welcome(i, False) for i in range(24)]
big = Image.new('RGB', (640, 360 * 4))
for k, j in enumerate([0, 6, 12, 18]): big.paste(frames[j], (0, 360 * k))
pal = big.quantize(colors=200, method=Image.MEDIANCUT, dither=Image.Dither.NONE)
q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]
q[0].save(TG + 'bot-welcome.gif', save_all=True, append_images=q[1:], duration=100, loop=0, optimize=True, disposal=1)
print('banners ok', os.path.getsize(TG + 'bot-welcome.gif'))
