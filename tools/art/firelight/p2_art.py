# Firelight · part 2 art: the firelit window frame and toast, the speech bubbles, the backpack's animation frames,
# camp icons, the death and victory marks, the photo mode's frame and icons.
import os, math, numpy as np
from PIL import Image
SRC = '/home/claude/pdf/packages/client/public/assets/'
OUT = '/home/claude/firelight/p2/out/packages/client/public/assets/'
UI = OUT + 'ui/'
os.makedirs(UI, exist_ok=True); os.makedirs(OUT + 'camp/', exist_ok=True)
H = lambda s: tuple(int(s.lstrip('#')[i:i + 2], 16) for i in (0, 2, 4))
VOID = H('#0b0b09')
F = {k: H(v) for k, v in dict(spark='#fffad6', light='#ffeba4', gold='#ffcc66', flame='#ff9a3a', ember='#e8641f', coal='#b22a2a',
                               deep='#6e161a', ash='#1a0a06').items()}
LIT = {k: H(v) for k, v in dict(hi='#e0b878', mid='#a8804e', lo='#74583c', dark='#4a3424', edge='#6b4428',
                                 thi='#b3a88c', tmid='#857a64', tlo='#645a4a', tdark='#38332b').items()}
def save(a, name, d=UI): Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA').save(d + name, optimize=True)
def rgba(c, a=255): return (*c, a)

# ---------------------------------------------------------------- 1. the window frame, lit from below by the fire
def firelit_frame(src, split, studs, lo_row, hi_row):
    a = np.array(Image.open(SRC + src).convert('RGBA')).astype(int); out = a.copy()
    H_, W_ = a.shape[:2]
    for y in range(H_):
        for x in range(W_):
            p = tuple(a[y, x, :3]); al = a[y, x, 3]
            if al == 0: continue
            bottom = y >= split
            stud = any(x0 <= x <= x0 + 4 and y0 <= y <= y0 + 4 for x0, y0 in studs)
            m = {(0x9f, 0xa8, 0x96): 'A', (0x7a, 0x81, 0x73): 'B', (0x62, 0x66, 0x5b): 'C', (0x35, 0x38, 0x31): 'D', (0x37, 0x3b, 0x34): 'E'}.get(p)
            if m is None: continue
            if stud and bottom: c = {'A': F['flame'], 'B': F['coal'], 'C': F['deep'], 'D': LIT['dark'], 'E': LIT['dark']}[m]
            elif stud: c = {'A': H('#c9b48a'), 'B': H('#8c7a5a'), 'C': H('#5c4c3a'), 'D': LIT['tdark'], 'E': LIT['tdark']}[m]
            else:
                warm = {'A': LIT['hi'], 'B': LIT['mid'], 'C': LIT['lo'], 'D': LIT['dark'], 'E': LIT['edge']}[m]
                cool = {'A': LIT['thi'], 'B': LIT['tmid'], 'C': LIT['tlo'], 'D': LIT['tdark'], 'E': (0x37, 0x3b, 0x34)}[m]
                # the sides (stretched rows) warm step by step towards the bottom: light rising from the fire
                t = 0 if y < lo_row else 1 if y > hi_row else (y - lo_row + 1) / (hi_row - lo_row + 2)
                c = tuple(int(round(cool[i] + (warm[i] - cool[i]) * t)) for i in range(3))
            out[y, x, :3] = c
    return out
win = firelit_frame('ui-window.png', 11, [(1, 1), (16, 1), (1, 16), (16, 16)], 7, 14)
save(win, 'ui-window.png', OUT)
toast = firelit_frame('ui-toast.png', 9, [], 5, 12)
save(toast, 'ui-toast.png', OUT)

# ---------------------------------------------------------------- 2. speech bubbles (9-slice) and their tails
def bubble(n, border, fill, out_col=VOID, notch=1):
    a = np.zeros((n, n, 4), int)
    for y in range(n):
        for x in range(n):
            e = min(x, y, n - 1 - x, n - 1 - y)
            corner = (x in (0, n - 1)) and (y in (0, n - 1))
            if corner: continue
            if e == 0: a[y, x] = rgba(out_col)
            elif e == 1 or ((x in (1, n - 2)) and (y in (1, n - 2))): a[y, x] = rgba(border)
            else: a[y, x] = rgba(fill)
    return a
WARM_FILL = H('#2b2620'); WARM_BORDER = H('#c9a26a'); WARM_TOP = H('#3a3329')
# a rounded pixel bubble, 12x12 sliced at 5: void outline, a lit edge, warm dark stone inside (a lit line under the top)
N = 12
SHAPE = ['...oooooo...', '.oobbbbbboo.', '.obbffffbbo.', 'obfllllllfbo', 'obffffffffbo', 'obffffffffbo',
         'obffffffffbo', 'obffffffffbo', 'obbffffffbbo', '.obbffffbbo.', '.oobbbbbboo.', '...oooooo...']
SHAPE = ['...oooooo...', '.oobbbbbboo.', '.obllllllbo.', 'oblffffffbo.'.ljust(12, '.'), 'obffffffffbo', 'obffffffffbo',
         'obffffffffbo', 'obffffffffbo', 'obffffffffbo', '.obffffffbo.', '.oobbbbbboo.', '...oooooo...']
b = np.zeros((N, N, 4), int)
for y, r in enumerate(SHAPE):
    for x, c in enumerate(r):
        b[y, x] = {'o': rgba(VOID), 'b': rgba(WARM_BORDER), 'f': rgba(WARM_FILL), 'l': rgba(WARM_TOP), '.': (0, 0, 0, 0)}[c]
b[3, 10] = rgba(WARM_FILL); b[3, 11] = rgba(VOID); b[3, 10] = rgba(WARM_FILL)
b[3, 9] = rgba(WARM_FILL); b[3, 10] = rgba(WARM_BORDER)
save(b, 'fl-bubble.png')
t = np.zeros((7, 12, 4), int)
for y, r in enumerate(['ffffffffffff', 'obffffffffbo', '.obffffffbo.', '..obffffbo..', '...obffbo...', '....obbo....', '.....oo.....']):
    for x, c in enumerate(r):
        t[y, x] = {'o': rgba(VOID), 'b': rgba(WARM_BORDER), 'f': rgba(WARM_FILL), '.': (0, 0, 0, 0)}[c]
t[0, 0] = rgba(WARM_BORDER); t[0, 11] = rgba(WARM_BORDER)
save(t, 'fl-bubble-tail.png')
# the loud one: a jagged ember edge, like a shout
L = 11; lb = np.zeros((L, L, 4), int)
RING = H('#e8641f'); RING2 = H('#b22a2a'); LFILL = H('#3a1812')
for y in range(L):
    for x in range(L):
        e = min(x, y, L - 1 - x, L - 1 - y)
        spike = (x + y) % 4 == 0
        if e == 0: lb[y, x] = rgba(VOID) if spike else (0, 0, 0, 0)
        elif e == 1: lb[y, x] = rgba(RING) if spike else rgba(VOID)
        elif e == 2: lb[y, x] = rgba(RING)
        elif e == 3: lb[y, x] = rgba(RING2)
        else: lb[y, x] = rgba(LFILL)
for (x, y) in [(0, 0), (L - 1, 0), (0, L - 1), (L - 1, L - 1)]: lb[y, x] = rgba(VOID)
save(lb, 'fl-bubble-loud.png')
lt = np.zeros((7, 12, 4), int)
for y, r in enumerate(['rFFFFFFFFFFr', 'VRrffffffrRV', '.VRrffffrRV.', '..VRrffrRV..', '...VRrrRV...', '....VRRV....', '.....VV.....']):
    for x, c in enumerate(r):
        lt[y, x] = {'F': rgba(LFILL), 'V': rgba(VOID), 'R': rgba(RING), 'r': rgba(RING2), 'f': rgba(LFILL), '.': (0, 0, 0, 0)}[c]
save(lt, 'fl-bubble-loud-tail.png')

# ---------------------------------------------------------------- 3. backpack frames (26x26 = a 52 px slot at --u: 2)
S = 26
def perimeter(n, inset=1):
    """The ring's cells clockwise from the top middle, along the slot's edge (the notch's corners cut)."""
    lo, hi = inset, n - 1 - inset
    path = [(x, lo) for x in range(n // 2, hi)] + [(hi, y) for y in range(lo + 1, hi)] + [(x, hi) for x in range(hi - 1, lo, -1)] + \
           [(lo, y) for y in range(hi - 1, lo, -1)] + [(x, lo) for x in range(lo + 1, n // 2)]
    return path
P = perimeter(S, 1); P2 = perimeter(S, 2)
ring = np.zeros((S, S * 8, 4), int)
for f in range(8):
    k = int(round(len(P) * (f + 1) / 8))
    for i, (x, y) in enumerate(P):
        on = i < k
        for (xx, yy) in ((x, y), P2[min(len(P2) - 1, int(i * len(P2) / len(P)))]):
            if on: ring[yy, f * S + xx] = rgba(F['gold'] if (xx, yy) == (x, y) else F['ember'])
            elif (xx, yy) == (x, y): ring[yy, f * S + xx] = (110, 22, 26, 150)
    if k < len(P):   # the spark at the head
        hx, hy = P[k - 1]
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
            if 0 <= hx + dx < S and 0 <= hy + dy < S: ring[hy + dy, f * S + hx + dx] = rgba(F['spark'] if (dx, dy) == (0, 0) else F['light'])
save(ring, 'fl-hold-ring.png')
# equip: a band of light sweeps across the slot and leaves a glint in the corner (6 frames)
shine = np.zeros((S, S * 6, 4), int)
for f in range(6):
    c = -6 + f * 8
    for y in range(S):
        for x in range(S):
            d = (x + y) / 2 - c - 6
            if -1.5 <= d <= 1.5:
                a = 200 if abs(d) < .8 else 110
                shine[y, f * S + x] = (*F['light'], a) if abs(d) < .8 else (*F['gold'], a)
    if f >= 4:
        gx, gy = 19, 6
        for dx, dy, cc in ((0, 0, 'spark'), (1, 0, 'gold'), (-1, 0, 'gold'), (0, 1, 'gold'), (0, -1, 'gold'), (2, 0, 'flame'), (-2, 0, 'flame'), (0, 2, 'flame'), (0, -2, 'flame')):
            if f == 5 and abs(dx) + abs(dy) == 2: continue
            shine[gy + dy, f * S + gx + dx] = rgba(F[cc])
save(shine, 'fl-equip-shine.png')
# a place that takes the dragged item: warm corner brackets breathing in (4 frames, looping)
drop = np.zeros((S, S * 4, 4), int)
for f in range(4):
    o = [0, 1, 2, 1][f]; L_ = 6
    for (cx, cy, sx, sy) in ((1, 1, 1, 1), (S - 2, 1, -1, 1), (1, S - 2, 1, -1), (S - 2, S - 2, -1, -1)):
        x0, y0 = cx + sx * o, cy + sy * o
        for i in range(L_):
            for (x, y) in ((x0 + sx * i, y0), (x0, y0 + sy * i)):
                drop[y, f * S + x] = rgba(F['gold'] if i < 2 else F['flame'])
                ix, iy = x + sx, y + sy
                if 0 <= ix < S and 0 <= iy < S and drop[iy, f * S + ix, 3] == 0: drop[iy, f * S + ix] = (*F['ember'], 140)
    al = [40, 70, 100, 70][f]
    for y in range(3, S - 3):
        for x in range(3, S - 3):
            if drop[y, f * S + x, 3] == 0 and (x + y + f) % 2 == 0 and min(x, y, S - 1 - x, S - 1 - y) <= 4: drop[y, f * S + x] = (*F['flame'], al)
save(drop, 'fl-drop-glow.png')
# the flourish behind «+1» and «identified»: sparks flying out (5 frames, 32x24)
BW, BH = 32, 24
burst = np.zeros((BH, BW * 5, 4), int)
rays = [(math.cos(a), math.sin(a) * 0.75) for a in np.linspace(-math.pi, math.pi, 11)[:-1]]
for f in range(5):
    r = 3 + f * 2.6
    for k, (dx, dy) in enumerate(rays):
        x, y = int(round(BW / 2 + dx * r)), int(round(BH / 2 + dy * r))
        col = F['spark'] if f < 2 else F['light'] if f < 3 else F['gold'] if f < 4 else F['flame']
        if 0 <= x < BW and 0 <= y < BH:
            burst[y, f * BW + x] = rgba(col)
            if f in (1, 2):   # short streaks
                x2, y2 = int(round(BW / 2 + dx * (r - 1.5))), int(round(BH / 2 + dy * (r - 1.5)))
                burst[y2, f * BW + x2] = (*F['gold'], 200)
save(burst, 'fl-spark-burst.png')

# ---------------------------------------------------------------- 4. the end of a run: the fire gone out / a fire for the win (32x24)
ASH = [
    '.........s......s...............',
    '........s......s................',
    '.........s......s...............',
    '..........s....s................',
    '.........s......s...............',
    '........s......s................',
    '.........s....s.................',
    '..........s..s..................',
    '...........ss...................',
    '................................',
    '..KK.........KK.................',
    '.KLDK.......KDLK................',
    '..KLDK.cec.KDLK.................',
    '...KLDKcccKDLK..................',
    '....KLDDcDDLK...................',
    '...KDLDKKKDLDK..................',
    '..KDLDK...KDLDK.................',
    '.KDLK.......KLDK................',
    '..KK.........KK.................',
]
def draw(rows, pal, w=None):
    w = w or max(len(r) for r in rows); a = np.zeros((len(rows), w, 4), int)
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c in pal: a[y, x] = rgba(pal[c][:3], pal[c][3] if len(pal[c]) > 3 else 255)
    return a
cold = draw(ASH, {'K': (40, 38, 34), 'L': (122, 118, 108), 'D': (88, 84, 76), 'c': (60, 56, 52), 'e': (178, 42, 42), 's': (159, 168, 150, 120)})
cold = cold[:, :17]
def outlined(a):
    f = a[..., 3] > 0; o = np.zeros_like(f)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1): o |= np.roll(np.roll(f, dy, 0), dx, 1)
    o &= ~f; b = a.copy(); b[o & ~(a[..., 3] > 0)] = rgba(F['ash'])
    return b
pad = np.zeros((cold.shape[0] + 2, cold.shape[1] + 2, 4), int); pad[1:-1, 1:-1] = cold
# outline the logs only, not the smoke
logs_only = pad.copy(); logs_only[pad[..., 3] < 255] = 0
o = outlined(logs_only); o[pad[..., 3] == 120] = pad[pad[..., 3] == 120]
save(o, 'fl-fire-out.png')
mark = Image.open('/home/claude/firelight/p1/out/packages/client/public/assets/brand/mark.png').convert('RGBA')
mark.save(UI + 'fl-fire-win.png')
print('art ok')
