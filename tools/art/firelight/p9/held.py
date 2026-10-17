# Firelight · part 9: where the weapon is in every frame. For each class, facing (part 8's side, front and back sheets) and armour
# tier, the hand that holds it in each of the 21 frames of the hero sheet; for each way of fighting (style) the weapon's angle, layer
# (in front of the body or behind it) and shift in each frame; and the trail of the blow, drawn into row 1 of every weapon sheet.
# Writes assets/weapons/held/held.json (and finishes the weapon sheets that weapons.py starts).
import json, math, re
from PIL import Image
import c9
from c9 import CLASSES, FACINGS, TIERS, COLS, FW, FH, CELL, GRIP, ANGLES, hx, blank, save, out, sheet, cell
import weapons

# How each weapon is fought with (its item picture's index in items.png is kept for reference).
WEAPONS = {
    'knuckles': ('fist', 16), 'dagger': ('stab', 19), 'shortSword': ('slash', 2), 'sword': ('slash', 20), 'longsword': ('slash', 21),
    'quarterstaff': ('staff', 17), 'spear': ('stab', 29), 'mace': ('blunt', 18), 'battleAxe': ('slash', 22), 'warHammer': ('blunt', 23),
    'glaive': ('slash', 30), 'pickaxe': ('blunt', 101),
    'dart': ('throw', 31), 'curare': ('throw', 109), 'incendiary': ('throw', 108), 'javelin': ('throw', 110), 'shuriken': ('throw', 15),
    'tomahawk': ('throw', 107), 'boomerang': ('throw', 106),
}
ITEM_KIND = {k: ('missile.' if WEAPONS[k][0] == 'throw' else 'weapon.') + k for k in WEAPONS}

HIDDEN = {8, 9, 10, 11, 12, 16, 17, 19, 20}   # the tomb, operate and read: the hands are busy, the weapon is put away
ATTACK = (13, 14, 15)

# The hand that holds the weapon, frame by frame, on the body every class and tier shares (PD's body; part 8's front and back are
# built on it). From the side it is the forward hand; from the front and the back the hand of the arm that strikes (screen left).
HANDS = {
    'side': {0: (10, 11), 1: (10, 11), 2: (10, 11), 3: (10, 11), 4: (10, 12), 5: (10, 11), 6: (11, 10), 7: (11, 10), 13: (11, 10), 14: (11, 10), 15: (9, 9), 18: (11, 10)},
    'front': {0: (2, 11), 1: (2, 11), 2: (2, 11), 3: (2, 10), 4: (2, 11), 5: (2, 10), 6: (2, 9), 7: (2, 10), 13: (2, 8), 14: (4, 11), 15: (3, 10), 18: (2, 11)},
    'back': {0: (2, 11), 1: (2, 11), 2: (2, 11), 3: (2, 10), 4: (2, 11), 5: (2, 10), 6: (2, 9), 7: (2, 10), 13: (2, 7), 14: (3, 9), 15: (2, 10), 18: (2, 11)},
}

# Angle (degrees, 0 = up, clockwise; mirrored with the side view), layer, shift (dx, dy) and trail, by style and facing.
F, B = 'front', 'back'
HOLD = {  # idle, run, fly, and a zap of a wand with the weapon in the other hand
    'side': dict(slash=45, blunt=45, stab=0, staff=0, throw=0, fist=90),
    'front': dict(slash=315, blunt=315, stab=0, staff=0, throw=0, fist=180),
    'back': dict(slash=315, blunt=315, stab=0, staff=0, throw=0, fist=180),
}
def P(a, l=F, dx=0, dy=0, trail=False): return dict(a=a, l=l, dx=dx, dy=dy, **({'trail': True} if trail else {}))
STRIKE = {  # the attack, frames 13 (wind-up), 14 (the blow), 15 (back)
    'slash': {'side': [P(0), P(135, trail=True), P(90)], 'front': [P(0), P(135, trail=True), P(180)], 'back': [P(315), P(0, B, dy=-3), P(180)]},
    'blunt': {'side': [P(0, dy=-1), P(135, trail=True), P(180)], 'front': [P(0, dy=-1), P(180, trail=True), P(180)], 'back': [P(315), P(0, B, dy=-3), P(180)]},
    'stab': {'side': [P(90, dx=-2), P(90, dx=1, trail=True), P(90)], 'front': [P(0, dy=-1), P(180, dy=1, trail=True), P(0)], 'back': [P(0, dy=1), P(0, B, dy=-3), P(0)]},
    'staff': {'side': [P(45, dx=-1), P(90, dx=1, trail=True), P(45)], 'front': [P(315), P(180, dy=1, trail=True), P(0)], 'back': [P(315), P(0, B, dy=-3), P(0)]},
    'throw': {'side': [P(0, dy=-1), None, None], 'front': [P(0, dy=-1), None, None], 'back': [P(0, dy=-1), None, None]},   # gone from the hand at 14
    'fist': {'side': [P(90), P(90), P(90)], 'front': [P(0), P(180), P(180)], 'back': [P(0), None, P(180)]},
}
STYLES = list(STRIKE)
DIR = {0: (0, -1), 45: (1, -1), 90: (1, 0), 135: (1, 1), 180: (0, 1), 225: (-1, 1), 270: (-1, 0), 315: (-1, -1)}


def poses(style, facing):
    """The 21 frames of the attack animation (and of every other) for a style and facing: a pose, or None where the weapon is put away."""
    out_ = []
    for f in range(COLS):
        if f in HIDDEN: out_.append(None)
        elif f in ATTACK: out_.append(STRIKE[style][facing][f - 13])
        else: out_.append(P(HOLD[facing][style], B if (facing == 'back' and f == 14) else F))
    return out_


def hold_poses(style, facing):
    """The same frames when the animation is a zap (a wand, the weapon held still) or a throw of something else."""
    return [None if f in HIDDEN else P(HOLD[facing][style], B if (facing == 'back' and f == 14) else F) for f in range(COLS)]


def body_sheet(cls, facing): return sheet(f'{cls}.png' if facing == 'side' else f'dirs/{cls}-{facing}.png')


def hands(cls, facing, sh):
    """The template hand for each frame and tier, moved to the nearest pixel of the body where the template falls on a clear one
    (a pixel nearer the middle first, then up, then by column: the same answer every run)."""
    rows = []
    for t in range(TIERS):
        row = []
        for f in range(COLS):
            h = HANDS[facing].get(f)
            if h is None: row.append(None); continue
            px = cell(sh, f, t).load()
            if px[h][3] == 0:
                near = sorted(((x, y) for y in range(FH) for x in range(FW) if px[x, y][3] and abs(x - h[0]) <= 1 and abs(y - h[1]) <= 1),
                              key=lambda q: (abs(q[0] - h[0]) + abs(q[1] - h[1]), abs(q[0] - 6), q[1], q[0]))
                h = near[0] if near else h
            row.append(list(h))
        rows.append(row)
    return rows


def put(sh, im, col, row): sh.alpha_composite(im, (col * CELL, row * CELL))


TRAIL = ['#ffffff', '#f2ecd8', '#d9d0b8', '#b8ae96']   # bright at the blade, fading (opaque: the sprite batch cuts at one half)


def arc(a0, a1, r):
    """The arc the tip sweeps from angle a0 to a1 (clockwise), r pixels out, the last bit (where the blade is now) left out."""
    span = (a1 - a0) % 360 or 360
    pts, seen = [], set()
    n = max(8, int(span / 4))
    for i in range(n + 1):
        t = math.radians(a0 + span * i / n)
        x, y = round(GRIP + r * math.sin(t)), round(GRIP - r * math.cos(t))
        if (x, y) not in seen and 0 <= x < CELL and 0 <= y < CELL: seen.add((x, y)); pts.append((x, y))
    return pts[:-1]


def slash_trail(a0, a1, reach):
    im = blank(CELL, CELL); px = im.load(); r = min(7.6, reach + 0.6)
    span = (a1 - a0) % 360 or 360
    pts = arc(a1 - min(span, 100), a1, r); n = len(pts)       # the last 100 degrees of the swing
    for i, (x, y) in enumerate(pts):
        k = (n - 1 - i) / max(1, n - 1)            # 0 at the blade, 1 at the start of the swing
        if k > 0.75 and i % 2: continue            # the far end dotted
        px[x, y] = hx(TRAIL[min(3, int(k * 4))]) + (255,)
    for i, (x, y) in enumerate(pts[-3:]):          # the inner edge near the blade: two pixels thick there
        ix, iy = GRIP + round((x - GRIP) * 0.82), GRIP + round((y - GRIP) * 0.82)
        if (ix, iy) != (GRIP, GRIP) and px[ix, iy][3] == 0: px[ix, iy] = hx(TRAIL[1]) + (255,)
    return im


def stab_trail(angle, reach):
    """Speed lines either side of the shaft, behind the tip, drawn pointing up (or on the diagonal) and turned like the weapon."""
    im = blank(CELL, CELL); px = im.load(); diag = angle % 90 != 0
    for side in (1, -1):
        for k, a in enumerate(range(max(1, reach - 4), reach - 1)):
            if (k + (side > 0)) % 2: continue
            x, y = (a + side, side - a) if diag else (side, -a)
            px[GRIP + x, GRIP + y] = hx(TRAIL[2 - min(2, k)]) + (255,)
    return weapons.turned(im, angle // 90)


def trails(kind):
    style = WEAPONS[kind][0]; reach = weapons.tip(kind); cells = {}
    for i, fc in enumerate(FACINGS):
        s13, s14 = STRIKE[style][fc][0], STRIKE[style][fc][1]
        if not s14 or not s14.get('trail'): continue
        cells[fc] = stab_trail(s14['a'], reach) if style in ('stab',) else slash_trail(s13['a'], s14['a'], reach) if s13['a'] != s14['a'] else stab_trail(s14['a'], reach)
    return cells


def main():
    data = dict(
        version=1,
        note='Part 9: the weapon in the hand. PD 1.9 draws no weapon on the hero; here the equipped weapon (or the thrown weapon a huntress or a rogue '
             'holds) is a second picture at the hand, frame by frame, in each of part 8\'s three facings.',
        cell=[CELL, CELL], grip=[GRIP, GRIP], angles=ANGLES,
        sheet=dict(row0='columns 0-7: the weapon at angles[i]', row1='the trail of the blow (frame 14): column 0 side, 1 front, 2 back', path='weapons/held/<weapon>.png'),
        place='the weapon cell\'s pixel (8, 8) goes on the hand\'s pixel of the hero frame, moved by the pose\'s (dx, dy); the side view mirrors the whole '
              '(angle a becomes 360 - a: the picture is flipped with the hero\'s); the grip pixel is clear, so the hand of the body shows round the handle',
        layer='front: drawn after the body and its hat (a hand on the costume, a raised blade over the hat); back: drawn before the body',
        hidden='frames 8-12 (the tomb), 16-17 (operate) and 19-20 (read): no weapon',
        anims=dict(attack='poses[style][facing].attack', zap='poses[style][facing].hold: a wand zaps from the other hand, the weapon is held still',
                   throw='a thrown weapon that is the one in the hand: poses.throw.attack (gone from the hand from frame 14; the boomerang is back when it returns)',
                   other='every other animation: hold (its frames carry the hand)'),
        weapons={k: dict(kind=ITEM_KIND[k], style=s, item=i, reach=weapons.tip(k), flat=k in weapons.FLAT, sheet=f'weapons/held/{k}.png') for k, (s, i) in WEAPONS.items()},
        styles={'slash': 'swords, the axe, the glaive: raised behind, cut down across, a trail along the arc',
                'blunt': 'mace, war hammer, pickaxe: raised high, brought straight down',
                'stab': 'dagger, spear: drawn back, thrust along itself (at the camera from the front, away from it from behind)',
                'staff': 'quarterstaff: held upright, swung and jabbed',
                'throw': 'stones, darts, shuriken, tomahawk, javelin, boomerang: in the raised hand at 13, gone at 14',
                'fist': 'knuckles: on the fist, the punch is PD\'s own'},
        poses={s: {fc: dict(attack=poses(s, fc), hold=hold_poses(s, fc)) for fc in FACINGS} for s in STYLES},
        hands={},
    )
    for cls in CLASSES:
        data['hands'][cls] = {fc: hands(cls, fc, body_sheet(cls, fc)) for fc in FACINGS}
    for kind in WEAPONS:
        sh = Image.open(c9.OUT + f'weapons/held/{kind}.png').convert('RGBA')
        for i, fc in enumerate(FACINGS):
            sh.paste(blank(CELL, CELL), (i * CELL, CELL))
        for fc, im in trails(kind).items(): put(sh, im, FACINGS.index(fc), 1)
        save(sh, f'weapons/held/{kind}.png')
    text = json.dumps(data, ensure_ascii=False, indent=1)
    text = re.sub(r'\[\s*([-\d]+),\s*([-\d]+)\s*\]', r'[\1, \2]', text)                   # [x, y] on one line
    text = re.sub(r'\{\s*("a": [^{}]*?)\s*\}', lambda m: '{' + re.sub(r'\s*\n\s*', ' ', m.group(1)) + '}', text)   # a pose on one line
    open(out('weapons/held/held.json'), 'w').write(text + '\n')
    print('held.json ok')


if __name__ == '__main__':
    main()
