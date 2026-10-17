# Firelight · part 10 «doors you can read from any side»: the doors' 3D pieces for each region, pixel art at 16 px a cell, in the
# palette of the region's own PD 1.9.2a tiles. One colour sheet and one glow sheet per region (doors/doors-<region>.png and
# -glow.png, the same layout), one shared sheet of effects (doors/doors-fx.png), and doors/doors.json: the sizes of every piece in
# cells, which picture goes on which face (rects in pixels of the sheet), and the states.
#
# The pieces (a door in a wall running east-west; one in a wall running north-south is the same turned a quarter):
#   threshold - a plate on the floor of the doorway, 0.75 wide, 1.25 long (a lip of 0.125 out into each room), 0.03 high: seen from
#               above and from every side; its planks or slabs run the way through, a worn lighter path down the middle;
#   frame     - two posts lining the doorway (0.125 wide, a cell deep) and two lintel beams across its faces (0.125 x 0.125), in a
#               material that is not the wall's, one pixel (0.0625) proud of the wall's top: from above a bright rectangle round the gap;
#   leaf      - 0.75 wide, 0.125 thick, 1.25 high in a whole wall (0.75 in a cut one), 0.03 off the threshold; the gap under it and
#               the gap over it (to the lintel) let the light through: warm from a lit room, cold blue at a locked door;
#   lock      - a padlock (both faces) and a chain over the leaf's top; a keyhole plaque on the lintel, seen from the front and above;
#   others    - the barricade's boards, the cracks of a secret door being found, the grate and skull lock of a boss floor's exit.
import json, math, os
from PIL import Image
import c10
from c10 import hx, OUT, REGIONS

S = 16   # pixels a cell


def rgba(c, a=255): return hx(c) + (a,) if isinstance(c, str) else tuple(c[:3]) + (a,)
def mix(a, b, k): a, b = hx(a) if isinstance(a, str) else a, hx(b) if isinstance(b, str) else b; return tuple(round(a[i] + (b[i] - a[i]) * k) for i in range(3))
def noise(x, y, s):
    h = (x * 374761393 + y * 668265263 + s * 2246822519) & 0xffffffff
    h = (h ^ (h >> 13)) * 1274126177 & 0xffffffff
    return ((h ^ (h >> 16)) & 0xffffff) / 0xffffff


# ---------------------------------------------------------------- the region palettes (from tiles<n>.png: the door, wall and floor tiles)
PAL = {
    'sewers': dict(  # a dark oak door with a slot window (PD's), framed in tarred timber against the pale brick; a worn stone sill
        wood=['#2b1e1e', '#3f2b25', '#573b2e', '#74503a'], frame=['#17120e', '#2c2218', '#46351f', '#6a5230'], cap='#e2b870',
        iron=['#1e1e22', '#3a3a40', '#616168', '#a8a8b0'], sill=['#3b3a36', '#5a5850', '#76736a', '#96928a'], path='#aaa59a', edge='#6a5230',
        glow='#ffb060', accent='#99b2a7', slot=True),
    'prison': dict(  # PD's arched oak door, framed in dark iron against the sandstone; an iron sill
        wood=['#4a2e1c', '#654028', '#7f562b', '#9a6c3a'], frame=['#1d1e22', '#33353c', '#4f525c', '#7c808c'], cap='#c8ccd6',
        iron=['#1d1e22', '#33353c', '#5a5e68', '#a0a4b0'], sill=['#3a3933', '#6c675b', '#857f70', '#a39c8a'], path='#b4ad98', edge='#5a5e68',
        glow='#ffb060', accent='#c9c3a2', arch=True),
    'caves': dict(  # rough dark planks with a Z brace, framed in pale pine pit-props against the grey rock; a plank sill
        wood=['#2a221c', '#453a33', '#553e2d', '#6b4d36'], frame=['#5a3f22', '#7a5a34', '#a07a46', '#c49c5e'], cap='#e2bf7e',
        iron=['#202022', '#37383b', '#5c5e62', '#9a9ca2'], sill=['#3a2a1e', '#553e2d', '#6b4d36', '#86603f'], path='#a07a52', edge='#a07a46',
        glow='#ffb060', accent='#b7b0a5', brace=True),
    'city': dict(  # the dwarves' blue-grey steel door with its amber slits (PD's), framed in brass against the rose stone; a slate sill
        wood=['#221e1c', '#342e2c', '#4a413e', '#5e5450'], frame=['#4a2c08', '#7a4a0c', '#a56607', '#d08a1a'], cap='#f2c04a',
        iron=['#1c1f28', '#313440', '#4f5568', '#8a92a8'], sill=['#313440', '#4f5668', '#66708a', '#8a92a8'], path='#a0a8bc', edge='#a56607',
        glow='#ffc23a', accent='#c5a301', slits=True),
    'halls': dict(  # black iron with green runes (PD's), framed in bone against the dark stone; an obsidian sill with red runes
        wood=['#141010', '#211a1a', '#2e2526', '#41413c'], frame=['#4e463c', '#7a705e', '#a89c84', '#d2c6a8'], cap='#efe4c8',
        iron=['#151213', '#2a2324', '#4a4040', '#8a7c78'], sill=['#2a1a1a', '#4e3434', '#6a4646', '#8a5c5c'], path='#9a7070', edge='#a89c84',
        glow='#ff8a3a', accent='#7fdc4a', runes=True),
}
COLD = '#7ad0ff'
GOLD = ['#5a3a08', '#9a6a10', '#d8a020', '#ffe070']


class Canvas:
    def __init__(self, w, h): self.im = Image.new('RGBA', (w, h), (0, 0, 0, 0)); self.px = self.im.load(); self.w, self.h = w, h
    def put(self, x, y, c, a=255):
        if 0 <= x < self.w and 0 <= y < self.h: self.px[x, y] = rgba(c, a)
    def rect(self, x0, y0, x1, y1, c, a=255):
        for y in range(y0, y1):
            for x in range(x0, x1): self.put(x, y, c, a)
    def get(self, x, y): return self.px[x, y]


def planks(cv, x0, y0, w, h, pal, pw, seed, vertical=True, edge=True):
    """Planks running up (vertical) or across, seams dark, grain, a lit edge on each plank."""
    dk, md, lt, hl = pal
    for y in range(h):
        for x in range(w):
            u, v = (x, y) if vertical else (y, x)
            k = u // pw; i = u % pw
            c = mix(md, lt, 0.15 + 0.25 * ((k * 37 + seed) % 3) / 2)
            g = noise(u + k * 7, v // 3, seed + k)
            if g < 0.25: c = mix(c, dk, 0.45)
            elif g > 0.88: c = mix(c, hl, 0.5)
            if i == pw - 1: c = mix(dk, '#000000', 0.25)
            elif i == 0: c = mix(c, hl, 0.3)
            cv.put(x0 + x, y0 + y, c)
    if edge:
        for y in range(h): cv.put(x0, y0 + y, dk); cv.put(x0 + w - 1, y0 + y, dk)


def band(cv, x0, y, w, iron, rivets=True):
    for x in range(w):
        cv.put(x0 + x, y, iron[2]); cv.put(x0 + x, y + 1, iron[1])
    if rivets:
        for x in range(1, w, 4): cv.put(x0 + x, y, iron[3])


def ring(cv, x, y, iron):
    for dx, dy, k in ((0, 0, 3), (1, 0, 2), (-1, 1, 2), (2, 1, 1), (-1, 2, 1), (2, 2, 1), (0, 3, 1), (1, 3, 0)): cv.put(x + dx, y + dy, iron[k])


# ---------------------------------------------------------------- the pieces
def leaf_face(cv, x0, y0, h, P, kind, glow):
    """The leaf's face, 12 wide, h high (20 in a whole wall, 12 in a cut one). kind: closed | locked | vault | barricade | charred."""
    w = 12; wood, iron = P['wood'], P['iron']; seed = sum(hx(wood[1]))
    if kind in ('barricade', 'charred'):
        return barricade_face(cv, x0, y0, h, P, kind == 'charred')
    if kind == 'vault':
        # steel plates riveted with gold, a round gold dial in the middle; the same in every region but for the frame round it
        for y in range(h):
            for x in range(w):
                c = mix(iron[1], iron[2], 0.5 if (x // 6 + y // 7) % 2 else 0.3)
                if x in (0, w - 1) or y in (0, h - 1): c = iron[0]
                elif y % 7 == 0 or x == 6: c = iron[0]
                cv.put(x0 + x, y0 + y, c)
        for y in range(2, h - 1, 7):
            for x in (2, 9): cv.put(x0 + x, y0 + y, GOLD[3])
        cy = y0 + h // 2 - 2
        for dx, dy in ((1, 0), (2, 0), (0, 1), (3, 1), (0, 2), (3, 2), (1, 3), (2, 3)): cv.put(x0 + 4 + dx, cy + dy, GOLD[2])
        cv.put(x0 + 5, cy + 1, GOLD[3]); cv.put(x0 + 6, cy + 2, GOLD[0]); cv.put(x0 + 5, cy + 2, '#000000'); cv.put(x0 + 6, cy + 1, '#000000')
        for x in range(w): cv.put(x0 + x, y0 + 1, GOLD[1]); cv.put(x0 + x, y0 + h - 2, GOLD[1])
        return
    if P.get('slits') or P.get('runes'):
        # a metal leaf: the city's steel with amber slits, the halls' black iron with green runes (both glow)
        for y in range(h):
            for x in range(w):
                c = mix(wood[1], wood[2], 0.4 + 0.3 * noise(x, y // 2, seed) - (0.2 if x in (5, 6) else 0))
                if x in (0, w - 1) or y in (0, h - 1): c = wood[0]
                cv.put(x0 + x, y0 + y, c)
        if P.get('slits'):
            for sx in (3, 8):
                for y in range(3, h - 3 if h > 12 else h - 2):
                    if (y - 3) % 3 != 2:
                        cv.put(x0 + sx, y0 + y, '#2a1a04'); glow.put(x0 + sx, y0 + y, P['accent'])
        else:
            pts = [(3, 2), (3, 3), (4, 4), (5, 4), (6, 5), (7, 6), (7, 7), (6, 8), (5, 9), (4, 10), (4, 11), (5, 12), (6, 13), (7, 14), (8, 15), (8, 16), (7, 17)]
            for x, y in pts:
                if y < h - 1: cv.put(x0 + x, y0 + y, '#245324'); glow.put(x0 + x, y0 + y, P['accent'])
            for x, y in ((8, 3), (9, 4), (2, 7), (9, 11), (2, 14)):
                if y < h - 1: cv.put(x0 + x, y0 + y, '#426b40'); glow.put(x0 + x, y0 + y, '#4a8a3a')
    else:
        planks(cv, x0, y0, w, h, wood, 4, seed)
        if P.get('arch'):
            for x, y in ((0, 0), (1, 0), (0, 1), (10, 0), (11, 0), (11, 1)): cv.put(x0 + x, y0 + y, P['frame'][1])
            for x, y in ((2, 0), (1, 1), (0, 2), (9, 0), (10, 1), (11, 2)): cv.put(x0 + x, y0 + y, wood[0])
            for y in range(4, h - 1, 4):
                for x in (2, 6, 10): cv.put(x0 + x, y0 + y, iron[3])
        if P.get('brace') and h > 12:
            for i in range(8):
                cv.put(x0 + 2 + i, y0 + 14 - i, wood[3]); cv.put(x0 + 2 + i, y0 + 15 - i, wood[0])
        straps = (3, h - 5) if h > 12 else (2, h - 4)
        for y in straps:
            for x in range(0, 6): cv.put(x0 + x, y0 + y, iron[2] if x < 5 else iron[1]); cv.put(x0 + x, y0 + y + 1, iron[1])
            cv.put(x0 + 1, y0 + y, iron[3]); cv.put(x0 + 4, y0 + y, iron[3])
        if P.get('slot') and h > 12:
            for y in range(3, 5):
                for x in range(4, 8): cv.put(x0 + x, y0 + y, '#000000'); glow.put(x0 + x, y0 + y, P['glow'])
    if kind == 'locked':
        ys = (5, h - 7) if h > 12 else (3, h - 5)
        for y in ys: band(cv, x0, y0 + y, w, iron)
        cy = y0 + h // 2 - 1
        cv.rect(x0 + 4, cy, x0 + 8, cy + 3, iron[1])
        for x in range(4, 8): cv.put(x0 + x, cy, iron[3])
        cv.put(x0 + 5, cy + 1, '#000000'); cv.put(x0 + 6, cy + 1, '#000000'); cv.put(x0 + 5, cy + 2, '#000000')
    elif not (P.get('slits') or P.get('runes')):
        ring(cv, x0 + 8, y0 + h // 2 - 1, iron)
    else:
        for dy in range(3): cv.put(x0 + 9, y0 + h // 2 - 1 + dy, iron[3] if dy == 0 else iron[2])


def barricade_face(cv, x0, y0, h, P, charred):
    """Boards nailed across the doorway: two across, two crossed; charred, they are black with ember cracks."""
    wood = P['wood'] if not charred else ['#0c0a0a', '#1a1414', '#2a2020', '#3a2a22']
    lt = ['#3b2a18', '#6b4a2a', '#8a6236', '#b08048'] if not charred else wood
    for y in range(h):
        for x in range(12):
            if (x + y) % 5 == 0: cv.put(x0 + x, y0 + y, '#000000', 0)
    def board(pts, pal):
        for x, y in pts:
            if 0 <= y < h: cv.put(x0 + x, y0 + y, pal[2] if (x + y) % 3 else pal[1])
    for yb in ((2, 3, 4) if h > 12 else (1, 2)):
        board([(x, yb) for x in range(12)], lt)
    for yb in ((h - 5, h - 4, h - 3) if h > 12 else (h - 3, h - 2)):
        board([(x, yb) for x in range(12)], lt)
    for i in range(h):
        x = round(i * 11 / max(1, h - 1))
        board([(x, i), (min(11, x + 1), i)], lt)
        board([(11 - x, i), (max(0, 10 - x), i)], lt)
    for x, y in ((1, 3), (10, 3), (1, h - 4), (10, h - 4)):
        cv.put(x0 + x, y0 + y, '#a8a8b0' if not charred else '#ff5a1a')


def leaf_top(cv, x0, y0, P, kind):
    """The leaf's top edge, 12 x 2 (the barricade's 12 x 4): what a camera from above sees of a closed door. Planks, a hinge knuckle
    at one end, the ring at the other; locked, a chain across; the vault's steel and gold."""
    wood, iron = P['wood'], P['iron']
    if kind == 'vault':
        for x in range(12): cv.put(x0 + x, y0, iron[2]); cv.put(x0 + x, y0 + 1, iron[1])
        for x in (1, 5, 9): cv.put(x0 + x, y0, GOLD[3])
        return
    if kind in ('barricade', 'charred'):
        wd = P['wood'] if kind == 'barricade' else ['#0c0a0a', '#1a1414', '#2a2020', '#3a2a22']
        for y in range(4):
            for x in range(12): cv.put(x0 + x, y0 + y, wd[2] if (x // 3 + y) % 2 else wd[1])
        return
    hl = mix(wood[3], P['cap'], 0.45)
    for x in range(12):
        cv.put(x0 + x, y0, hl if x % 4 else wood[2]); cv.put(x0 + x, y0 + 1, wood[3] if x % 4 else wood[1])
    cv.put(x0, y0, iron[3]); cv.put(x0, y0 + 1, iron[1]); cv.put(x0 + 1, y0 + 1, iron[2])   # the hinge's knuckle
    cv.put(x0 + 10, y0, iron[3]); cv.put(x0 + 11, y0 + 1, iron[2])                          # the ring
    if kind == 'locked':
        for x in range(12): cv.put(x0 + x, y0 + (x % 2), iron[3] if x % 2 == 0 else iron[1]); cv.put(x0 + x, y0 + 1 - (x % 2), iron[2] if x % 4 < 2 else iron[0])


def leaf_edge(cv, x0, y0, h, P):
    wood, iron = P['wood'], P['iron']
    for y in range(h):
        cv.put(x0, y0 + y, wood[1]); cv.put(x0 + 1, y0 + y, wood[0])
    for y in ((3, h - 5) if h > 12 else (2, h - 4)): cv.put(x0, y0 + y, iron[2]); cv.put(x0 + 1, y0 + y, iron[1])


def post_face(cv, x0, y0, h, P):
    f = P['frame']
    for y in range(h):
        cv.put(x0, y0 + y, f[2] if y else P['cap']); cv.put(x0 + 1, y0 + y, f[1] if y else f[3])
    for y in range(3, h, 6): cv.put(x0, y0 + y, P['iron'][3])


def post_side(cv, x0, y0, h, P):
    """The face of a post that lines the doorway, a cell deep: the frame's material, its top row the bright cap."""
    f = P['frame']; seed = sum(hx(f[2]))
    for y in range(h):
        for x in range(16):
            c = mix(f[1], f[2], 0.3 + 0.4 * noise(x // 3, y, seed))
            if y == 0: c = P['cap']
            elif y == 1: c = f[3]
            elif x in (0, 15): c = f[0]
            elif y % 8 == 7: c = f[0]
            cv.put(x0 + x, y0 + y, c)
    for x in (3, 12):
        for y in range(4, h, 8): cv.put(x0 + x, y0 + y, P['iron'][3])


def post_top(cv, x0, y0, P):
    for y in range(16):
        cv.put(x0, y0 + y, P['cap']); cv.put(x0 + 1, y0 + y, mix(P['cap'], P['frame'][2], 0.5))
    for y in (0, 15): cv.put(x0, y0 + y, P['frame'][3]); cv.put(x0 + 1, y0 + y, P['frame'][2])


def lintel(cv, x0, y0, P, part):
    f = P['frame']
    for x in range(12):
        if part == 'top': cv.put(x0 + x, y0, P['cap']); cv.put(x0 + x, y0 + 1, mix(P['cap'], f[2], 0.5))
        elif part == 'face': cv.put(x0 + x, y0, f[3] if x % 6 else P['cap']); cv.put(x0 + x, y0 + 1, f[1])
        else: cv.put(x0 + x, y0, f[1]); cv.put(x0 + x, y0 + 1, f[0])


def plaque(cv, x0, y0, P, vault, part):
    """The keyhole plaque on the lintel (4 x 5; its top 4 x 2): iron with a keyhole, the vault's gold."""
    m = GOLD if vault else P['iron']
    if part == 'top':
        for x in range(4): cv.put(x0 + x, y0, m[3]); cv.put(x0 + x, y0 + 1, m[2])
        return
    for y in range(5):
        for x in range(4): cv.put(x0 + x, y0 + y, m[2] if 0 < x < 3 and 0 < y < 4 else m[1])
    cv.put(x0 + 1, y0, m[3]); cv.put(x0 + 2, y0, m[3])
    for x, y in ((1, 1), (2, 1), (1, 2), (2, 2), (1, 3) if not vault else (2, 3)): cv.put(x0 + x, y0 + y, '#000000')
    cv.put(x0 + 2, y0 + 2, '#000000')


def padlock(cv, x0, y0, P, part):
    """The padlock hanging on each face of a locked leaf: front 4 x 5, side 2 x 5, top 4 x 2 (the shackle)."""
    m = P['iron']; b = ['#3a2a06', '#7a5a10', '#b88a20', '#e8c050']
    if part == 'top':
        for x in range(4): cv.put(x0 + x, y0, m[3] if x in (0, 3) else '#000000', 255 if x in (0, 3) else 0); cv.put(x0 + x, y0 + 1, b[2])
        return
    if part == 'side':
        for y in range(5): cv.put(x0, y0 + y, b[1] if y > 1 else m[2]); cv.put(x0 + 1, y0 + y, b[0] if y > 1 else m[1])
        return
    for x, y in ((0, 0), (3, 0), (0, 1), (3, 1)): cv.put(x0 + x, y0 + y, m[3])
    cv.put(x0 + 1, y0, m[2]); cv.put(x0 + 2, y0, m[2])
    for y in range(2, 5):
        for x in range(4): cv.put(x0 + x, y0 + y, b[3] if y == 2 else b[2] if x < 3 else b[1])
    cv.put(x0 + 1, y0 + 3, '#000000'); cv.put(x0 + 1, y0 + 4, b[0])


def threshold(cv, x0, y0, P, kind):
    """The plate on the floor of the doorway, 12 across x 20 along the way through (rows 0-1 and 18-19 are its lips out into the
    rooms): its planks or slabs run the way through, a lighter worn path down the middle, a dark edge; locked, an iron bar across
    where the leaf stands; the vault's, iron plate."""
    sill, seed = P['sill'], sum(hx(P['sill'][2]))
    for y in range(20):
        for x in range(12):
            if kind == 'vault':
                c = mix(P['iron'][1], P['iron'][2], 0.3 + 0.3 * ((x // 4 + y // 5) % 2))
                if y % 5 == 0: c = P['iron'][0]
            else:
                slab = (y // 5 + (x // 6)) % 2 if not P.get('brace') else 0
                c = mix(sill[1], sill[2], 0.35 + 0.3 * slab + 0.25 * noise(x // 2, y, seed))
                if P.get('brace'):   # planks along the way
                    if x % 4 == 3: c = sill[0]
                elif y % 5 == 4: c = mix(sill[0], sill[1], 0.4)
                if 4 <= x <= 7: c = mix(c, P['path'], 0.45)
            if y in (0, 1, 18, 19): c = mix(P['edge'], sill[3], 0.25) if y in (0, 19) else mix(P['edge'], sill[1], 0.35)
            if x in (0, 11): c = mix(sill[0], '#000000', 0.3)
            cv.put(x0 + x, y0 + y, c)
    if kind == 'locked':
        for x in range(12): cv.put(x0 + x, y0 + 9, P['iron'][2]); cv.put(x0 + x, y0 + 10, P['iron'][1])
        for x in (2, 6, 9): cv.put(x0 + x, y0 + 9, P['iron'][3])


def threshold_side(cv, x0, y0, P):
    for x in range(20): cv.put(x0 + x, y0, mix(P['sill'][0], '#000000', 0.2))


def crack(cv, glow, x0, y0, w, h, P, stage, cap=False):
    """The outline of a secret door showing through the wall as it is found: dark cracks (colour) lit from inside (glow), in three
    stages; on the cap (from above) the same along the doorway's two edges."""
    lines = []
    if cap:
        lines = [(2, y) for y in range(16)] + [(13, y) for y in range(16)]
    else:
        top = 3
        lines = [(2, y) for y in range(top, h)] + [(13, y) for y in range(top, h)] + [(x, top) for x in range(2, 14)]
    n = len(lines); shown = lines[: int(n * (0.4, 0.75, 1.0)[stage])] if not cap else [p for i, p in enumerate(lines) if i % 16 < (6, 11, 16)[stage]]
    for i, (x, y) in enumerate(shown):
        cv.put(x0 + x, y0 + y, '#000000', 255)
        glow.put(x0 + x, y0 + y, mix('#000000', P['cap'], 0.35 + 0.15 * stage) if i % 3 else mix('#000000', P['cap'], 0.6 + 0.2 * stage))
        if stage == 2 and i % 5 == 0:
            for dx in (-1, 1):
                if not cap: cv.put(x0 + x + dx, y0 + y, '#000000', 160)


def grate(cv, glow, x0, y0, P, part):
    """The grate over a boss floor's exit (16 x 16, the holes clear) with a skull lock in the middle; its edge 16 x 1."""
    m = P['iron']
    if part == 'side':
        for x in range(16): cv.put(x0 + x, y0, m[1])
        return
    for y in range(16):
        for x in range(16):
            bar = x % 4 == 1 or y % 4 == 1 or x in (0, 15) or y in (0, 15)
            if bar: cv.put(x0 + x, y0 + y, m[2] if (x % 4 == 1 and y % 2 == 0) or y in (0,) else m[1])
    for x, y in ((0, 0), (15, 0), (0, 15), (15, 15)): cv.put(x0 + x, y0 + y, m[3])
    skull = ['.wwww.', 'wwwwww', 'wbwwbw', 'wwwwww', '.wbbw.', '.w.w..']
    for yy, row in enumerate(skull):
        for xx, ch in enumerate(row):
            if ch == 'w': cv.put(x0 + 5 + xx, y0 + 5 + yy, '#e8e0c8')
            elif ch == 'b': cv.put(x0 + 5 + xx, y0 + 5 + yy, '#000000'); glow.put(x0 + 5 + xx, y0 + 5 + yy, '#ff4a3a')
    for x in range(4, 12): cv.put(x0 + x, y0 + 4, m[3]); cv.put(x0 + x, y0 + 11, m[1])


def strip(glow, cv, x0, y0, w, h, col):
    for y in range(h):
        for x in range(w): cv.put(x0 + x, y0 + y, '#000000'); glow.put(x0 + x, y0 + y, col)


def spill(cv, glow, x0, y0, col):
    """Light on the floor out of the gap under the door: 12 x 6, brightest at the leaf (row 0), in three soft bands to nothing."""
    for y in range(6):
        for x in range(12):
            k = (1 - y / 6) * (1 - (abs(x - 5.5) / 6.5) ** 2)
            k = 0.55 if k > 0.6 else 0.3 if k > 0.32 else 0.14 if k > 0.12 else 0
            if k: cv.put(x0 + x, y0 + y, '#000000'); glow.put(x0 + x, y0 + y, mix('#000000', col, k))


# ---------------------------------------------------------------- the layout (the same for every region): name -> (x, y, w, h) in pixels
LAYOUT = {}
def place(name, col, row, w, h): LAYOUT[name] = [col * S, row * S, w, h]
# row 0-1: leaves, whole (12 x 20 in a 16 x 32 slot)
for i, k in enumerate(['closed', 'locked', 'vault', 'barricade', 'charred']): place(f'leaf_{k}', i, 0, 12, 20)
# row 2: leaves, cut (12 x 12)
for i, k in enumerate(['closed', 'locked', 'vault', 'barricade', 'charred']): place(f'leafcut_{k}', i, 2, 12, 12)
# row 3: tops (12 x 2; the barricade's 12 x 4), edges
for i, k in enumerate(['closed', 'locked', 'vault', 'barricade', 'charred']): place(f'top_{k}', i, 3, 12, 4 if k in ('barricade', 'charred') else 2)
place('edge', 5, 0, 2, 20); place('edgecut', 5, 2, 2, 12)
# frame
place('post_face', 6, 0, 2, 25); place('postcut_face', 7, 0, 2, 16); place('post_side', 8, 0, 16, 25); place('postcut_side', 9, 0, 16, 16)
place('post_top', 10, 0, 2, 16)
place('lintel_face', 6, 2, 12, 2); LAYOUT['lintel_top'] = [6 * S, 2 * S + 3, 12, 2]; LAYOUT['lintel_under'] = [6 * S, 2 * S + 6, 12, 2]
place('plaque', 7, 2, 4, 5); LAYOUT['plaque_top'] = [7 * S + 5, 2 * S, 4, 2]
place('plaque_vault', 7, 3, 4, 5); LAYOUT['plaque_vault_top'] = [7 * S + 5, 3 * S, 4, 2]
place('padlock', 8, 2, 4, 5); LAYOUT['padlock_side'] = [8 * S + 5, 2 * S, 2, 5]; LAYOUT['padlock_top'] = [8 * S + 8, 2 * S, 4, 2]
# thresholds (12 x 20) and their edge
for i, k in enumerate(['plain', 'locked', 'vault']): place(f'threshold_{k}', 11 + i, 0, 12, 20)
place('threshold_side', 14, 0, 20, 1)
# light: under the leaf (12 x 1), over it (12 x 2), on the floor (12 x 6); warm and cold
place('strip_warm', 6, 3, 12, 1); LAYOUT['strip_cold'] = [6 * S, 3 * S + 2, 12, 1]
LAYOUT['transom_warm'] = [6 * S, 3 * S + 4, 12, 2]; LAYOUT['transom_cold'] = [6 * S, 3 * S + 7, 12, 2]
place('spill_warm', 9, 2, 12, 6); place('spill_cold', 9, 3, 12, 6)
# secret door: cracks on the wall's face (16 x 24) and cap (16 x 16), three stages
for i in range(3): place(f'crack{i}', i * 1, 4, 16, 24); place(f'crackcap{i}', 3 + i, 4, 16, 16)
# the boss floor's exit
place('grate', 6, 4, 16, 16); place('grate_side', 7, 4, 16, 1)
SHEET_W, SHEET_H = 256, 6 * S


def region_sheets(name):
    P = PAL[name]; cv = Canvas(SHEET_W, SHEET_H); gl = Canvas(SHEET_W, SHEET_H)
    for k in ['closed', 'locked', 'vault', 'barricade', 'charred']:
        x, y, w, h = LAYOUT[f'leaf_{k}']; leaf_face(cv, x, y, 20, P, k, gl)
        x, y, w, h = LAYOUT[f'leafcut_{k}']; leaf_face(cv, x, y, 12, P, k, gl)
        x, y, w, h = LAYOUT[f'top_{k}']; leaf_top(cv, x, y, P, k)
    leaf_edge(cv, *LAYOUT['edge'][:2], 20, P); leaf_edge(cv, *LAYOUT['edgecut'][:2], 12, P)
    post_face(cv, *LAYOUT['post_face'][:2], 25, P); post_face(cv, *LAYOUT['postcut_face'][:2], 16, P)
    post_side(cv, *LAYOUT['post_side'][:2], 25, P); post_side(cv, *LAYOUT['postcut_side'][:2], 16, P)
    post_top(cv, *LAYOUT['post_top'][:2], P)
    capglow = mix('#000000', P['cap'], 0.32)
    x, y, w, h = LAYOUT['post_top']; strip(gl, Canvas(1, 1), x, y, w, h, capglow)
    x, y, w, h = LAYOUT['lintel_top']; strip(gl, Canvas(1, 1), x, y, w, h, capglow)
    for k in ('closed', 'locked'):   # a shut leaf's top glows a little less than the frame: a bar across the doorway in the dark
        x, y, w, h = LAYOUT[f'top_{k}']
        for yy in range(h):
            for xx in range(w): gl.put(x + xx, y + yy, mix('#000000', cv.get(x + xx, y + yy), 0.22))
    lintel(cv, *LAYOUT['lintel_face'][:2], P, 'face'); lintel(cv, *LAYOUT['lintel_top'][:2], P, 'top'); lintel(cv, *LAYOUT['lintel_under'][:2], P, 'under')
    plaque(cv, *LAYOUT['plaque'][:2], P, False, 'face'); plaque(cv, *LAYOUT['plaque_top'][:2], P, False, 'top')
    plaque(cv, *LAYOUT['plaque_vault'][:2], P, True, 'face'); plaque(cv, *LAYOUT['plaque_vault_top'][:2], P, True, 'top')
    padlock(cv, *LAYOUT['padlock'][:2], P, 'face'); padlock(cv, *LAYOUT['padlock_side'][:2], P, 'side'); padlock(cv, *LAYOUT['padlock_top'][:2], P, 'top')
    for k in ['plain', 'locked', 'vault']: threshold(cv, *LAYOUT[f'threshold_{k}'][:2], P, k)
    threshold_side(cv, *LAYOUT['threshold_side'][:2], P)
    strip(gl, cv, *LAYOUT['strip_warm'], P['glow']); strip(gl, cv, *LAYOUT['strip_cold'], COLD)
    strip(gl, cv, *LAYOUT['transom_warm'], mix('#000000', P['glow'], 0.55)); strip(gl, cv, *LAYOUT['transom_cold'], mix('#000000', COLD, 0.55))
    spill(cv, gl, *LAYOUT['spill_warm'][:2], P['glow']); spill(cv, gl, *LAYOUT['spill_cold'][:2], COLD)
    for i in range(3):
        crack(cv, gl, *LAYOUT[f'crack{i}'][:2], 16, 24, P, i); crack(cv, gl, *LAYOUT[f'crackcap{i}'][:2], 16, 16, P, i, cap=True)
    grate(cv, gl, *LAYOUT['grate'][:2], P, 'top'); grate(cv, gl, *LAYOUT['grate_side'][:2], P, 'side')
    # the glow sheet is black where nothing glows (an emissive map), opaque
    g = Image.new('RGBA', (SHEET_W, SHEET_H), (0, 0, 0, 255)); g.alpha_composite(gl.im)
    return cv.im, g


# ---------------------------------------------------------------- the shared effects: sparks, dust, the key, flames (8 x 8 frames; flames 8 x 12)
FX = {}
def fx_sheet():
    cv = Canvas(128, 48); fr = lambda name, i, row, w=8, h=8: FX.setdefault(name, dict(row=row, w=w, h=h, frames=0)).update(frames=i + 1) or (i * w, row)
    import random
    rnd = random.Random(10)
    for i in range(6):   # sparks: a burst that spreads and dims
        x0, y0 = fr('sparks', i, 0)
        for k in range(9 - i):
            a = k / (9 - i) * 6.283 + i * 0.4; r = 0.6 + i * 0.6
            x, y = round(3.5 + r * math.cos(a)), round(3.5 + r * math.sin(a))
            cv.put(x0 + x, y0 + y, '#fff6c8' if i < 3 else '#ffcf6a')
        if i < 2: cv.put(x0 + 3, y0 + 3, '#ffffff'); cv.put(x0 + 4, y0 + 4, '#ffffff')
    for i in range(4):   # dust: a puff that grows and fades
        x0, y0 = fr('dust', i, 8)
        for y in range(8):
            for x in range(8):
                d = math.hypot(x - 3.5, y - 4.5)
                if d < 1.5 + i and rnd.random() < 0.75 - i * 0.15: cv.put(x0 + x, y0 + y, '#9a9488' if d < 1 + i else '#6a665e', 255)
    key = ['......', 'oooo..', 'o..ooo', 'oooo.o', '......']
    for i in range(4):   # the key: comes to the lock, goes in, turns, the lock opens (a spark)
        x0, y0 = fr('key', i, 16)
        if i < 3:
            for yy, row in enumerate(key if i < 2 else ['..o...', '.ooo..', '.o.o..', '.ooo..', '..o...']):
                for xx, ch in enumerate(row):
                    if ch == 'o': cv.put(x0 + xx + (2 - i if i < 2 else 1), y0 + yy + 1, '#e8c050' if (xx + yy) % 2 else '#b88a20')
        else:
            for x, y in ((3, 3), (4, 4), (2, 4), (4, 2), (3, 5), (5, 3)): cv.put(x0 + x, y0 + y, '#fff6c8')
    for i in range(3):   # flames for the burning barricade
        x0, y0 = fr('flame', i, 24, 8, 12)
        for y in range(12):
            for x in range(8):
                w_ = 3.5 - abs(x - 3.5 + math.sin(y * 0.9 + i * 2) * 0.8)
                if w_ > (11 - y) * 0.28 and rnd.random() < 0.9:
                    cv.put(x0 + x, y0 + y + 0, '#fff0a0' if w_ > 2.6 else '#ffb030' if w_ > 1.4 else '#e04a10')
    return cv.im


def main():
    os.makedirs(OUT + 'doors', exist_ok=True)
    for name in REGIONS:
        im, g = region_sheets(name)
        im.save(OUT + f'doors/doors-{name}.png', optimize=True); g.save(OUT + f'doors/doors-{name}-glow.png', optimize=True)
    fx_sheet().save(OUT + 'doors/doors-fx.png', optimize=True)
    print('door sheets ok')
    return LAYOUT, FX


if __name__ == '__main__':
    main()
