# Firelight identity: campfire mark, lockups (EN / RU), square, sparks.
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from logo import wordmark, FIRE, i_cols, outline
A = '/home/claude/pdf/packages/client/public/assets/'
FIREPNG = Image.open(A + 'camp/fire.png').convert('RGBA')
G9 = ImageFont.truetype('/home/claude/firelight/p1/Galmuri9.ttf', 10)
G11 = ImageFont.truetype('/home/claude/firelight/p1/Galmuri11.ttf', 12)
WOOD = {'L': (193, 144, 64), 'D': (154, 98, 51), 'K': (98, 56, 28), 'E': FIRE['flame'], 'Y': FIRE['gold'], 'R': FIRE['coal'], 'A': (42, 14, 10)}
LOGS = [
    '.KK...........KK.',
    'KLDK.........KDLK',
    '.KLDK..EYE..KDLK.',
    '..KLDKEYYYEKDLK..',
    '...KLDDEYEDDLK...',
    '..KDLDKKEKKDLDK..',
    '.KDLDK.....KDLDK.',
    'KDLK.........KLDK',
    '.KK...........KK.',
]
def logs(glow=1.0):
    h, w = len(LOGS), len(LOGS[0]); a = np.zeros((h, w, 4), np.uint8)
    for y, r in enumerate(LOGS):
        for x, c in enumerate(r):
            if c in WOOD:
                col = np.array(WOOD[c], float)
                if c in 'EYR' and glow < 1: col = col * glow + np.array(WOOD['A']) * (1 - glow)
                a[y, x] = (*col.astype(int), 255)
    return Image.fromarray(a, 'RGBA')

def flame(frame=2, rows=17):
    f = FIREPNG.crop((frame * 13, 0, frame * 13 + 13, 17))
    if rows < 17:   # a growing flame: the bottom rows only, the tip squashed down
        g = f.crop((0, 17 - rows, 13, 17)); out = Image.new('RGBA', (13, 17)); out.alpha_composite(g, (0, 17 - rows)); return out
    return f

def campfire(frame=2, rows=17, glow=1.0):
    """17x24: the flame on the crossed logs, outlined like an item."""
    im = Image.new('RGBA', (17, 24))
    if rows > 0: im.alpha_composite(flame(frame, rows), (2, 0))
    im.alpha_composite(logs(glow), (0, 14))
    a = np.array(im)
    return Image.fromarray(outline(a[:, :, :])[0:26, 0:19], 'RGBA') if False else Image.fromarray(outline(a), 'RGBA')

def spark_px(img, x, y, k=0):
    """A spark: white core, gold cross (k=0), or a single ember (k=1), or a dim one (k=2)."""
    p = img.load(); W, H = img.size
    def put(x, y, c):
        if 0 <= x < W and 0 <= y < H: p[x, y] = (*c, 255)
    if k == 0:
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)): put(x + dx, y + dy, FIRE['gold'])
        put(x, y, FIRE['spark'])
    elif k == 1: put(x, y, FIRE['light'])
    else: put(x, y, FIRE['flame'])

def text(img, xy, s, font, fill, shadow=(11, 11, 9)):
    d = ImageDraw.Draw(img); d.fontmode = '1'
    d.text((xy[0] + 1, xy[1] + 1), s, font=font, fill=(*shadow, 255)); d.text(xy, s, font=font, fill=fill)

CAPS = {
 'P': ['###.', '#..#', '###.', '#...', '#...'], 'I': ['###', '.#.', '.#.', '.#.', '###'], 'X': ['#.#', '#.#', '.#.', '#.#', '#.#'],
 'E': ['###', '#..', '##.', '#..', '###'], 'L': ['#..', '#..', '#..', '#..', '###'], 'D': ['###.', '#..#', '#..#', '#..#', '###.'],
 'U': ['#..#', '#..#', '#..#', '#..#', '.##.'], 'N': ['#..#', '##.#', '#.##', '#..#', '#..#'], 'G': ['.##.', '#...', '#.##', '#..#', '.##.'],
 'O': ['.##.', '#..#', '#..#', '#..#', '.##.'],
}
def caps(s, col=(159, 168, 150), shadow=(11, 11, 9)):
    """«PIXEL DUNGEON» in a 5 px letter-spaced capital of our own: the original's name, quiet, over ours."""
    w = sum(len(CAPS[c][0]) + 1 if c != ' ' else 3 for c in s) - 1
    im = Image.new('RGBA', (w + 1, 6)); p = im.load(); x = 0
    for c in s:
        if c == ' ': x += 3; continue
        g = CAPS[c]
        for y, r in enumerate(g):
            for dx, ch in enumerate(r):
                if ch == '#':
                    p[x + dx + 1, y + 1] = (*shadow, 255) if p[x + dx + 1, y + 1][3] == 0 else p[x + dx + 1, y + 1]
        for y, r in enumerate(g):
            for dx, ch in enumerate(r):
                if ch == '#': p[x + dx, y] = (*col, 255)
        x += len(g[0]) + 1
    return im

SPARK_PATH = [(10, 7), (12, 4), (15, 2), (18, 1), (21, 1)]   # from the flame's tip up and right, towards the letters

def lockup(lang='en', frame=2, lit=1.0, sparks=True, sub=True):
    """Horizontal: the campfire, «PIXEL DUNGEON» small above «Firelight»; RU adds «У костра» under it.
    Sparks rise from the flame and arc into the first «i», whose dot is the brightest of them."""
    wm = wordmark(lit=lit)
    cf = campfire(frame)
    x0 = cf.width + 2
    W = x0 + wm.width
    top = 9
    H = top + wm.height + (13 if lang == 'ru' and sub else 0)
    im = Image.new('RGBA', (W, H))
    cp = caps('PIXEL DUNGEON'); im.alpha_composite(cp, (W - cp.width - 1, 0))
    im.alpha_composite(wm, (x0, top))
    base = top + 1 + 15                      # the letters' baseline
    fy = base - cf.height + 3
    im.alpha_composite(cf, (0, fy))
    if lang == 'ru' and sub:
        text(im, (x0 + 2, top + wm.height - 1), 'У костра', G11, (*FIRE['light'], 255))
    if sparks:
        ix = x0 + 1 + i_cols()[0] + 1          # the first i-dot's middle
        iy = top + 1 + 2
        for k, t in enumerate([0.2, 0.42, 0.66]):
            sx = int(round(9 + (ix - 9) * t)); sy = int(round(fy + 2 + (iy - fy - 2) * t - 3 * np.sin(np.pi * t)))
            spark_px(im, sx, sy, 2 if k == 0 else 1)
    return im

def square(lang='en', frame=2):
    """Square: the campfire over the wordmark; for the avatar's bigger brothers and app icons with text."""
    wm = wordmark(); cf = campfire(frame)
    W = wm.width + 6; H = 35 + wm.height + (12 if lang == 'ru' else 0) + 2
    S = max(W, H)
    im = Image.new('RGBA', (S, S))
    y0 = (S - H) // 2
    im.alpha_composite(cf, ((S - cf.width) // 2, y0 + 2))
    for sx, sy, k in [(S // 2 - 6, y0 + 3, 1), (S // 2 + 5, y0 + 1, 2), (S // 2 + 8, y0 + 6, 1)]: spark_px(im, sx, sy, k)
    im.alpha_composite(wm, ((S - wm.width) // 2, y0 + 35))
    cp = caps('PIXEL DUNGEON'); im.alpha_composite(cp, ((S - cp.width) // 2, y0 + 28))
    if lang == 'ru':
        d = ImageDraw.Draw(im); w = d.textlength('У костра', font=G11)
        text(im, (int((S - w) // 2), y0 + 35 + wm.height - 1), 'У костра', G11, (*FIRE['light'], 255))
    return im

if __name__ == '__main__':
    out = Image.new('RGBA', (220, 160), (11, 11, 9, 255))
    out.alpha_composite(lockup('en'), (4, 4)); out.alpha_composite(lockup('ru'), (4, 50))
    out.alpha_composite(square('ru'), (110, 60))
    out.resize((out.width * 4, out.height * 4), Image.NEAREST).save('/tmp/claude-0/lock.png')
