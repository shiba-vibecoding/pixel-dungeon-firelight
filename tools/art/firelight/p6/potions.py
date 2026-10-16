# Firelight · part 6: potions. The splash of a thrown flask in each of the 12 colours of PD 1.9 (6 frames 32 x 32, one row per colour,
# in the order of POTION_COLORS) and the tiles of the clouds that lie on the floor: 16 x 16, 4 frames, three thicknesses (rows),
# lit from above-left and seen at 70 degrees (a little flattened, the shadow under each puff).
import math, random
from PIL import Image
from px import *

COLORS = ['turquoise', 'crimson', 'azure', 'jade', 'golden', 'magenta', 'charcoal', 'ivory', 'amber', 'bistre', 'indigo', 'silver']
LIQ = dict(turquoise=('#17c3e6', '#0f8299'), crimson=('#ff002a', '#b3001e'), azure=('#1940ff', '#122db3'), jade=('#00b34a', '#007330'),
           golden=('#ccaa00', '#8c7500'), magenta=('#cc0098', '#8c0069'), charcoal=('#404040', '#1a1a1a'), ivory=('#f3ebda', '#b3ada1'),
           amber=('#f38b24', '#b3671b'), bistre=('#603913', '#331e0a'), indigo=('#6800b3', '#430073'), silver=('#919999', '#494d4d'))
NAMES = dict(turquoise=('turquoise', 'бирюзовое'), crimson=('crimson', 'багровое'), azure=('azure', 'лазурное'), jade=('jade', 'нефритовое'), golden=('golden', 'золотое'),
             magenta=('magenta', 'пурпурное'), charcoal=('charcoal', 'угольное'), ivory=('ivory', 'слоновой кости'), amber=('amber', 'янтарное'), bistre=('bistre', 'бурое'),
             indigo=('indigo', 'индиго'), silver=('silver', 'серебристое'))
GLASS = hx('#e8f4ff'), hx('#a8c0d0')


def splash(color):
    lt, dk = hx(LIQ[color][0]), hx(LIQ[color][1]); hi = mix(lt, (255, 255, 255), 0.55); fr = []
    R = random.Random(sum(map(ord, color)))
    drops = [(R.uniform(0, 6.283), R.uniform(6, 13), R.uniform(0.8, 1.6)) for _ in range(10)]
    shards = [(R.uniform(0, 6.283), R.uniform(4, 12)) for _ in range(6)]
    for f in range(6):
        c = Cv(32, 32); t = f / 5
        pr = [0, 3, 6, 8, 9, 9][f]       # the puddle spreading on the floor, a little flattened
        if pr:
            c.disc(16, 20, pr, dk, 255 if f < 5 else 150, sq=0.7); c.disc(15, 19, pr * 0.65, lt, 255 if f < 5 else 140, sq=0.7)
            if f < 5: c.put(13, 18, hi); c.put(14, 18, hi)
        if f == 0:      # the flask bursting
            c.disc(16, 16, 4, lt); c.disc(16, 16, 2.5, hi); c.ring(16, 16, 5, GLASS[0], 255)
        for ang, d, s in drops:
            if 1 <= f <= 3:
                k = f / 3; x = 16 + math.cos(ang) * d * k; y = 16 + math.sin(ang) * d * k * 0.7 - math.sin(k * 3.14) * 6
                c.disc(x, y, s * (1.2 - k * 0.4), lt); c.put(x - 0.5, y - 0.5, hi)
        for ang, d in shards:
            k = min(1, (f + 1) / 3); x = 16 + math.cos(ang) * d * k; y = 20 + math.sin(ang) * d * k * 0.7
            c.put(x, y, GLASS[0] if f < 4 else GLASS[1], 255 if f < 5 else 160)
        fr.append(c.im)
    return fr


GAS = {   # (light, mid, shade, dark) and a speck colour; how the puffs stand
    'toxic':     dict(ramp=['#c8ff9a', '#7fdc4a', '#4aa82a', '#245a1a'], alpha=190, en='Toxic gas', ru='Ядовитый газ'),
    'paralytic': dict(ramp=['#fffcc0', '#f0e070', '#c8b040', '#7a6a20'], alpha=190, en='Paralytic gas', ru='Парализующий газ'),
    'smoke':     dict(ramp=['#c8c8c4', '#9a9a96', '#6a6a66', '#3a3a38'], alpha=210, en='Smoke (smoke bomb)', ru='Дым (дымовая шашка)'),
    'frost':     dict(ramp=['#ffffff', '#e4f8ff', '#ace8ff', '#5a9ac8'], alpha=180, en='Freezing mist', ru='Ледяной туман'),
    'web':       dict(ramp=['#f2f2ec', '#c8c8c0', '#8a8a84', '#4a4a46'], alpha=230, web=True, en='Web', ru='Паутина'),
    'fire':      dict(ramp=['#fff6c8', '#ffcc66', '#ff7a2a', '#c0301a'], alpha=255, fire=True, en='Fire', ru='Огонь'),
    'purity':    dict(ramp=['#ffffff', '#fff6c8', '#e0f0ff', '#a8c8e8'], alpha=200, purity=True, en='Purity (clears gas)', ru='Очищение (снимает газ)'),
}


def gas_tile(kind, dens, f):
    """One cell of cloud: dens 0 thin, 1 mid, 2 thick; frame f of 4 (the puffs drift and swell)."""
    st = GAS[kind]; ramp = [hx(c) for c in st['ramp']]; c = Cv(16, 16); A = st['alpha']
    R = random.Random(dens * 31 + sum(map(ord, kind)))
    if st.get('web'):
        k = [0.5, 0.75, 1][dens]
        for i in range(4):
            ang = i * 0.785 + 0.2; c.line(8 - math.cos(ang) * 8, 8 - math.sin(ang) * 8, 8 + math.cos(ang) * 8, 8 + math.sin(ang) * 8, ramp[1], int(200 * k))
        for r in (2, 4.5, 7)[:dens + 1]: c.ring(8, 8, r, ramp[0], int(220 * k), gap=(5, 1))
        return c.im
    if st.get('fire'):          # tongues of flame: a yellow core, orange, a red edge, licking up from the floor
        n = [2, 3, 4][dens]
        for i in range(n):
            bx = [8, 5, 11, 8][i] if n > 1 else 8; bx += [0, -1, 1, 0][(i + f) % 4] * 0.5
            h = [6, 9, 12][dens] - [0, 2, 3, 1][i] + [0, 1, 0, -1][(f + i) % 4]; w = [2.6, 3.2, 3.8][dens] - i * 0.3
            for y in range(int(h)):
                k = y / h; ww = w * (1 - k) ** 0.8; xc = bx + math.sin(f * 1.6 + i + y * 0.5) * 0.6 * k * 2
                for x in range(int(xc - ww - 1), int(xc + ww + 2)):
                    d = abs(x - xc) / max(0.5, ww)
                    if d > 1: continue
                    col = ramp[0] if d < 0.3 and k < 0.6 else (ramp[1] if d < 0.6 else (ramp[2] if d < 0.85 else ramp[3]))
                    c.put(x, 15 - y, col)
        return c.im
    if st.get('purity'):
        for i in range([3, 5, 8][dens]):
            x, y = R.randint(1, 14), R.randint(1, 14); k = (f + i) % 4
            c.plus(x, y, ramp[0] if k < 2 else ramp[2], 1 if k == 0 else 0, 230)
        return c.im
    # a cloud: a soft body that fills the cell and runs into its neighbours (a dithered edge), pale puffs swelling on it, no hard shadow
    k = [0.45, 0.7, 1.0][dens]
    for y in range(16):
        for x in range(16):
            d = math.hypot((x - 7.5) / 9.5, (y - 7.5) / 9)
            if dens > 0 or d < 0.8 or (d < 1 and (x + y + f) % 2 == 0): c.put(x, y, ramp[2], int(A * 0.5 * k))   # mid and thick fill the cell edge to edge
    puffs = [(R.uniform(3, 13), R.uniform(3, 13), R.uniform(3.6, 5.2)) for _ in range([2, 3, 4][dens])]
    for i, (x, y, r) in enumerate(puffs):
        ph = f * 1.57 + i; x += math.sin(ph) * 0.8; y += math.cos(ph) * 0.6; r *= 1 + 0.1 * math.sin(ph * 1.3)
        for yy in range(int(y - r - 1), int(y + r + 2)):
            for xx in range(int(x - r - 1), int(x + r + 2)):
                d = math.hypot(xx - x, (yy - y) / 0.9) / r
                if d < 0.7 or (d < 1 and (xx + yy + f) % 2 == 0): c.put(xx, yy, ramp[1], int(A * 0.6 * k))
        c.disc(x - 1, y - 1.2, r * 0.3, ramp[0], int(A * 0.55 * k), sq=0.9)
    if kind == 'frost':
        for i in range(dens + 1): c.put(R.randint(2, 13), R.randint(2, 13), hx('#ffffff'))
    return c.im


if __name__ == '__main__':
    sp = [strip(splash(c)) for c in COLORS]; save(rows(sp), 'potions/splash.png')
    for c in COLORS: gif(splash(c), f'potion-{c}.gif', 80, 4, hold=3)
    for k in GAS:
        sheet = rows([strip([gas_tile(k, d, f) for f in range(4)]) for d in range(3)]); save(sheet, f'gas/{k}.png')
        # a 4 x 3 patch of cloud, thick in the middle, for the preview
        frames = []
        for f in range(4):
            patch = Image.new('RGBA', (64, 48), (0, 0, 0, 0))
            for y in range(3):
                for x in range(4):
                    d = 2 if (1 <= x <= 2 and y == 1) else (1 if (x in (1, 2) or y == 1) else 0)
                    patch.alpha_composite(gas_tile(k, d, (f + x + y) % 4), (x * 16, y * 16))
            frames.append(patch)
        gif(frames * 2, f'gas-{k}.gif', 160, 4)
    print('potions ok')
