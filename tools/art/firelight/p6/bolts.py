# Firelight · part 6: wand bolts of PD 1.9 (fly + hit), the beam and the lightning arc, and thrown weapons.
# A bolt points right; the renderer turns it along its path (2D: canvas rotate; 3D: a billboard turned about the view axis).
import json, math, random
from PIL import Image
from px import *

FX = {}
K = dict(  # the kit's bolt colours (hd2d-kit.json bolts) for the light
    magic=('#e8e2ff', '#b8a8ff', 3, 3), fire=('#ffcc66', '#ff7a2a', 5, 4), lightning=('#ffffff', '#9fd8ff', 8, 6), poison=('#9be36a', '#5aff3a', 2, 3),
    slow=('#c8a8ff', '#8a6aff', 2, 3), beam=('#ff5aff', '#c83aff', 4, 4), regrowth=('#7fdc4a', '#5ac83a', 2, 3), teleport=('#7fd6ff', '#4ab8ff', 2, 3),
    blink=('#ffffff', '#d8e4ff', 2, 3), amok=('#ff4a4a', '#ff2a2a', 2, 3), rocks=('#c8b8a0', None, 0, 0), flock=('#ffffff', None, 0, 0),
    reach=('#b8d8ff', '#8ab8ff', 1.5, 3), shadow=('#b050d0', '#7a2aa0', 2, 3))
NAMES = dict(magic=('Magic Missile', 'Волшебный заряд'), fire=('Firebolt', 'Огненная стрела'), lightning=('Lightning', 'Молния'), poison=('Poison', 'Яд'),
             slow=('Slowness', 'Замедление'), beam=('Disintegration', 'Распад'), regrowth=('Regrowth', 'Рост'), teleport=('Teleportation', 'Телепортация'),
             blink=('Blink', 'Скачок'), amok=('Amok', 'Бешенство'), rocks=('Avalanche', 'Камнепад'), flock=('Flock', 'Стадо'), reach=('Reach', 'Досягаемость'),
             shadow=('Shadow bolt (warlock)', 'Теневой заряд (чернокнижник)'))
H = lambda *cs: [hx(c) for c in cs]


def fly(kind, k):
    """Frame k (0-3) of a bolt in flight, 16 x 16, its head at (10, 8)."""
    c = Cv(16, 16); R = random.Random(kind.__hash__() if False else sum(map(ord, kind)) * 31 + k)
    cx, cy = 10, 8
    if kind == 'magic':
        for i in range(4):
            x = cx - 3 - i * 2 - (k % 2); y = cy + R.choice((-1, 0, 1)); c.put(x, y, H('#b8a8ff')[0] if i < 2 else H('#6a5ac0')[0], 255 - i * 50)
        if k % 2 == 0: c.plus(cx - 6, cy + R.choice((-2, 2)), H('#e8e2ff')[0], 1, 200)
        c.glow(cx, cy, 3.2 + (k % 2) * 0.4, H('#ffffff', '#e8e2ff', '#b8a8ff', '#6a5ac0'))
    elif kind == 'fire':
        ramp = H('#fff6c8', '#ffcc66', '#ff7a2a', '#c0301a')
        for i in range(7):
            x = cx - 2 - i * 1.3; y = cy + math.sin(i * 1.3 + k * 1.6) * (1 + i * 0.35)
            c.disc(x, y, max(0.6, 2.6 - i * 0.35), ramp[min(3, 1 + i // 2)])
        for i in range(2): c.put(cx - 9 - i * 2 - k % 2, cy + R.choice((-2, -1, 1)), H('#4a3a34')[0], 180)
        c.glow(cx, cy, 3.6, ramp)
    elif kind == 'poison':
        ramp = H('#e0ffb0', '#9be36a', '#4aa82a', '#1f5f14')
        for i in range(3): c.disc(cx - 4 - i * 2.2, cy + (i % 2) * 0.6, 1.6 - i * 0.4, ramp[2])
        for i in range(2): c.put(cx - 3 - i * 4 - k, cy + 3 + i + (k % 2), ramp[2])
        c.glow(cx, cy, 3.4, ramp, sq=0.85 + (k % 2) * 0.15)
    elif kind == 'slow':
        ramp = H('#f4ecff', '#c8a8ff', '#8a6aff')
        c.ring(cx, cy, 4, ramp[2], 160, gap=(4, 2))
        for j in range(2):
            t = k * 1.57 + j * 3.14; c.disc(cx + math.cos(t) * 4, cy + math.sin(t) * 3, 1.2, ramp[1])
        c.glow(cx, cy, 2.2, ramp)
    elif kind == 'teleport':
        ramp = H('#ffffff', '#7fd6ff', '#4ab8ff')
        for j in range(4):
            t = k * 0.8 + j * 1.57; c.plus(cx + math.cos(t) * 4, cy + math.sin(t) * 4, ramp[1], 1 if (j + k) % 2 else 0, 230, ramp[2])
        c.glow(cx, cy, 2, ramp)
        for i in range(3): c.put(cx - 6 - i * 2, cy + R.choice((-1, 0, 1)), ramp[2], 200 - i * 50)
    elif kind == 'blink':
        for x in range(2, 14):
            a = int(80 + (x - 2) * 14); c.put(x, cy, H('#ffffff')[0], a); c.put(x, cy - 1 if x % 2 == k % 2 else cy + 1, H('#d8e4ff')[0], a // 2)
        c.glow(13, cy, 2, H('#ffffff', '#d8e4ff'))
    elif kind == 'shadow':
        ramp = H('#1a0a20', '#3a1050', '#7a2aa0', '#b050d0')
        for i in range(5): c.disc(cx - 3 - i * 1.6, cy + math.sin(i + k) * 1.2, 1.8 - i * 0.3, ramp[1 + min(2, i // 2)], 220 - i * 30)
        c.glow(cx, cy, 3.6, list(reversed(ramp))[::-1])   # dark core, violet rim
        c.disc(cx, cy, 1.4, ramp[0])
    elif kind == 'amok':
        ramp = H('#ffe0e0', '#ff4a4a', '#a8141e')
        for j in range(4):
            t = k * 0.785 + j * 1.57; c.line(cx + math.cos(t) * 3, cy + math.sin(t) * 3, cx + math.cos(t) * 6, cy + math.sin(t) * 6, ramp[1])
        c.glow(cx, cy, 3, ramp)
        for i in range(3): c.put(cx - 7 - i * 2, cy + R.choice((-1, 1)), ramp[2], 200)
    elif kind == 'reach':
        ramp = H('#ffffff', '#b8d8ff', '#6a8ac8')
        c.ring(cx, cy, 4.5, ramp[1], 255, w=1.5, gap=(3, 1)); c.ring(cx, cy, 2.5, ramp[2], 200)
        c.put(cx, cy, ramp[0])
        for i in range(4): c.put(cx - 6 - i * 2, cy + (1 if (i + k) % 2 else -1), ramp[2], 200 - i * 40)
    elif kind == 'regrowth':
        ramp = H('#e8ffc0', '#7fdc4a', '#3a8a2a', '#245a1a')
        for j in range(2):
            t = k * 1.2 + j * 3.14; x, y = cx + math.cos(t) * 3, cy + math.sin(t) * 3
            c.disc(x, y, 1.6, ramp[1]); c.put(x + math.cos(t), y + math.sin(t), ramp[0])
        c.glow(cx, cy, 2, H('#fff6c8', '#ccaa40'))
        for i in range(3): c.put(cx - 6 - i * 2, cy + R.choice((-1, 0, 1)), ramp[2], 200)
    elif kind == 'flock':
        w, g = hx('#ffffff'), hx('#c8c8c0')
        for dx, dy, r in ((-3, 1, 2.6), (0, -1, 3.2), (3, 1, 2.6)): c.disc(cx - 1 + dx, cy + dy + (k % 2) * 0.5, r, g)
        for dx, dy, r in ((-3, 0, 2), (0, -2, 2.6), (3, 0, 2)): c.disc(cx - 1 + dx, cy + dy + (k % 2) * 0.5, r, w)
    elif kind == 'rocks':     # falls from above: the rock turns as it drops
        rk = Cv(8, 8); base = H('#8a8478', '#5a554c', '#c8b8a0', '#2a2622')
        rk.disc(4, 4, 3.4, base[1]); rk.disc(3.4, 3.4, 2.6, base[0]); rk.put(2, 2, base[2]); rk.put(3, 2, base[2])
        im = rk.im.rotate(-90 * k); c.blit(im, 4, 4)
        for i in range(2): c.put(8 + i * 2, 1 + i * 2 - (k % 2), base[2], 160)
    return c.im


def hit(kind):
    """The burst where a bolt lands: 5 frames 16 x 16 (fire: 6 frames 32 x 32)."""
    fr = []
    if kind == 'fire':
        ramp = H('#fff6c8', '#ffcc66', '#ff7a2a', '#c0301a', '#6a1410')
        for f in range(6):
            c = Cv(32, 32); r = [3, 6, 9, 10, 9, 7][f]; R = random.Random(f * 7)
            if f >= 3:
                for i in range(8): c.disc(16 + R.uniform(-8, 8), 14 - (f - 3) * 3 + R.uniform(-4, 4), R.uniform(1.5, 3), hx('#3a302c'), 200)
            if f < 5: c.glow(16, 17, r, ramp[f // 2:] if f >= 2 else ramp)
            for i in range(10):
                t = i / 10 * 6.283 + f; d = r + 2 + f
                c.put(16 + math.cos(t) * d, 17 + math.sin(t) * d * 0.8, ramp[min(4, f)], 255 if f < 4 else 140)
            fr.append(c.im)
        return fr
    col = {'magic': H('#ffffff', '#e8e2ff', '#b8a8ff'), 'poison': H('#e0ffb0', '#9be36a', '#2f8f1f'), 'slow': H('#ffffff', '#c8a8ff', '#8a6aff'),
           'teleport': H('#ffffff', '#7fd6ff', '#4ab8ff'), 'blink': H('#ffffff', '#d8e4ff', '#9aa8c8'), 'shadow': H('#e8a0ff', '#7a2aa0', '#2a0a3a'),
           'amok': H('#ffffff', '#ff4a4a', '#a8141e'), 'reach': H('#ffffff', '#b8d8ff', '#6a8ac8'), 'regrowth': H('#e8ffc0', '#7fdc4a', '#3a8a2a'),
           'flock': H('#ffffff', '#e8e8e0', '#a8a8a0'), 'rocks': H('#c8b8a0', '#8a8478', '#5a554c'), 'beam': H('#ffffff', '#ff5aff', '#8a2aa0'),
           'lightning': H('#ffffff', '#c0e8ff', '#5aa8e8')}[kind]
    for f in range(5):
        c = Cv(16, 16); R = random.Random(f * 13 + len(kind))
        if kind in ('teleport', 'blink'):
            for i in range(5 - f): c.plus(8 + R.randint(-4, 4), 14 - f * 3 - i * 2, col[i % 2], 1 if i % 2 else 0)
            if f < 2: c.disc(8, 13, 3 - f, col[1])
        elif kind == 'poison':
            c.disc(8, 10, [2, 4, 5, 5, 5][f], col[2], 255 if f < 4 else 140, sq=0.6); c.disc(8, 10, [1, 3, 3.5, 3, 2][f], col[1], 255 if f < 4 else 120, sq=0.6)
            for i in range(4 - f): c.put(8 + (i - 1.5) * 3, 6 - f + i % 2, col[1])
        elif kind in ('flock', 'rocks'):
            for i in range(6): c.disc(8 + math.cos(i) * (2 + f), 9 + math.sin(i) * (1 + f * 0.6), 2.2 - f * 0.35, col[1 if i % 2 else 2], 230 - f * 40)
            if kind == 'rocks':
                for i in range(4): c.put(8 + (i - 1.5) * (2 + f), 8 - f + (i % 2) * 2 + f * f * 0.3, col[0])
        else:      # a flash, a ring going out and sparks streaking away
            if f == 0: c.glow(8, 8, 3.5, col)
            if f == 1: c.disc(8, 8, 3, col[1]); c.disc(8, 8, 2, col[0])
            if 1 <= f <= 3: c.ring(8, 8, 2.5 + f * 1.5, col[min(2, f - 1)], 255 - f * 45)
            for i in range(6):
                t = i / 6 * 6.283 + 0.5 + (i % 2) * 0.3; d = 3 + f * 1.7
                c.line(8 + math.cos(t) * d, 8 + math.sin(t) * d, 8 + math.cos(t) * (d + (2 if f < 3 else 1)), 8 + math.sin(t) * (d + (2 if f < 3 else 1)), col[min(2, f // 2)], 255 - f * 45)
        fr.append(c.im)
    return fr


def beam():
    """Disintegration: a segment 16 x 16 tiled along the ray (4 frames), the muzzle and the end (16 x 16, 4 frames each)."""
    seg, cap, end = [], [], []
    for f in range(4):
        c = Cv(16, 16); w = [1, 2, 1, 2][f]
        for x in range(16):
            c.put(x, 8, hx('#ffffff')); c.put(x, 7, hx('#ffd8ff')) if w > 1 else None
            c.put(x, 6 if w > 1 else 7, hx('#ff5aff'), 230); c.put(x, 9, hx('#ff5aff'), 230)
            if (x + f * 3) % 5 == 0: c.put(x, 5 if w > 1 else 6, hx('#c83aff'), 200); c.put(x, 10, hx('#c83aff'), 200)
        seg.append(c.im)
        m = Cv(16, 16); m.glow(4, 8, 3 + (f % 2), H('#ffffff', '#ffd8ff', '#ff5aff', '#8a2aa0'))
        for x in range(6, 16): m.put(x, 8, hx('#ffffff')); m.put(x, 9, hx('#ff5aff')); m.put(x, 7, hx('#ff5aff'))
        cap.append(m.im)
        e = Cv(16, 16)
        for x in range(0, 9): e.put(x, 8, hx('#ffffff')); e.put(x, 9, hx('#ff5aff')); e.put(x, 7, hx('#ff5aff'))
        e.glow(10, 8, 3.5 + (f % 2), H('#ffffff', '#ffd8ff', '#ff5aff', '#8a2aa0'))
        for i in range(4): t = f + i * 1.57; e.put(10 + math.cos(t) * 6, 8 + math.sin(t) * 5, hx('#ff5aff'))
        end.append(e.im)
    return seg, cap, end


def arc():
    """Lightning: an arc 16 x 16 tiled along its path (ends at y 8, so tiles meet), 4 frames; the strike 32 x 32, 4 frames."""
    segs = []
    for f in range(4):
        c = Cv(16, 16); R = random.Random(f * 101)
        pts = [(0, 8)] + [(x, 8 + R.randint(-4, 4)) for x in (4, 8, 12)] + [(15, 8)]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            c.line(x0, y0 - 1, x1, y1 - 1, hx('#5aa8e8'), 170); c.line(x0, y0 + 1, x1, y1 + 1, hx('#5aa8e8'), 170)
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]): c.line(x0, y0, x1, y1, hx('#ffffff'))
        bx, by = pts[2]; c.line(bx, by, bx + 2, by + R.choice((-4, 4)), hx('#c0e8ff'))
        segs.append(c.im)
    strike = []
    for f in range(4):
        c = Cv(32, 32)
        if f < 3:
            c.glow(16, 18, [6, 9, 5][f], H('#ffffff', '#fffcc0', '#c0e8ff', '#5aa8e8'))
            for i in range(8):
                t = i / 8 * 6.283 + f * 0.4; d = [9, 13, 15][f]
                c.line(16 + math.cos(t) * (d - 4), 18 + math.sin(t) * (d - 4) * 0.8, 16 + math.cos(t) * d, 18 + math.sin(t) * d * 0.8, hx('#c0e8ff'))
        else:
            for i in range(6): c.put(16 + math.cos(i) * 12, 18 + math.sin(i) * 9, hx('#5aa8e8'), 160)
        strike.append(c.im)
    return segs, strike


def thrown():
    out_ = {}
    wood, dark, steel, hi = hx('#a8784a'), hx('#5a3a20'), hx('#9aa4a8'), hx('#e8eef0')
    # boomerang: 4 turns
    b = grid(['........', '.aa.....', '.aaa....', '..abb...', '...abbb.', '....abbb', '.....bb.', '........'], dict(a=wood, b=dark))
    out_['boomerang'] = [Image.new('RGBA', (16, 16), (0, 0, 0, 0)) for _ in range(4)]
    for k in range(4): out_['boomerang'][k].alpha_composite(b.rotate(90 * k), (4, 4))
    s0 = grid(['...a...', '...a...', '..aba..', 'aabcbaa', '..aba..', '...a...', '...a...'], dict(a=steel, b=hi, c=hx('#3b3e36')))
    s1 = grid(['a.....a', '.a...a.', '..aba..', '..bcb..', '..aba..', '.a...a.', 'a.....a'], dict(a=steel, b=hi, c=hx('#3b3e36')))
    out_['shuriken'] = []
    for s in (s0, s1, s0, s1): f = Image.new('RGBA', (16, 16), (0, 0, 0, 0)); f.alpha_composite(s, (4, 4)); out_['shuriken'].append(f)
    t = grid(['..ccc...', '.cccca..', '.cc.a...', '....a...', '....a...', '....a...', '....b...', '........'], dict(a=wood, b=dark, c=steel))
    out_['tomahawk'] = []
    for k in range(4): f = Image.new('RGBA', (16, 16), (0, 0, 0, 0)); f.alpha_composite(t.rotate(-90 * k), (4, 4)); out_['tomahawk'].append(f)
    # oriented: 8 directions E NE N NW W SW S SE from two drawings (straight and diagonal)
    def eight(straight, diag):
        fs = []
        for i in range(8):
            base = straight if i % 2 == 0 else diag; rot = (i // 2) * 90
            f = Image.new('RGBA', (16, 16), (0, 0, 0, 0)); f.alpha_composite(base.rotate(rot), (0, 0)); fs.append(f)
        return fs
    jav_s = grid(['................'] * 7 + ['.bbaaaaaaaaaacc.', '................'] + ['................'] * 7, dict(a=wood, b=dark, c=steel))
    jav_d = grid([('.' * (15 - i) + ('c' if i < 3 else ('a' if i < 13 else 'b')) + '.' * i)[:16] for i in range(16)], dict(a=wood, b=dark, c=steel))
    arr_s = grid(['................'] * 7 + ['.ee.aaaaaaaaacc.', '..e.............'] + ['................'] * 7, dict(a=wood, e=hx('#e8e2c8'), c=steel))
    arr_d = grid([('.' * (15 - i) + ('c' if i < 2 else ('a' if i < 11 else ('e' if i < 14 else '.'))) + '.' * i)[:16] for i in range(16)], dict(a=wood, e=hx('#e8e2c8'), c=steel))
    out_['javelin'] = eight(jav_s, jav_d); out_['arrow'] = eight(arr_s, arr_d)
    return out_


if __name__ == '__main__':
    for kind in K:
        if kind in ('beam', 'lightning'): continue
        fr = [fly(kind, k) for k in range(4)]; hi_ = hit(kind)
        save(strip(fr), f'bolts/{kind}-fly.png'); save(strip(hi_), f'bolts/{kind}-hit.png')
        gif(fr * 3 + hi_, f'bolt-{kind}.gif', 70, 5, hold=2)
    seg, cap, end = beam(); save(strip(seg), 'bolts/beam-ray.png'); save(strip(cap), 'bolts/beam-start.png'); save(strip(end), 'bolts/beam-end.png')
    bh = hit('beam'); save(strip(bh), 'bolts/beam-hit.png')
    ray = [strip([cap[k], seg[k], seg[(k + 1) % 4], seg[(k + 2) % 4], end[k]]) for k in range(4)]; gif(ray * 3, 'bolt-beam.gif', 70, 4)
    sg, st = arc(); save(strip(sg), 'bolts/lightning-arc.png'); save(strip(st), 'bolts/lightning-strike.png')
    lh = hit('lightning'); save(strip(lh), 'bolts/lightning-hit.png')
    gif([strip([sg[(k + i) % 4] for i in range(5)]) for k in range(4)] * 2, 'bolt-lightning.gif', 60, 4)
    gif(st, 'bolt-lightning-strike.gif', 70, 4, hold=3)
    th = thrown()
    for k, fr in th.items(): save(strip(fr), f'thrown/{k}.png'); gif(fr * 3, f'thrown-{k}.gif', 70, 5)
    print('bolts ok')
