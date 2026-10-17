# Firelight · part 13: the small magic — the effects of the minor items of PD 1.9.2a, each a short sheet.
#  fx/minor/sheep.png    16 x 16 x 6, rows: appear (a puff, wool bits), vanish (a puff, a sparkle)     — wand of flock
#  fx/minor/thorns.png   32 x 32 x 6 — spikes thrust out of the hero and draw back                      — ring of thorns
#  fx/minor/sleep.png    16 x 16 x 6 — «z»s rising over a sleeper (a loop)                              — lullaby, sleep
#  fx/minor/mirror.png   16 x 32 x 6 — a shimmer running down a mirror image (a loop)                     — mirror image
#  fx/minor/purity.png   48 x 48 x 8 — a ring of clean light going out                                   — potion of purity
#  fx/minor/levitate.png 32 x 16 x 6 — air turning under the feet (a loop)                               — levitation
#  fx/minor/status.png   16 x 16 x 6, rows: slow, poison, teleport out, teleport in                      — on a target
#  fx/minor/glyphs.png   32 x 32 x 6, 11 rows in the core's order of glyphs                              — armour glyphs
#  fx/minor/alarm.png    32 x 32 x 6 — a bell swinging, rings of sound                                    — alarm trap
import math, random
from PIL import Image
from px import Cv, hx, mix, save, strip, rows, grid

W = hx('#ffffff')


def sheep(vanish, f):
    c = Cv(16, 16); R = random.Random(7 + vanish)
    r = [2, 4, 6, 6.5, 5, 3][f]; a = [255, 230, 200, 150, 100, 50][f]
    for k in range(7):
        t = k / 7 * 6.2832 + f * 0.2
        c.disc(8 + math.cos(t) * r * 0.8, 9 + math.sin(t) * r * 0.55, 1.6 + (f < 3), hx('#f4f0e4'), a)
    if f < 2: c.glow(8, 9, 3 - f, [W, hx('#e8e2c8')])
    if vanish and f >= 2: c.plus(8 + (f - 3), 5 - f // 2, hx('#ffeba4'), 1, a=220)
    if not vanish and f >= 3:
        for k in range(3): c.put(R.randint(2, 13), R.randint(10, 14) - (f - 3), hx('#e8e2c8'))
    return c.im


def thorns(f):
    c = Cv(32, 32); n = 10; reach = [3, 9, 13, 12, 8, 3][f]
    for k in range(n):
        a = k / n * 6.2832 + 0.15
        x1, y1 = 16 + math.cos(a) * reach, 18 + math.sin(a) * reach * 0.7
        c.line(16 + math.cos(a) * 3, 18 + math.sin(a) * 2, x1, y1, hx('#4a7a2a'))
        c.put(x1, y1, hx('#ff5a3a' if f in (2, 3) else '#c8e07a'))
    if f == 2: c.ring(16, 18, 13, hx('#ff8585'), 120, sq=0.7)
    return c.im


ZS = ["kkk", "..k", ".k.", "k..", "kkk"]


def sleep(f):
    c = Cv(16, 16)
    for k in range(3):
        t = (f + k * 2) % 6
        x, y = 4 + k * 3 + (t % 2), 13 - t * 2
        col = hx(['#bfe0ff', '#9fc8f0', '#7fa8d8'][min(2, t // 2)])
        size = 1 if k else 0
        for j, r in enumerate(ZS):
            for i, ch in enumerate(r):
                if ch == 'k' and (size or (i % 2 == 0 or j % 2 == 0)): c.put(x + i - 1, y + j - 2, col, 255 - t * 30)
    return c.im


def mirror(f):
    c = Cv(16, 32)
    for y in range(6, 30):
        band = (y + f * 4) % 12
        if band < 2:
            for x in range(3, 13): c.put(x, y, hx('#e8f4ff'), 120 if band == 0 else 60)
    for k in range(2):
        y = 8 + ((f * 5 + k * 11) % 20); c.put(3 + k * 9, y, W)
    return c.im


def purity(f):
    c = Cv(48, 48); r = 3 + f * 2.9; a = 255 - f * 26
    c.ring(24, 24, r, hx('#fff6c8'), a, w=2, sq=0.6)
    c.ring(24, 24, max(1, r - 4), hx('#ffffff'), a // 2, w=1, sq=0.6)
    R = random.Random(f)
    for k in range(8):
        t = k / 8 * 6.2832 + f * 0.3
        c.put(24 + math.cos(t) * (r + 1), 24 + math.sin(t) * (r + 1) * 0.6, hx('#fffad6'), a)
    return c.im


def levitate(f):
    c = Cv(32, 16)
    for k in range(3):
        r = 4 + ((f + k * 2) % 6) * 1.6
        c.ring(16, 9, r, hx('#cfe6ff'), 170 - ((f + k * 2) % 6) * 25, sq=0.35, gap=(4, 2))
    c.disc(16, 9, 3, hx('#000000'), 50, sq=0.4)
    return c.im


def status(kind, f):
    c = Cv(16, 16)
    if kind == 'slow':        # a blue ring round the feet with a clock hand turning slowly
        c.ring(8, 12, 5, hx('#6ab0ff'), 200, sq=0.4)
        a = f / 6 * 6.2832 - 1.57
        c.line(8, 12, 8 + math.cos(a) * 4, 12 + math.sin(a) * 1.6, hx('#cfe6ff'))
    elif kind == 'poison':    # green drops falling off the target, a bubble rising
        for k in range(2):
            y = 4 + ((f + k * 3) % 6) * 2; c.put(5 + k * 6, y, hx('#7ad05a')); c.put(5 + k * 6, y - 1, hx('#b6f07a'))
        c.ring(9, 10 - f, 1, hx('#9ade4a'), 200)
    elif kind == 'out':       # the target thins into violet sparks going up
        for k in range(6):
            y = 14 - f * 2 - (k % 3) * 2; x = 4 + (k * 7) % 9
            c.put(x, y, hx('#d8b0ff' if k % 2 else '#b88aff'), 255 - f * 35)
        if f < 2: c.disc(8, 9, 4 - f * 2, hx('#b88aff'), 160)
    else:                     # sparks gather down into the cell, a flash
        for k in range(6):
            y = 2 + f * 2 + (k % 3) * 2; x = 4 + (k * 7) % 9
            if y < 14: c.put(x, y, hx('#d8b0ff' if k % 2 else '#b88aff'))
        if f >= 4: c.disc(8, 10, (f - 3) * 2, hx('#e8d8ff'), 200 - (f - 4) * 80, sq=0.5)
    return c.im


GLYPHS = ['bounce', 'affection', 'antiEntropy', 'potential', 'metabolism', 'stench', 'viscosity', 'displacement', 'entanglement', 'multiplicity', 'autoRepair']
HEART = ["k.k", "kkk", ".k."]


def glyph(g, f):
    c = Cv(32, 32); R = random.Random(GLYPHS.index(g) * 31 + f)
    if g == 'bounce':          # a shove: an arc of force thrown outward, the attacker pushed away
        r = 4 + f * 3
        for k in range(-5, 6):
            t = -0.3 + k * 0.12; c.put(16 + math.cos(t) * r, 16 + math.sin(t) * r, hx('#cfe6ff'), 255 - f * 35)
        c.line(16 + r - 3, 16, 16 + r + 2, 16, W, 200 - f * 30)
    elif g == 'affection':     # hearts float up from the attacker: charmed
        for k in range(3):
            x, y = 9 + k * 6, 22 - f * 3 - (k % 2) * 3
            for j, row in enumerate(HEART):
                for i, ch in enumerate(row):
                    if ch == 'k': c.put(x + i, y + j, hx('#ff7ab0' if k != 1 else '#ffb0d0'), 255 - f * 30)
    elif g == 'antiEntropy':   # frost to the attacker, fire to the wearer: blue flakes and an ember swirl
        for k in range(6):
            t = k / 6 * 6.2832 + f * 0.5; r = 4 + f * 1.6
            c.plus(16 + math.cos(t) * r, 16 + math.sin(t) * r * 0.7, hx('#bfe8ff') if k % 2 else hx('#ff9a3a'), 1)
    elif g == 'potential':     # the armour discharges: a crackle of yellow lightning
        x, y = 16, 4
        for s in range(6):
            nx, ny = x + R.choice((-3, -2, 2, 3)), y + 4
            if f < 4: c.line(x, y, nx, ny, hx('#ffff8a' if f % 2 == 0 else '#ffffff'))
            x, y = nx, ny
        if f < 3: c.glow(16, 16, 3, [W, hx('#ffff8a')])
    elif g == 'metabolism':    # the wearer healed at the cost of hunger: a green «+» rising, an amber crumb falling
        c.plus(16, 18 - f * 2, hx('#7ad05a'), 2, a=255 - f * 30); c.put(12, 12 + f * 2, hx('#ffb84a'))
    elif g == 'stench':        # a puff of foul green gas
        for k in range(5):
            t = k / 5 * 6.2832; r = 2 + f * 1.8
            c.disc(16 + math.cos(t) * r, 18 + math.sin(t) * r * 0.6 - f, 2 + f * 0.4, hx('#8aa83a'), 200 - f * 30)
    elif g == 'viscosity':     # the blow sinks into the armour: violet ooze dripping slowly
        for k in range(3):
            x = 11 + k * 5; ln = min(10, 2 + f * 2 - k)
            if ln > 0: c.line(x, 10, x, 10 + ln, hx('#a070e0')); c.put(x, 10 + ln, hx('#d8b0ff'))
        c.line(9, 10, 23, 10, hx('#5a2c8c'))
    elif g == 'displacement':  # the wearer blinks away: a violet shimmer folding into itself
        r = max(1, 10 - f * 2)
        c.ring(16, 16, r, hx('#b88aff'), 230, w=2, sq=0.8); c.ring(16, 16, r + 3, hx('#d8b0ff'), 120, sq=0.8)
    elif g == 'entanglement':  # roots burst from the ground and hold
        for k in range(4):
            x0 = 8 + k * 5; h = min(14, f * 3 + k % 2 * 2)
            for y in range(h):
                c.put(x0 + round(math.sin((y + k) * 0.8) * 1.2), 28 - y, hx('#6a4a2a' if y % 3 else '#8a6a3a'))
            if h > 2: c.put(x0, 28 - h, hx('#7ad05a'))
    elif g == 'multiplicity':  # a pale double steps out of the wearer
        dx = f * 2
        for y in range(8, 26):
            for x in (12, 13, 18, 19):
                if (x + y) % 2 == 0: c.put(x + dx, y, hx('#e8f4ff'), 200 - f * 25)
        c.disc(16 + dx, 9, 3, hx('#e8f4ff'), 160 - f * 20)
    else:                      # autoRepair: golden motes mend the armour's cracks
        for k in range(4):
            t = k / 4 * 6.2832 + f * 0.6; r = 9 - f
            c.plus(16 + math.cos(t) * r, 16 + math.sin(t) * r * 0.8, hx('#ffcc66'), 1, tip=hx('#ffeba4'))
        if f >= 4: c.glow(16, 16, 2, [hx('#fffad6'), hx('#ffcc66')])
    return c.im


BELL = ["....kkk....", "...kgggk...", "..kgllggk..", "..kglgggk..", "..kgggggk..", ".kgggggggk.", "kkkkkkkkkkk", "....kek...."]


def alarm(f):
    c = Cv(32, 32); swing = [-2, 0, 2, 0, -2, 0][f]
    for j, row in enumerate(BELL):
        for i, ch in enumerate(row):
            if ch != '.': c.put(10 + i + round(swing * j / 7), 6 + j, hx({'k': '#3a2a10', 'g': '#ffcc66', 'l': '#ffeba4', 'e': '#e8641f'}[ch]))
    for k in range(2):
        r = 6 + ((f + k * 3) % 6) * 2.2
        c.ring(16, 10, r, hx('#ff5a3a'), 220 - ((f + k * 3) % 6) * 35, sq=0.8, gap=(5, 2))
    return c.im


if __name__ == '__main__':
    save(rows([strip([sheep(v, f) for f in range(6)]) for v in (0, 1)]), 'fx/minor/sheep.png')
    save(strip([thorns(f) for f in range(6)]), 'fx/minor/thorns.png')
    save(strip([sleep(f) for f in range(6)]), 'fx/minor/sleep.png')
    save(strip([mirror(f) for f in range(6)]), 'fx/minor/mirror.png')
    save(strip([purity(f) for f in range(8)]), 'fx/minor/purity.png')
    save(strip([levitate(f) for f in range(6)]), 'fx/minor/levitate.png')
    save(rows([strip([status(k, f) for f in range(6)]) for k in ('slow', 'poison', 'out', 'in')]), 'fx/minor/status.png')
    save(rows([strip([glyph(g, f) for f in range(6)]) for g in GLYPHS]), 'fx/minor/glyphs.png')
    save(strip([alarm(f) for f in range(6)]), 'fx/minor/alarm.png')
    print('minor art')
