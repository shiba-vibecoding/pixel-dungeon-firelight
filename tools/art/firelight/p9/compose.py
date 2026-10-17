# Firelight · part 9: a hero frame with its weapon, as the game draws it (the weapon behind the body, the body, its hat, the weapon in
# front), for previews and the rules sheet. M pixels of margin round the 12 x 15 frame hold the weapon.
import json
from PIL import Image
import c9
from c9 import FW, FH, CELL, GRIP, ANGLES, blank, cell

M = 9
_cache = {}


def img(path):
    if path not in _cache: _cache[path] = Image.open(path).convert('RGBA')
    return _cache[path]


def held(): return json.load(open(c9.OUT + 'weapons/held/held.json'))


def body_path(cls, facing, look=None):
    if look:
        leg = look in ('forgeborn', 'starflame', 'smoulder', 'wildfire')
        b = f'mart/fl/{"legendary" if leg else "looks"}/{cls}-{look}'
        return c9.SRC + (f'{b}.png' if facing == 'side' else f'{b}-{facing}.png')
    return c9.SRC + (f'{cls}.png' if facing == 'side' else f'dirs/{cls}-{facing}.png')


def compose(H, cls, facing, tier, frame, kind, anim='attack', look=None, hat=None, flip=False, trail=True):
    o = blank(FW + 2 * M, FH + 2 * M)
    body = cell(img(body_path(cls, facing, look)), frame, tier)
    W = H['weapons'].get(kind) if kind else None
    pose = hand = None
    if W:
        pz = H['poses'][W['style']][facing]['hold' if anim in ('zap', 'idle', 'run') else 'attack']
        pose = pz[frame]; hand = H['hands'][cls][facing][tier][frame]
    def weapon(layer):
        if not pose or not hand or pose['l'] != layer: return
        sh = img(c9.OUT + W['sheet']); col = ANGLES.index(pose['a'])
        x, y = M + hand[0] + pose['dx'] - GRIP, M + hand[1] + pose['dy'] - GRIP
        o.alpha_composite(sh.crop((col * CELL, 0, col * CELL + CELL, CELL)), (x, y)) if x >= 0 and y >= 0 else paste(sh.crop((col * CELL, 0, col * CELL + CELL, CELL)), x, y)
        if trail and pose.get('trail'):
            tc = ['side', 'front', 'back'].index(facing)
            paste(sh.crop((tc * CELL, CELL, tc * CELL + CELL, 2 * CELL)), x, y)
    def paste(im, x, y):
        t = blank(o.width, o.height); t.paste(im, (x, y), im); o.alpha_composite(t)
    weapon('back')
    o.alpha_composite(body, (M, M))
    if hat:
        hs = img(c9.SRC + (f'mart/fl/hats/{cls}-{hat}.png' if facing == 'side' else f'mart/fl/hats/{cls}-{hat}-{facing}.png'))
        paste(hs.crop((frame * 16, tier * 22, frame * 16 + 16, tier * 22 + 22)), M - 2, M - 7)
    weapon('front')
    return o.transpose(Image.FLIP_LEFT_RIGHT) if flip else o
