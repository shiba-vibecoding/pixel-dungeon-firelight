# Firelight · part 6: the waves of the scrolls read aloud. Each: a ring growing over 8 frames in a 48 x 48 cell (the renderer shows it
# at x1 for 3 cells across and x2 for 6, whole steps only), the specks it throws (16 x 16, 4 frames) and the screen's tint and shake.
import math, random
from px import *

WAVES = {
    'challenge': dict(ramp=['#fff6c8', '#ff9a3a', '#e0402a', '#8a1a14'], jag=1.4, w=3, en='Challenge', ru='Вызов'),
    'terror':    dict(ramp=['#e8a0ff', '#8a4ac0', '#5a2a8a', '#2a1040'], jag=0.8, w=3, en='Terror', ru='Ужас'),
    'lullaby':   dict(ramp=['#ffffff', '#dff0ff', '#bfe0ff', '#7aa8d8'], jag=0.0, w=2, dash=True, en='Lullaby', ru='Колыбельная'),
    'psionic':   dict(ramp=['#ffffff', '#f0f4ff', '#c8d4ff', '#8a9ad8'], jag=0.0, w=1, double=True, en='Psionic Blast', ru='Псионика'),
}


def ring_frames(key):
    st = WAVES[key]; ramp = [hx(c) for c in st['ramp']]; fr = []
    for f in range(8):
        c = Cv(48, 48); t = f / 7; r = 3 + t * 20; fade = 1 - max(0, t - 0.55) / 0.45
        a = int(255 * fade)
        if key == 'challenge':
            c.ring(24, 24, r, ramp[3], a, w=st['w'] + 1, jag=st['jag'], seed=f)
            c.ring(24, 24, r - 1, ramp[2], a, w=2, jag=st['jag'], seed=f + 9)
            c.ring(24, 24, r - 2, ramp[1], a, w=1, jag=st['jag'] * 0.6, seed=f + 3)
            R = random.Random(f)
            for i in range(10):     # spikes thrown outward
                ang = i / 10 * 6.283 + f * 0.2; c.line(24 + math.cos(ang) * (r + 1), 24 + math.sin(ang) * (r + 1), 24 + math.cos(ang) * (r + 3), 24 + math.sin(ang) * (r + 3), ramp[1], a)
            if f < 2: c.glow(24, 24, 6 - f * 2, ramp)
        elif key == 'terror':
            R = random.Random(f * 3)
            for i in range(int(r * 6)):
                ang = i / (r * 6) * 6.283; rr = r + math.sin(ang * 5 + f) * 1.4
                for d in range(3): c.put(24 + math.cos(ang) * (rr - d), 24 + math.sin(ang) * (rr - d), ramp[1 + d], int(a * (1 - d * 0.25)))
            c.ring(24, 24, max(1, r - 4), ramp[3], int(a * 0.6), w=2)
            if f < 3: c.disc(24, 24, 3 - f, ramp[3])
        elif key == 'lullaby':
            c.ring(24, 24, r, ramp[2], a, w=2, gap=(6, 3))
            c.ring(24, 24, max(1, r - 3), ramp[1], int(a * 0.6), w=1, gap=(4, 2))
            if f < 2: c.glow(24, 24, 3, ramp[1:])
        elif key == 'psionic':
            c.ring(24, 24, r, ramp[0], a, w=1); c.ring(24, 24, max(1, r - 3), ramp[2], int(a * 0.8), w=1)
            R = random.Random(f * 7)
            for i in range(5):     # crackle
                ang = R.uniform(0, 6.283); x0, y0 = 24 + math.cos(ang) * (r - 3), 24 + math.sin(ang) * (r - 3)
                c.line(x0, y0, x0 + math.cos(ang + 0.6) * 3, y0 + math.sin(ang + 0.6) * 3, ramp[1], a)
            if f == 0: c.disc(24, 24, 4, ramp[0])
        fr.append(c.im)
    return fr


def specks(key):
    """16 x 16, 4 frames, thrown about by the wave: sparks, skull wisps, notes, glints."""
    fr = []
    for f in range(4):
        c = Cv(16, 16)
        if key == 'challenge':
            c.plus(8, 8, hx('#fff6c8') if f < 2 else hx('#ff9a3a'), 2 - f // 2, 255 - f * 50, hx('#e0402a'))
        elif key == 'terror':
            sk = grid(['.aaa.', 'abaab', 'aaaaa', '.a.a.'], dict(a=hx('#c8a0e0'), b=hx('#2a1040')))
            sk2 = sk.copy(); sk2.putalpha(sk2.getchannel('A').point(lambda v: int(v * (1 - f * 0.22))))
            c.blit(sk2, 5 + (f % 2), 5 - f)
            for i in range(f + 1): c.put(7 + i, 11 - f + i, hx('#5a2a8a'), 180)
        elif key == 'lullaby':
            note = grid(['...aa', '...ab', '...a.', '...a.', '.aaa.', 'aaaa.', '.aa..'], dict(a=hx('#dff0ff'), b=hx('#bfe0ff')))
            n2 = note.copy(); n2.putalpha(n2.getchannel('A').point(lambda v: int(v * (1 - f * 0.2))))
            c.blit(n2, 5 + round(math.sin(f * 1.6)), 4 - f)
        elif key == 'psionic':
            c.plus(8, 8, hx('#ffffff'), [2, 1, 1, 0][f], 255 - f * 40, hx('#c8d4ff'))
        fr.append(c.im)
    return fr


if __name__ == '__main__':
    for key in WAVES:
        r = ring_frames(key); s = specks(key)
        save(strip(r), f'waves/{key}-ring.png'); save(strip(s), f'waves/{key}-specks.png')
        gif(r, f'wave-{key}.gif', 80, 3, hold=3)
    print('waves ok')
