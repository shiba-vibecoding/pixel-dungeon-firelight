# Firelight wordmark: hand-drawn chunky pixel letters (stroke 3), lit like metal in a fire: gold on top, ember below,
# coal at the foot, 1 px dark outline. The dots of the two «i» are sparks from the campfire.
import numpy as np
from PIL import Image, ImageFont, ImageDraw
H = 20   # rows: 0-15 cap/ascender, 5-15 x-height, 16-19 descender
G = {
 'F': ['#########', '#########', '#########', '###......', '###......', '###......', '#######..', '#######..', '#######..',
       '###......', '###......', '###......', '###......', '###......', '###......', '###......'],
 'i': ['...', '...', '...', '...', '...', '###', '###', '###', '###', '###', '###', '###', '###', '###', '###', '###'],
 'r': ['.......', '.......', '.......', '.......', '.......', '###.###', '#######', '####...', '###....', '###....', '###....',
       '###....', '###....', '###....', '###....', '###....'],
 'e': ['........', '........', '........', '........', '........', '.######.', '########', '###..###', '###..###', '########',
       '########', '###.....', '###.....', '###...##', '########', '.######.'],
 'l': ['###', '###', '###', '###', '###', '###', '###', '###', '###', '###', '###', '###', '###', '###', '###', '###'],
 'g': ['........', '........', '........', '........', '........', '.#######', '########', '###..###', '###..###', '###..###',
       '###..###', '###..###', '########', '.#######', '.....###', '.....###', '##...###', '########', '.######.'],
 'h': ['###.....', '###.....', '###.....', '###.....', '###.....', '###.###.', '########', '####.###', '###..###', '###..###',
       '###..###', '###..###', '###..###', '###..###', '###..###', '###..###'],
 't': ['.###...', '.###...', '.###...', '.###...', '.###...', '#######', '#######', '.###...', '.###...', '.###...', '.###...',
       '.###...', '.###...', '.###..#', '.######', '..####.'],
}
WORD = 'Firelight'
def mask():
    cols = []
    for k, ch in enumerate(WORD):
        g = G[ch]; w = len(g[0])
        m = np.zeros((H, w), bool)
        for y, row in enumerate(g):
            for x, c in enumerate(row): m[y, x] = c == '#'
        cols.append(m)
        if k < len(WORD) - 1: cols.append(np.zeros((H, 1), bool))
    return np.concatenate(cols, axis=1)
# where the i-dots go (x of each «i» column start, in mask coords)
def i_cols():
    x, out = 0, []
    for ch in WORD:
        if ch == 'i': out.append(x)
        x += len(G[ch][0]) + 1
    return out

FIRE = {  # --fire-* palette (see tokens): from the camp fire's own colours
    'spark': (255, 250, 214), 'light': (255, 235, 164), 'gold': (255, 204, 102), 'flame': (255, 154, 58),
    'ember': (232, 100, 31), 'coal': (178, 42, 42), 'coal-deep': (110, 22, 26), 'ash': (42, 14, 10),
}
def shade(m, lit=1.0):
    """The letters lit from above by the fire: per row a band, highlight on top-left edges, shade on bottom-right."""
    h, w = m.shape
    a = np.zeros((h, w, 4), np.uint8)
    band = ['light'] * 3 + ['gold'] * 4 + ['flame'] * 4 + ['ember'] * 3 + ['coal'] * 2 + ['coal'] * 2 + ['coal-deep'] * 2
    for y in range(h):
        for x in range(w):
            if not m[y, x]: continue
            c = np.array(FIRE[band[y]], float)
            up = y == 0 or not m[y - 1, x]; lf = x == 0 or not m[y, x - 1]
            dn = y == h - 1 or not m[y + 1, x]; rt = x == w - 1 or not m[y, x + 1]
            if up: c = np.array(FIRE['spark'] if y < 7 else FIRE['light'], float)
            elif lf and y < 12: c = c * 0.5 + np.array(FIRE['light']) * 0.5
            if dn: c = np.array(FIRE['coal-deep'], float)
            elif rt: c = c * 0.78
            if lit < 1: c = c * lit + np.array(FIRE['ash']) * (1 - lit)
            a[y, x] = (*np.clip(c, 0, 255).astype(int), 255)
    return a

def outline(a, col=(26, 10, 6, 255), shadow=(11, 11, 9, 255)):
    h, w = a.shape[:2]
    out = np.zeros((h + 3, w + 3, 4), np.uint8)
    out[1:h + 1, 1:w + 1] = a
    f = out[..., 3] == 255
    o = np.zeros_like(f)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1): o |= np.roll(np.roll(f, dy, 0), dx, 1)
    o &= ~f
    sh = np.roll(np.roll(f | o, 1, 0), 1, 1) & ~(f | o)
    out[sh] = shadow; out[o] = col
    return out

def wordmark(lit=1.0, dots=True):
    m = mask()
    a = shade(m, lit)
    if dots:   # the i-dots: sparks (white core, gold rim), 3x3 at rows 1-3
        for x0 in i_cols():
            for (dx, dy), c in {(1, 1): 'spark', (0, 1): 'gold', (2, 1): 'gold', (1, 0): 'gold', (1, 2): 'flame'}.items():
                a[1 + dy, x0 + dx] = (*FIRE[c], 255)
    return Image.fromarray(outline(a), 'RGBA')

if __name__ == '__main__':
    w = wordmark(); print(w.size)
    bg = Image.new('RGBA', w.size, (59, 62, 54, 255)); bg.alpha_composite(w)
    bg.resize((w.width * 8, w.height * 8), Image.NEAREST).save('/tmp/claude-0/wm.png')
