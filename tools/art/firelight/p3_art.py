# Firelight · part 3 art for the HD-2D renderer: emissive and roughness maps for tiles0-4, the wall kit (caps by neighbour
# mask, faces, chasm edges, AO decals), ripple, particles, and the items' glow.
import json, colorsys, numpy as np
from PIL import Image
import os
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..')
A = os.path.join(ROOT, 'packages/client/public/assets') + '/'
O = A + 'hd2d/'   # run p3_kit.py first
kit = json.load(open(O + 'hd2d-kit.json'))
REG = ['sewers', 'prison', 'caves', 'city', 'halls']
TRAPS = [17, 19, 21, 27, 30, 32, 37, 39]
H = lambda s: np.array([int(s.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4)])
def cell(a, i): return a[(i // 16) * 16:(i // 16) * 16 + 16, (i % 16) * 16:(i % 16) * 16 + 16]
def hsv(p): return colorsys.rgb_to_hsv(*(p[:3] / 255))
def save(a, name): Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA').save(O + name, optimize=True)

for r, name in enumerate(REG):
    reg = kit['regions'][name]
    src = np.array(Image.open(A + f'tiles{r}.png').convert('RGBA')).astype(int)
    em = np.zeros_like(src); ro = np.zeros_like(src)
    glow = {int(k): v for k, v in reg['emissive'].items() if k != 'traps'}
    for t in TRAPS: glow.setdefault(t, None)
    mats = {}
    for mname, m in kit['materials'].items():
        mm = dict(m); mm.update(reg.get('override', {}).get(mname, {}))
        for t in m['tiles']: mats.setdefault(t, mm)
    for half in (0, 64):
        for t in range(64):
            i = t + half
            c = cell(src, i); e = cell(em, i); rr = cell(ro, i)
            # roughness: the material's, a little smoother on the tile's brightest pixels (wet or polished highlights)
            base = mats.get(t, kit['materials']['floor'])['roughness']
            for y in range(16):
                for x in range(16):
                    p = c[y, x]
                    if p[3] == 0: continue
                    h_, s_, v_ = hsv(p)
                    rv = base - 0.12 * (v_ - 0.5)
                    if name == 'caves' and t == 12 and s_ > 0.45 and v_ > 0.55: rv = 0.3   # gold ore
                    g = int(np.clip(rv, 0, 1) * 255); rr[y, x] = (g, g, g, 255)
                    if t in glow:
                        tint = glow[t]
                        if t == 12 and name == 'prison':
                            on = v_ > 0.7 and 4 <= x <= 11 and 3 <= y <= 12   # moonlight through the bars
                        elif t == 63 and name == 'halls':
                            on = True
                        else:
                            on = s_ > 0.42 and v_ > 0.42
                        if on:
                            col = p[:3] if tint is None else (p[:3] * 0.45 + H(tint) * 0.55)
                            e[y, x] = (*np.clip(col * 1.1, 0, 255).astype(int), int(np.clip(90 + v_ * 165, 0, 255)))
    save(em, f'tiles{r}-emissive.png'); save(ro, f'tiles{r}-rough.png')

    # ---------------------------------------------------------- the wall kit
    wall = cell(src, 4).copy(); deco = cell(src, 12).copy(); floor = cell(src, 1).copy()
    lum = lambda a: (a[..., :3] @ np.array([.299, .587, .114]))
    cols = wall[wall[..., 3] > 0][:, :3]; order = np.argsort(cols @ np.array([.299, .587, .114]))
    darkest, brightest = cols[order[0]], cols[order[-1]]
    mid = cols[order[len(order) // 2]]
    kitimg = np.zeros((32, 256, 4), int)
    # the cap: the wall's own stones, darker and flatter, seen from above
    # the cap: flat slabs in the wall's own stone, darker than its face (a top in shade), mortar from its darkest colour
    rng = np.random.default_rng(r + 7)
    cap = np.zeros((16, 16, 4), int); cap[..., 3] = 255
    base_c = (mid * 0.72 + darkest * 0.12).astype(int); hi_c = (mid * 0.82 + brightest * 0.08).astype(int); mort = (darkest * 0.75).astype(int)
    for y in range(16):
        for x in range(16):
            sx = (x + (4 if (y // 8) % 2 else 0)) % 8
            if y % 8 == 7 or sx == 7: cap[y, x, :3] = mort
            else:
                cap[y, x, :3] = hi_c if (sx < 2 and y % 8 < 2) else base_c
                if rng.random() < 0.12: cap[y, x, :3] = (base_c * 0.88).astype(int)
    for m in range(16):
        t = cap.copy()
        n, e_, s, w = m & 1, m & 2, m & 4, m & 8
        if n: t[0, :, :3] = (11, 11, 9); t[1, :, :3] = (darkest * 0.9).astype(int)
        if s: t[15, :, :3] = (11, 11, 9); t[14, :, :3] = brightest; t[13, :, :3] = (brightest * 0.8 + mid * 0.2).astype(int)
        if e_: t[:, 15, :3] = (11, 11, 9); t[:, 14, :3] = (mid * 0.9 + brightest * 0.1).astype(int)
        if w: t[:, 0, :3] = (11, 11, 9); t[:, 1, :3] = (mid * 0.9 + brightest * 0.1).astype(int)
        for (yy, xx, a_, b_) in ((0, 0, n, w), (0, 15, n, e_), (15, 0, s, w), (15, 15, s, e_)):
            if a_ and b_: t[yy, xx, 3] = 0
        kitimg[0:16, m * 16:m * 16 + 16] = t
    def face(src_t):
        f = src_t.copy()
        f[0, :, :3] = brightest                       # the edge where the face meets the cap catches the light
        f[14, :, :3] = (f[14, :, :3] * 0.7).astype(int); f[15, :, :3] = (f[15, :, :3] * 0.5).astype(int)   # skirting
        return f
    kitimg[16:32, 0:16] = face(wall); kitimg[16:32, 16:32] = face(deco)
    up = wall.copy(); up[0, :, :3] = brightest; kitimg[16:32, 32:48] = up         # the upper half-cell of a 1.5 face
    sk = wall.copy(); sk[..., :3] = (sk[..., :3] * 0.8).astype(int); kitimg[16:32, 48:64] = sk   # a face in shadow
    for k, v in enumerate((1.0, 0.85)):          # chasm edges: the floor's lip, then stone falling into the dark
        ch = np.zeros((16, 16, 4), int)
        ch[0:2] = floor[0:2]; ch[2, :, :3] = brightest
        for y in range(3, 16):
            row = wall[(y + k * 5) % 16].copy(); f_ = max(0.0, 1 - (y - 3) / 12.0) * v
            row[:, :3] = (row[:, :3] * f_).astype(int); ch[y] = row
        ch[..., 3] = 255
        kitimg[16:32, 64 + k * 16:80 + k * 16] = ch
    for k, side in enumerate(('N', 'E', 'S', 'W', 'C')):   # contact shadows on the floor along a wall
        ao = np.zeros((16, 16, 4), int)
        for y in range(16):
            for x in range(16):
                d = {'N': y, 'E': 15 - x, 'S': 15 - y, 'W': x, 'C': min(y, x)}[side]
                a_ = [150, 110, 70, 40, 18][d] if d < 5 else 0
                ao[y, x] = (0, 0, 0, a_)
        kitimg[16:32, 128 + k * 16:144 + k * 16] = ao
    save(kitimg, f'walls{r}.png')

# ---------------------------------------------------------- ripple (6 frames) and particles (12 frames of 8x8)
rip = np.zeros((16, 96, 4), int)
for f in range(6):
    rad = 1.5 + f * 1.25; a_ = [255, 230, 190, 150, 100, 55][f]
    for y in range(16):
        for x in range(16):
            d = ((x - 7.5) ** 2 + (y - 7.5) ** 2) ** 0.5
            if abs(d - rad) < 0.6: rip[y, f * 16 + x] = (255, 255, 255, a_)
            elif f < 2 and abs(d - rad * 0.5) < 0.5: rip[y, f * 16 + x] = (255, 255, 255, a_ // 2)
save(rip, 'ripple.png')
P = [
 ['...#....', '...#....', '...#....', '..###...', '..###...', '...#....', '........', '........'],   # drip
 ['..++++..', '.++++++.', '++++++++', '++++++++', '.++++++.', '..++++..', '........', '........'],   # mist (half alpha)
 ['........', '........', '...#....', '..###...', '...#....', '........', '........', '........'],   # dust
 ['........', '...#....', '..###...', '..###...', '...+....', '...+....', '........', '........'],   # ember (with tail)
 ['........', '........', '..##....', '...##...', '........', '........', '........', '........'],   # ash
 ['........', '...+....', '..+#+...', '...+....', '........', '........', '........', '........'],   # spore
 ['..+.+...', '.++++++.', '+++#+++.', '.+++++++', '..+++++.', '...+.+..', '........', '........'],   # steam
 ['...#....', '...#....', '#######.', '...#....', '...#....', '........', '........', '........'],   # spark
 ['..###...', '.#...#..', '.#...#..', '.#...#..', '..###...', '........', '........', '........'],   # bubble
 ['...#....', '..+#+...', '#######.', '..+#+...', '.#.#.#..', '...#....', '........', '........'],   # magic
 ['........', '..#.#...', '...#....', '........', '........', '........', '........', '........'],   # fly
 ['..+++...', '.+++++..', '+++++++.', '+++++++.', '.+++++..', '..+++...', '........', '........'],   # smoke
]
pa = np.zeros((8, 8 * len(P), 4), int)
for k, rows in enumerate(P):
    for y, rr_ in enumerate(rows):
        for x, ch in enumerate(rr_):
            if ch == '#': pa[y, k * 8 + x] = (255, 255, 255, 255)
            elif ch == '+': pa[y, k * 8 + x] = (255, 255, 255, 110 if (x + y) % 2 == 0 else 60)
save(pa, 'particles.png')
# ---------------------------------------------------------- the items' glow: wand gems, rings, potions, the amulet, the torch
it = np.array(Image.open(A + 'items.png').convert('RGBA')).astype(int); ie = np.zeros_like(it)
MAGIC = {**{i: 1.0 for i in [3] + list(range(48, 56)) + [68, 69, 70, 71]}, **{i: 1.0 for i in list(range(32, 40)) + [72, 73, 74, 75]},
         **{i: 0.6 for i in range(56, 68)}, 87: 1.0, 84: 1.0}
for i, k in MAGIC.items():
    c = it[(i // 8) * 16:(i // 8) * 16 + 16, (i % 8) * 16:(i % 8) * 16 + 16]; e = ie[(i // 8) * 16:(i // 8) * 16 + 16, (i % 8) * 16:(i % 8) * 16 + 16]
    for y in range(16):
        for x in range(16):
            p = c[y, x]
            if p[3] < 200: continue
            h_, s_, v_ = hsv(p)
            if s_ > 0.5 and v_ > 0.55: e[y, x] = (*p[:3], int(255 * k * min(1, v_ + 0.1)))
save(ie, 'items-emissive.png')
print('p3 art ok')
