# Firelight · part 6: the hero's moments and the blows. Level up (48 x 48, 8), the ankh's resurrection (48 x 48, 10), the Amulet of
# Yendor picked up (48 x 48, 10), healing (32 x 32, 6), a hit (16 x 16, 4), a critical (32 x 32, 5), a miss (16 x 16, 4). The figure
# stands with its feet at the bottom middle (24, 44 / 16, 28 / 8, 14).
import math, random
from PIL import Image
from px import *

GOLD = [hx(c) for c in ('#fff6c8', '#ffeba4', '#ffcc66', '#e0a018', '#8a5a10')]


def levelup():
    fr = []
    for f in range(8):
        c = Cv(48, 48); t = f / 7; R = random.Random(f)
        w = [2, 5, 7, 7, 6, 4, 2, 1][f]     # a pillar of light rising, a ring on the floor, sparks going up
        for y in range(0, 44):
            k = y / 44; ww = w * (0.4 + 0.6 * k)
            for x in range(int(24 - ww), int(24 + ww) + 1):
                col = GOLD[0] if abs(x - 24) < ww * 0.35 else (GOLD[1] if abs(x - 24) < ww * 0.7 else GOLD[2])
                c.put(x, y, col, int((90 + 140 * k) * (1 - max(0, t - 0.5) * 1.6)))
        c.ring(24, 44, 4 + t * 16, GOLD[2], int(255 * (1 - t)), w=1.5, sq=0.35)
        for i in range(10):
            x = 24 + R.choice((-1, 1)) * R.uniform(3, 14); y = 44 - ((f * 6 + i * 9) % 42)
            c.plus(x, y, GOLD[0], 1 if i % 3 == 0 else 0, 230, GOLD[2])
        if f in (2, 3): c.glow(24, 30, 5, GOLD[:4])
        fr.append(c.im)
    return fr


def ankh():
    a = grid(['..aaa..', '.a...a.', '.a...a.', '..a.a..', 'aaaaaaa', '...a...', '...a...', '...a...', '...a...'], dict(a=GOLD[1]))
    fr = []
    for f in range(10):
        c = Cv(48, 48); t = f / 9
        if f >= 1:     # rays from the ankh
            for i in range(12):
                ang = i / 12 * 6.283 + f * 0.08; L = [0, 6, 12, 16, 18, 18, 16, 12, 8, 4][f]
                c.line(24 + math.cos(ang) * 6, 20 + math.sin(ang) * 6, 24 + math.cos(ang) * (6 + L), 20 + math.sin(ang) * (6 + L), GOLD[2] if i % 2 else GOLD[1], 160)
        if f < 8:
            big = x_n(a, 2); al = 255 if f < 6 else 255 - (f - 5) * 80
            big.putalpha(big.getchannel('A').point(lambda v: min(v, al)))
            c.blit(big, 24 - 7, 20 - 9 - min(f, 4))
        if f >= 4:     # the hero rises in light
            for y in range(28, 46):
                w = (y - 28) / 18 * 6 * min(1, (f - 3) / 3)
                for x in range(int(24 - w), int(24 + w) + 1): c.put(x, y, GOLD[0] if abs(x - 24) < w * 0.4 else GOLD[2], 140)
        for i in range(6):
            ang = i / 6 * 6.283 + t * 2; c.plus(24 + math.cos(ang) * (14 - t * 4), 30 + math.sin(ang) * 6 - t * 10, hx('#ffffff'), 1 if (i + f) % 2 else 0, 220, GOLD[1])
        fr.append(c.im)
    return fr


def amulet():
    am = Image.open(SRC + 'items.png').convert('RGBA').crop((7 * 16, 10 * 16, 8 * 16, 11 * 16))   # item 87
    fr = []
    for f in range(10):
        c = Cv(48, 48); t = f / 9
        for i in range(16):       # turning rays, red and gold
            ang = i / 16 * 6.283 + f * 0.12; L = 6 + 14 * math.sin(min(1, t * 1.5) * 3.14 / 2) * (1 if i % 2 else 0.6)
            c.line(24 + math.cos(ang) * 7, 22 + math.sin(ang) * 7, 24 + math.cos(ang) * (7 + L), 22 + math.sin(ang) * (7 + L), hx('#ff5a3a') if i % 4 == 1 else GOLD[2], int(200 * (1 - max(0, t - 0.7) / 0.3)))
        c.glow(24, 22, 9 + math.sin(f) * 1, [hx('#fff6c8'), hx('#ffcc66'), hx('#e0402a'), hx('#6a0e0a')])
        c.blit(am, 24 - 8, 22 - 8 - (1 if f % 2 else 0))
        for i in range(4): c.plus(24 + math.cos(f + i * 1.57) * 18, 22 + math.sin(f + i * 1.57) * 12, hx('#ffffff'), 1, 230, GOLD[2])
        fr.append(c.im)
    return fr


def heal():
    fr = []
    G = [hx(c) for c in ('#e8ffe0', '#80ff80', '#40c040', '#1a6a1a')]
    for f in range(6):
        c = Cv(32, 32)
        for i in range(5):
            x = 6 + (i * 37) % 21; y = 28 - ((f * 4 + i * 7) % 24)
            arm = 2 if (i + f) % 3 == 0 else 1
            for d in range(-arm, arm + 1): c.put(x + d, y, G[1]); c.put(x, y + d, G[1])
            c.put(x, y, G[0]); c.put(x + arm + 1, y, G[3], 120)
        c.ring(16, 28, 3 + f * 2, G[2], 200 - f * 30, sq=0.35)
        fr.append(c.im)
    return fr


def hit():
    fr = []
    for f in range(4):
        c = Cv(16, 16)
        if f == 0: c.disc(8, 8, 2, hx('#ffffff'))
        for i in range(5):
            ang = i / 5 * 6.283 + 0.3; d = 1 + f * 2
            c.line(8 + math.cos(ang) * d, 8 + math.sin(ang) * d, 8 + math.cos(ang) * (d + 2 - f * 0.5), 8 + math.sin(ang) * (d + 2 - f * 0.5), hx('#ffffff') if f < 2 else hx('#ffe9a0'), 255 - f * 50)
        fr.append(c.im)
    return fr


def crit():
    fr = []; R_ = [hx(c) for c in ('#ffffff', '#ffe9a0', '#ff9a3a', '#e0402a')]
    for f in range(5):
        c = Cv(32, 32); s = [5, 10, 12, 11, 8][f]
        for i in range(8):       # a star of eight points, long and short
            ang = i / 8 * 6.283; L = s if i % 2 == 0 else s * 0.55
            c.line(16, 16, 16 + math.cos(ang) * L, 16 + math.sin(ang) * L, R_[min(3, f)] if f > 1 else R_[1], 255 - f * 30)
            c.put(16 + math.cos(ang) * L, 16 + math.sin(ang) * L, R_[2])
        c.glow(16, 16, [4, 5, 3, 2, 1][f], R_[:3])
        fr.append(c.im)
    return fr


def miss():
    fr = []
    for f in range(4):
        c = Cv(16, 16)
        for i in range(3):          # a grey swish in the air and a puff
            y = 6 + i * 2; x0 = 2 + f * 2; c.line(x0, y, x0 + 6 - i * 2, y - 1, hx('#c8c8c4') if i == 1 else hx('#8a8a86'), 220 - f * 50)
        if f >= 2: c.disc(12, 11, 1.5 + f * 0.3, hx('#6a6a66'), 160 - f * 30)
        fr.append(c.im)
    return fr


if __name__ == '__main__':
    for k, fn, ms in (('levelup', levelup, 90), ('ankh', ankh, 90), ('amulet', amulet, 100), ('heal', heal, 90), ('hit', hit, 60), ('crit', crit, 60), ('miss', miss, 70)):
        fr = fn(); save(strip(fr), f'combat/{k}.png'); gif(fr, f'combat-{k}.gif', ms, 4 if fr[0].width <= 32 else 3, hold=3, add=k in ('levelup', 'ankh', 'heal', 'crit', 'hit'))
    print('combat ok')
