# Firelight · part 6: a trap going off, one per family in the colours of the PD 1.9 legend (ui/trap-colours.png): 6 frames 32 x 32,
# the plate in the middle of the cell (16, 20). The gas traps hand over to the cloud tiles (gas/*.png), fire to the fire tile.
import math, random
from px import *

TRAPS = {   # legend colour, ramp
    'alarm':     ('red', ['#ffd0c0', '#ff5a3a', '#c0201a', '#6a0e0a'], 'Alarm', 'Тревога'),
    'fire':      ('orange', ['#fff6c8', '#ffcc66', '#ff7a2a', '#c0301a'], 'Fire', 'Огонь'),
    'paralytic': ('yellow', ['#fffcc0', '#f0e070', '#c8b040', '#7a6a20'], 'Paralytic gas', 'Парализующий газ'),
    'toxic':     ('green', ['#c8ff9a', '#7fdc4a', '#4aa82a', '#245a1a'], 'Toxic gas', 'Ядовитый газ'),
    'lightning': ('teal', ['#ffffff', '#c0f4ff', '#5ad8e8', '#2a8aa8'], 'Lightning', 'Молния'),
    'poison':    ('violet', ['#f0c8ff', '#c070ff', '#8a3ad0', '#4a1a7a'], 'Poison darts', 'Ядовитые иглы'),
    'summoning': ('white', ['#ffffff', '#e8eef8', '#a8b8d8', '#5a6a8a'], 'Summoning', 'Призыв'),
    'gripping':  ('grey', ['#e8e8e4', '#a8a8a4', '#6a6a66', '#3a3a38'], 'Gripping', 'Капкан'),
}


def frames(kind):
    ramp = [hx(c) for c in TRAPS[kind][1]]; out_ = []; R = random.Random(len(kind) * 17)
    for f in range(6):
        c = Cv(32, 32); cx, cy = 16, 20; t = f / 5
        if f < 3:        # the plate's studs flare
            for dx in (-3, 0, 3):
                for dy in (-2, 0, 2): c.put(cx + dx, cy + dy, ramp[0] if f == 1 else ramp[1])
        if kind == 'alarm':
            for k in range(2):
                r = 3 + ((f + k * 3) % 6) * 2.4
                c.ring(cx, cy - 2, r, ramp[1 + k], 255 - int(r * 12), w=1.5, sq=0.85)
            if f % 2 == 0: c.blit(grid(['a', 'a', 'a', '.', 'a'], dict(a=ramp[0])), cx, 3)
        elif kind == 'fire':
            h = [6, 14, 20, 18, 12, 6][f]
            for i in range(7):
                x = cx - 6 + i * 2; hh = h - abs(i - 3) * 2
                for y in range(max(0, int(hh))):
                    k = y / max(1, hh); c.disc(x + math.sin(f + y * 0.5 + i) * 0.7, cy + 2 - y, max(0.5, 1.6 * (1 - k)), ramp[min(3, int(k * 4))])
        elif kind in ('paralytic', 'toxic'):      # a cloud bursting up off the plate and spreading
            r = [3, 6, 9, 11, 12, 12][f]; a = [255, 240, 220, 190, 150, 100][f]
            c.disc(cx, cy - 2 - f, r, ramp[3], int(a * 0.6), sq=0.75)
            for i in range(6):
                ang = i / 6 * 6.283 + f * 0.2; d = r * 0.55
                c.disc(cx + math.cos(ang) * d, cy - 3 - f + math.sin(ang) * d * 0.7, r * 0.45, ramp[2], a, sq=0.85)
                c.disc(cx + math.cos(ang) * d - 0.8, cy - 4 - f + math.sin(ang) * d * 0.7, r * 0.28, ramp[1], a, sq=0.85)
            c.disc(cx - 1, cy - 5 - f, r * 0.3, ramp[0], a)
        elif kind == 'lightning':
            if f < 4:
                x = cx; pts = [(x, 0)]
                for y in range(4, 22, 4): x += R.randint(-3, 3); pts.append((x, y))
                pts.append((cx, cy))
                for (x0, y0), (x1, y1) in zip(pts, pts[1:]): c.line(x0 - 1, y0, x1 - 1, y1, ramp[2], 200); c.line(x0, y0, x1, y1, ramp[0])
                c.glow(cx, cy, [3, 6, 5, 3][f], ramp)
            else:
                for i in range(6): c.put(cx + math.cos(i) * (6 + f), cy + math.sin(i) * (4 + f), ramp[2], 150)
        elif kind == 'poison':
            for i in range(6):        # darts flying out from the plate
                ang = -1.2 - i * 0.15 if i < 3 else -1.9 + i * 0.15
                ang = i / 6 * 6.283; d = 2 + t * 13
                x, y = cx + math.cos(ang) * d, cy + math.sin(ang) * d * 0.7
                c.line(x, y, x - math.cos(ang) * 2, y - math.sin(ang) * 1.4, ramp[1]); c.put(x, y, ramp[0])
            if f < 3: c.disc(cx, cy, 2 + f, ramp[3], 160, sq=0.6)
        elif kind == 'summoning':
            r = [3, 7, 10, 11, 11, 11][f]
            c.ring(cx, cy, r, ramp[1], 255 if f < 5 else 140, sq=0.55); c.ring(cx, cy, max(1, r - 3), ramp[2], 200 if f < 5 else 100, sq=0.55, gap=(3, 1))
            for i in range(6):
                ang = i / 6 * 6.283 + f * 0.3
                if f >= 2: c.plus(cx + math.cos(ang) * r, cy + math.sin(ang) * r * 0.55 - (f - 2) * 2, ramp[0], 1 if (i + f) % 2 else 0)
            if f >= 3: c.disc(cx, cy - 6, [0, 0, 0, 2, 3, 2][f], ramp[0], 200)
        elif kind == 'gripping':
            k = [0, 0.5, 1, 1, 1, 0.8][f]
            for side in (-1, 1):
                for i in range(5):
                    x = cx + side * (8 - k * 5) ; y = cy - 6 + i * 3
                    c.line(x, y, x - side * 3 * k, y - 1, ramp[1]); c.put(x - side * 3 * k, y - 1, ramp[0])
                c.line(cx + side * (8 - k * 5), cy - 7, cx + side * (8 - k * 5), cy + 6, ramp[2])
            if f >= 2: c.disc(cx, cy + 3, 1.5, hx('#b01818'))
        out_.append(c.im)
    return out_


if __name__ == '__main__':
    save(rows([strip(frames(k)) for k in TRAPS]), 'traps/traps.png')
    for k in TRAPS: gif(frames(k), f'trap-{k}.gif', 90, 4, hold=3)
    print('traps ok')
