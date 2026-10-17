# Firelight · part 9 «a weapon in the hand»: the weapons of PD 1.9.2a as they are held by a 12 x 15 hero, in the palette of their
# own item pictures (items.png), 4-12 px long. One sheet per weapon, assets/weapons/held/<kind>.png, cells of 17 x 17 with the grip
# (the hero's hand) at the middle pixel (8, 8):
#   row 0, columns 0-7: the weapon pointing at 0, 45, ... 315 degrees (0 = up the screen, clockwise). Two of them are drawn, straight
#     up (0) and diagonal (45); the other six are exact quarter turns of those, so no pixel is ever resampled;
#   row 1, columns 0-2: the trail of the blow (frame 14 of the attack) from the side, the front and the back, in the same cell.
# The grip pixel is left clear: the hand of the body (its own colour, under any Pixel-Mart look) shows there, the fingers round the
# handle. A weapon is described along itself: `a` along the weapon from the hand (+ towards the tip), `p` across it (+ to the right
# when it points up). Straight up a point is at (p, -a); on the diagonal at (a + p, p - a), so a 1-pixel blade is a clean staircase
# and a guard lies across it; the heads (axe, hammer, mace, pick) are filled where the diagonal leaves single holes.
from collections import Counter
from PIL import Image
import c9
from c9 import hx, blank, save, CELL, GRIP, ANGLES

P = {  # the palettes of the item pictures (items.png), by weapon
    'knuckles': dict(L='#d2d2d2', M='#a4a4a4', D='#7f7f7f'),
    'dagger': dict(b='#ffffff', c='#cccccc', d='#808080', g='#827b00', h='#666114', i='#59551b', j='#595959'),
    'shortSword': dict(b='#ffffff', c='#b8cccc', d='#808080', e='#d0b42b', f='#a69021', g='#807826'),
    'sword': dict(b='#ffffff', c='#cccccc', d='#808080', e='#fba959', f='#d18b45', g='#bc7b3a', h='#929292'),
    'longsword': dict(b='#ffffff', c='#cccccc', d='#808080', e='#9f4e3d', f='#904536', g='#ad4733', h='#803d2f'),
    'quarterstaff': dict(b='#999999', c='#888888', d='#636363', e='#997838', f='#886a2e', g='#634b1c'),
    'spear': dict(b='#ffffff', c='#808080', d='#fba959', f='#bc7b3a', e='#ff0000', g='#991f1f'),
    'mace': dict(b='#cccccc', c='#999999', d='#666666', e='#4d4d4d', f='#d8a351', g='#c08f43', h='#8d6529'),
    'battleAxe': dict(b='#ffffff', c='#cecece', d='#aeaeae', f='#9e9e9e', i='#7d7d7d', j='#656565', e='#d0b42b', g='#b79c14', h='#8b821c'),
    'warHammer': dict(b='#f2e98c', c='#e8ba31', d='#be974b', e='#bf670f', g='#a0410d', f='#801e0a'),
    'glaive': dict(b='#b3c4d1', c='#779fad', d='#79959b', e='#bf670f', g='#801e0a', f='#ff0000', h='#991f1f'),
    'pickaxe': dict(b='#ffffff', e='#cccccc', g='#808080', c='#b18458', d='#c89667', f='#815d3a'),
    'dart': dict(b='#b4b4b4', c='#9a9a9a', d='#cdcdcd', e='#e6e6e6', f='#818181', h='#666666', i='#4c4c4c'),
    'curare': dict(b='#ffd500', c='#fff55b', e='#818181', g='#666666', i='#4c4c4c', j='#3e3e3e', k='#303030'),
    'incendiary': dict(b='#ff9e21', c='#fff55b', d='#717a81', e='#4c4c4c', f='#3e3e3e', g='#303030', i='#ff5400', j='#e31f00'),
    'javelin': dict(b='#b3b3b3', c='#ffffff', d='#999999', e='#808080', f='#666666'),
    'shuriken': dict(b='#ffffff', c='#d9d9d9', d='#b3b3b3'),
    'tomahawk': dict(b='#cccccc', d='#999999', e='#666666', c='#995c3d', f='#734239', g='#b79c14'),
    'boomerang': dict(b='#bda86a', c='#cacf98', d='#996c4c'),
}


def line(a0, a1, cols, p=0):
    """A 1-pixel run along the weapon from a0 to a1; cols repeats if shorter."""
    return [(a, p, cols[(a - a0) % len(cols)], 0) for a in range(a0, a1 + 1)]


def pts(*items, head=0):
    return [(a, p, c, head) for a, p, c in items]


# (a, p, colour, head): head parts are filled where the diagonal leaves a single hole.
SPEC = {
    # tier 1
    'knuckles': pts((1, -1, 'M'), (1, 0, 'L'), (1, 1, 'M'), (0, 1, 'D')),
    'dagger': pts((1, -1, 'g'), (1, 0, 'h'), (1, 1, 'i'), (2, 0, 'c'), (3, 0, 'b'), (-1, 0, 'j')),
    'shortSword': pts((1, -1, 'e'), (1, 0, 'f'), (1, 1, 'g'), (-1, 0, 'g')) + line(2, 4, 'dcc') + pts((5, 0, 'b')),
    # tier 2
    'quarterstaff': pts((-5, 0, 'd')) + line(-4, 5, 'eef') + pts((-1, 0, 'f'), (6, 0, 'b'), (7, 0, 'c')),
    'spear': pts((-3, 0, 'f')) + line(-2, -1, 'd') + line(1, 5, 'ddf') + pts((5, 1, 'g'), (6, 1, 'e'), (6, 0, 'c'), (7, 0, 'c'), (8, 0, 'b')),
    'pickaxe': pts((-1, 0, 'f')) + line(1, 4, 'dc') + pts((5, -2, 'e'), (5, -1, 'e'), (5, 0, 'b'), (5, 1, 'e'), (5, 2, 'e'),
                                                       (4, -3, 'g'), (4, 3, 'g'), head=1),
    # tier 3
    'mace': pts((-1, 0, 'h')) + line(1, 3, 'gff') + pts((4, -1, 'c'), (4, 0, 'b'), (4, 1, 'd'), (5, -1, 'd'), (5, 0, 'c'), (5, 1, 'e'), (6, 0, 'c'), head=1),
    'sword': pts((1, -1, 'f'), (1, 0, 'e'), (1, 1, 'g'), (-1, 0, 'h')) + line(2, 5, 'dccc') + pts((6, 0, 'b')),
    # tier 4
    'longsword': pts((1, -1, 'f'), (1, 0, 'e'), (1, 1, 'h'), (-1, 0, 'f'), (-2, 0, 'g')) + line(2, 7, 'dcccc') + pts((8, 0, 'b')),
    'battleAxe': pts((-1, 0, 'h')) + line(1, 6, 'eg') + pts((3, 1, 'f'), (4, 1, 'c'), (5, 1, 'c'), (6, 1, 'f'), (3, 2, 'd'), (4, 2, 'b'),
                                                         (5, 2, 'b'), (6, 2, 'd'), (4, 3, 'c'), (5, 3, 'd'), (5, -1, 'i'), (6, -1, 'j'), head=1),
    # tier 5
    'warHammer': pts((-1, 0, 'f')) + line(1, 4, 'eeg') + pts((5, -2, 'd'), (5, -1, 'c'), (5, 0, 'b'), (5, 1, 'c'), (5, 2, 'd'),
                                                          (6, -2, 'g'), (6, -1, 'd'), (6, 0, 'c'), (6, 1, 'd'), (6, 2, 'g'), head=1),
    'glaive': pts((-2, 0, 'g'), (-1, 0, 'e')) + line(1, 5, 'eeg') + pts((4, -1, 'h'), (5, -1, 'f'), (6, 0, 'd'), (6, 1, 'c'), (7, 0, 'c'),
                                                                    (7, 1, 'b'), (8, 0, 'b'), head=1),
    # thrown (in the hand until thrown)
    'dart': pts((1, -1, 'c'), (1, 0, 'b'), (1, 1, 'f'), (2, 0, 'd'), (2, 1, 'e'), (0, 1, 'h'), head=1),
    'curare': pts((1, -1, 'i'), (1, 0, 'e'), (1, 1, 'j'), (2, 0, 'g'), (2, 1, 'e'), (0, 1, 'k'), (3, 2, 'b'), (4, 2, 'c'), head=1),
    'incendiary': pts((1, -1, 'f'), (1, 0, 'd'), (1, 1, 'g'), (2, 0, 'e'), (2, 1, 'd'), (0, 1, 'g'), (3, 1, 'i'), (4, 1, 'b'), (5, 1, 'c'), head=1),
    'javelin': pts((-2, 0, 'f'), (-1, 0, 'd')) + line(1, 4, 'de') + pts((5, 0, 'b'), (6, 0, 'c'), (5, 1, 'e'), (5, -1, 'e')),
    'shuriken': pts((2, -1, 'b'), (2, 1, 'c'), (1, 0, 'd'), (0, 1, 'b')),
    'tomahawk': pts((-1, 0, 'f')) + line(1, 4, 'cf') + pts((4, 0, 'g'), (3, 1, 'd'), (4, 1, 'b'), (4, 2, 'd'), (3, 2, 'e'), (5, 1, 'd'), head=1),
    'boomerang': pts((1, 0, 'b'), (2, 0, 'c'), (3, 0, 'b'), (4, 0, 'd'), (4, 1, 'b'), (4, 2, 'c'), (4, 3, 'd'), (3, 3, 'd')),
}
KINDS = list(SPEC)


def base(kind, diag):
    """The weapon straight up (0) or on the diagonal (45), grip at the middle of the cell (left clear)."""
    im = blank(CELL, CELL); px = im.load(); pal = P[kind]; head = set()
    for a, p, c, h in SPEC[kind]:
        x, y = (a + p, p - a) if diag else (p, -a)
        x, y = GRIP + x, GRIP + y
        px[x, y] = hx(pal[c]) + (255,)
        if h: head.add((x, y))
    if diag:   # single holes the diagonal leaves inside a head: the colour most found round it (ties by colour)
        src = im.copy().load()
        for y in range(1, CELL - 1):
            for x in range(1, CELL - 1):
                if src[x, y][3] or (x, y) == (GRIP, GRIP): continue
                nb = [(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))]
                hs = [q for q in nb if q in head]
                if len(hs) >= 3:
                    cnt = Counter('%02x%02x%02x' % src[q][:3] for q in hs)
                    px[x, y] = hx(sorted(cnt.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]) + (255,)
    return im


def turned(im, quarter):
    """A quarter turn clockwise, `quarter` times: exact, about the middle pixel."""
    for _ in range(quarter % 4): im = im.transpose(Image.ROTATE_270)
    return im


# Held in the fist and the same at every angle: a stone, a star (their straight picture is used for all eight).
FLAT = {'dart', 'curare', 'incendiary', 'shuriken'}


def angles(kind):
    s, d = base(kind, False), base(kind, True)
    if kind in FLAT: return {ang: s for ang in ANGLES}
    return {ang: turned(s if ang % 90 == 0 else d, ang // 90) for ang in ANGLES}


def tip(kind):
    """How far the weapon reaches from the hand (pixels along it): the radius of its trail."""
    return max(a for a, p, c, h in SPEC[kind])


def main():
    for kind in KINDS:
        sh = Image.new('RGBA', (CELL * 8, CELL * 2), (0, 0, 0, 0))
        for i, (ang, im) in enumerate(sorted(angles(kind).items())): sh.alpha_composite(im, (i * CELL, 0))
        save(sh, f'weapons/held/{kind}.png')
    print('weapons ok')


if __name__ == '__main__':
    main()
